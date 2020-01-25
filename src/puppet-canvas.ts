import puppeteer, { Browser, JSEvalable, SerializableOrJSHandle } from 'puppeteer';

type OpType = 'GET' | 'SET' | 'APPLY';

interface NodeOp {
  type: OpType;
  path?: string[];
  value?: any;
  args?: SerializableOrJSHandle[];
}
type ProxyHandler = (message: NodeOp) => Promise<any>;

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser) {
    _browser = await puppeteer.launch({ headless: false });
  }
  return _browser;
}

function proxy<T>(handler: ProxyHandler, path: string[] = []): T {
  const proxyInstance = new Proxy(function () { }, {
    get(_, prop: string | number, receiver: any): any {
      if (prop === 'then') {
        if (path.length === 0) {
          return { then: () => receiver };
        }
        const getter = handler({ type: 'GET', path });
        return getter.then.bind(getter);
      }
      return proxy(handler, path.concat(`${prop}`));
    },
    set(_, prop: string | number, value: any): boolean {
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

function createHandler(target: JSEvalable<any>): ProxyHandler {
  return async (request: NodeOp): Promise<any> => {
    try {
      const result = await target.evaluate(async (jsTarget: any, type: OpType, path: string[], value: any, ...args: SerializableOrJSHandle[]) => {
        const reducePath = (list: string[]) => list.reduce<any>((o: any, prop) => (o ? o[prop] : o), jsTarget);
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
        if (typeof out === 'object') {
          (self as any).$canvasProxyDeferredResult = out;
          out = '_defer_';
        } else {
          (self as any).$canvasProxyDeferredResult = undefined;
        }
        return out;
      }, request.type, request.path || [], request.value, ...(request.args || []));

      if (result === '_defer_') {
        const jsHandle = await target.evaluateHandle(() => {
          return (self as any).$canvasProxyDeferredResult || null;
        });
        return jsHandle ? proxy(createHandler(jsHandle)) : null;
      }
      return result;
    } catch (err) {
      throw err;
    }
  };
}

export async function createCanvas(width: number, height: number): Promise<HTMLCanvasElement> {
  const html = `
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <canvas width="${width}" height="${height}"></canvas>
  </body>
</html>
`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html);
  const canvasElement = await page.$('canvas');
  if (!canvasElement) {
    throw new Error('Failed to initialize canvas in puppeteer');
  }
  return proxy<HTMLCanvasElement>(createHandler(canvasElement));
}

export async function close(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}