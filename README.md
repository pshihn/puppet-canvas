# puppet-canvas

puppet-canvas is a [Puppeteer](https://github.com/puppeteer/puppeteer) backed implementation of HTML Canvas API for NodeJS. 

## Installation

```bash
$ npm install puppet-canvas --save
```

## Usage

Following example shows how to draw a house 

```javascript
import { createCanvas, close } from './puppet-canvas';
// OR const { createCanvas, close } = require('puppet-canvas')

async(() => {

const canvas = await createCanvas(400, 400);
const ctx = await canvas.getContext('2d');

// Draw a house
ctx.lineWidth = 10;
ctx.strokeRect(75, 140, 150, 110);
ctx.fillRect(130, 190, 40, 60);
ctx.moveTo(50, 140);
ctx.lineTo(150, 60);
ctx.lineTo(250, 140);
ctx.closePath();
ctx.stroke();

// Get the image as a data url
const dataUrl = await canvas.toDataURL();
await close();

})();
```

### Using images

To use external images in your canvas, first load the image using the `loadImage` method.

```javascript
const canvas = await createCanvas(400, 400);
const ctx = await canvas.getContext('2d');
const image = await loadImage('https://....', canvas);
await ctx.drawImage(image, 100, 100);
```

### Using complex objects

Any non-serializable object returned by puppeteer is automatically proxied as well. So one can use/pass more complex objects like a gradient:

```javascript
const gradient = await ctx.createLinearGradient(20, 0, 220, 0);
gradient.addColorStop(0, 'green');
gradient.addColorStop(.5, 'cyan');
gradient.addColorStop(1, 'green');
ctx.fillStyle = gradient;
ctx.fillRect(20, 20, 200, 100);
```

## Implementation
puppet-canvas creates an instance of a canvas on a puppeteer instance, and exposes the API via a JavaScript Proxy. 

A side effect of this is that all calls, essentially become `async`. For normal drawing, one doesn't need to `await` each command unless a value is being read. 

## Full API

#### createCanvas(width: number, height: number) => Promise\<HTMLCanvasElement\>
  
Creates a canvas instance with the specified width and height (in pixels)

#### linkCanvas(canvas: ElementHandle\<HTMLCanvasElement\>) => Promise\<HTMLCanvasElement\>

Say, you want to use this with an existing instance of puppeteer, you can pass in the ElementHandle of the canvase in your page. 

#### close() => Promise

Close associated puppeteer instance. Usually called at the end.

#### releaseCanvas(canvas: HTMLCanvasElement) => Promise

Release the canvas instance, if you do not want puppet-canvas to proxy it anymore, but still want to keep the canvas instance around 

## License
[MIT License](https://github.com/pshihn/puppet-canvas/blob/master/LICENSE) (c) [Preet Shihn](https://twitter.com/preetster)
