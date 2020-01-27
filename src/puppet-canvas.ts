import { JSEvalable, SerializableOrJSHandle, ElementHandle, JSHandle, Page, ScreenshotOptions } from 'puppeteer';
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
      // if any of the request args or values are proxied, replace them by their handles
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
        // de-ref params
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
    return initializeCanvas(canvasElement, page);
  } else {
    throw new Error('Failed to initialize canvas in puppeteer');
  }
}

interface CanvasProxyMapRecord {
  canvasHandle: ElementHandle<HTMLCanvasElement>;
  page?: Page;
}

const proxyMap = new Map<HTMLCanvasElement, CanvasProxyMapRecord>();

async function initializeCanvas(canvasHandle: ElementHandle<HTMLCanvasElement>, page?: Page): Promise<HTMLCanvasElement> {
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
  proxyMap.set(p, {
    canvasHandle: canvasHandle,
    page
  });
  return p;
}

export async function screenshotCanvas(canvas: HTMLCanvasElement, options?: ScreenshotOptions): Promise<string | Buffer> {
  if (proxyMap.has(canvas)) {
    const canvasHandle = proxyMap.get(canvas)!.canvasHandle;
    return canvasHandle.screenshot(options);
  } else {
    throw new Error('Canvas element not initialized as puppet-canvas');
  }
}

export async function releaseCanvas(canvas: HTMLCanvasElement): Promise<void> {
  if (proxyMap.has(canvas)) {
    const handle = proxyMap.get(canvas)!;
    await handle.canvasHandle.evaluate((canvas: HTMLCanvasElement) => {
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

export async function loadFont(name: string, url: string, canvas: HTMLCanvasElement): Promise<void> {
  const cachedRecord = proxyMap.get(canvas);
  if (cachedRecord) {
    await cachedRecord.canvasHandle.evaluate(async (_, fontName: string, fontUrl: string) => {
      console.log('ff', fontName, fontUrl);
      //@ts-ignore
      const ff = new FontFace(fontName, `url(${fontUrl})`);
      await ff.load();
      (document as any).fonts.add(ff);
    }, name, url);
  } else {
    throw new Error('Canvas element not initialized as puppet-canvas');
  }
}

export async function loadImage(url: string, canvas: HTMLCanvasElement, page?: Page): Promise<HTMLImageElement> {
  const cachedRecord = proxyMap.get(canvas);
  const pageToUse = (cachedRecord && cachedRecord.page) || page;
  if (pageToUse) {
    const canvasHandle = cachedRecord!.canvasHandle;
    const imageRef = await pageToUse.evaluate((canvasElement: HTMLCanvasElement, url: string) => {
      return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        img.onerror = () => reject(new Error('Image load error'));
        img.onabort = () => reject(new Error('Image load aborted'));
        img.onload = () => {
          const cw = self as any as CanvasWindow;
          const refMap = cw.$puppetCanvasMap.get(canvasElement);
          if (refMap) {
            const refId = `${Date.now()}-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
            refMap.set(refId, img);
            const defref: DeferredReference = {
              id: refId,
              type: '_deferred_'
            };
            resolve(defref);
          }
        };
        img.src = url;
      });
    }, canvasHandle, url);
    if (imageRef) {
      const refId = (imageRef as DeferredReference).id;
      const deferredHandle = await getHandlyByRefId(canvasHandle, refId);
      return proxy(createHandler(canvasHandle, deferredHandle), [], refId);
    } else {
      throw new Error('Failed to load image');
    }
  } else {
    throw new Error('No reference page found for this canvas');
  }
}