import { JSEvalable, SerializableOrJSHandle, ElementHandle, JSHandle } from 'puppeteer';
import { getBrowser, closeBrowser } from './brwoser';

type PropName = string | number;

type OpType = 'GET' | 'SET' | 'APPLY';

// Op describes the operation to ber performed in the browser
// along with any params needed to do so
interface Op {
  type: OpType;
  path?: PropName[];
  value?: any;
  args?: SerializableOrJSHandle[];
}

type ProxyHandler = (message: Op) => Promise<any>;

interface CanvasWindow {
  $puppetCanvasMap: Map<HTMLCanvasElement, Map<string, any>>;
}

type ReferenceType = '_deferred_';

interface DeferredReference {
  type: ReferenceType;
  id: string;
}

function proxy<T>(handler: ProxyHandler, path: string[] = [], refId?: string): T {
  const proxyInstance = new Proxy(function () { }, {
    get(_, prop: PropName, receiver: any): any {
      if (prop === '$puppetCanvasRefId' && refId) {
        return refId;
      }
      if (prop === 'then') {
        if (path.length === 0) {
          return { then: () => receiver };
        }
        const getter = handler({ type: 'GET', path });
        return getter.then.bind(getter);
      }
      return proxy(handler, path.concat(`${prop}`));
    },
    set(_, prop: PropName, value: any): boolean {
      handler({
        type: 'SET',
        path: path.concat(`${prop}`),
        value
      });
      return true;
    },
    apply(_, __, args): any {
      return handler({
        type: 'APPLY',
        path,
        args
      });
    }
  });
  return proxyInstance as any as T;
}

function createParamRef(param: any): any {
  if (param && param.$puppetCanvasRefId) {
    const deref: DeferredReference = {
      id: param.$puppetCanvasRefId,
      type: '_deferred_'
    };
    return deref;
  }
  return param;
}

function createHandler(canvasHandle: ElementHandle<HTMLCanvasElement>, proxyTarget?: JSEvalable<any>): ProxyHandler {
  return async (request: Op): Promise<any> => {
    try {
      // if any of the request args or values are proxied, replace them by handles
      if (request.value) {
        request.value = createParamRef(request.value);
      }
      if (request.args) {
        for (let i = 0; i < request.args.length; i++) {
          request.args[i] = createParamRef(request.args[i]);
        }
      }

      // Execute in browser
      const target = proxyTarget || canvasHandle;
      const result = await target.evaluate(async (jsTarget: any, canvasElement: HTMLCanvasElement, type: OpType, path: PropName[], value: any, ...args: SerializableOrJSHandle[]) => {
        // deref params
        const derefArg = (arg: any) => {
          if (arg && (typeof arg === 'object') && (arg as DeferredReference).type === '_deferred_') {
            const cw = self as any as CanvasWindow;
            const refMap = cw.$puppetCanvasMap.get(canvasElement);
            if (refMap) {
              return refMap.get((arg as DeferredReference).id);
            }
          }
          return arg;
        };
        value = derefArg(value);
        if (args) {
          for (let i = 0; i < args.length; i++) {
            args[i] = derefArg(args[i]);
          }
        }

        const reducePath = (list: PropName[]) => list.reduce<any>((o: any, prop) => (o ? o[prop] : o), jsTarget);
        const ref = reducePath(path);
        const refParent = reducePath(path.slice(0, -1));
        let out: any = null;
        switch (type) {
          case 'GET':
            out = ref;
            break;
          case 'SET':
            const prop = path.length && path.pop();
            if (prop) {
              refParent[prop] = value;
            }
            return true;
          case 'APPLY':
            out = await ref.apply(refParent, args);
        }

        // instead of returning an object, store the object ref in a map
        // The handle of this object is then later retrieved
        if (typeof out === 'object') {
          const cw = self as any as CanvasWindow;
          const refMap = cw.$puppetCanvasMap.get(canvasElement);
          if (refMap) {
            const refId = `${Date.now()}-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
            refMap.set(refId, out);
            const defref: DeferredReference = {
              id: refId,
              type: '_deferred_'
            };
            out = defref;
          } else {
            throw new Error('Canvas element not initialized as puppet-canvas');
          }
        }
        return out;
      }, canvasHandle, request.type, request.path || [], request.value, ...(request.args || []));


      if ((typeof result === 'object') && (result as DeferredReference).type === '_deferred_') {
        // Retrieve the object handle of the response object
        const refId = (result as DeferredReference).id;
        const deferredHandle = await getHandlyByRefId(canvasHandle, refId);
        return deferredHandle ? proxy(createHandler(canvasHandle, deferredHandle), [], refId) : null;
      }
      return result;
    } catch (err) {
      throw err;
    }
  };
}

async function getHandlyByRefId(canvasHandle: ElementHandle<HTMLCanvasElement>, refId: string): Promise<JSHandle> {
  return await canvasHandle.evaluateHandle((canvasElement: HTMLCanvasElement, refId: string) => {
    const cw = self as any as CanvasWindow;
    const refMap = cw.$puppetCanvasMap.get(canvasElement);
    if (refMap) {
      return refMap.get(refId);
    }
    return null;
  }, refId);
}

const proxyMap = new Map<any, ElementHandle<HTMLCanvasElement>>();

export async function linkCanvas(canvas: ElementHandle<HTMLCanvasElement>): Promise<HTMLCanvasElement> {
  return initializeCanvas(canvas);
}

export async function createCanvas(width: number, height: number): Promise<HTMLCanvasElement> {
  const html = `<canvas width="${width}" height="${height}"></canvas>`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html);
  const canvasElement: ElementHandle<HTMLCanvasElement> | null = await page.$('canvas');
  if (canvasElement) {
    return initializeCanvas(canvasElement);
  } else {
    throw new Error('Failed to initialize canvas in puppeteer');
  }
}

async function initializeCanvas(canvasHandle: ElementHandle<HTMLCanvasElement>): Promise<HTMLCanvasElement> {
  await canvasHandle.evaluate((canvas) => {
    const cw = self as any as CanvasWindow;
    if (!cw.$puppetCanvasMap) {
      cw.$puppetCanvasMap = new Map();
    }
    if (!cw.$puppetCanvasMap.has(canvas)) {
      cw.$puppetCanvasMap.set(canvas, new Map());
    }
  });
  const p = proxy<HTMLCanvasElement>(createHandler(canvasHandle));
  proxyMap.set(p, canvasHandle);
  return p;
}

export async function releaseCanvas(canvas: HTMLCanvasElement): Promise<void> {
  if (proxyMap.has(canvas)) {
    const handle = proxyMap.get(canvas)!;
    await handle.evaluate((canvas: HTMLCanvasElement) => {
      const cw = self as any as CanvasWindow;
      if (cw.$puppetCanvasMap) {
        cw.$puppetCanvasMap.delete(canvas);
      }
    });
  }
}

export async function close(): Promise<void> {
  return closeBrowser();
}