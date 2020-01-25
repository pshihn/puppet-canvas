import { createCanvas, close } from './puppet-canvas';

(async () => {
  try {
    const canvas = await createCanvas(600, 400);
    console.log('canvas', await canvas.width, await canvas.height);
    const ctx = (await canvas.getContext('2d'))!;
    ctx.lineWidth = 10;
    ctx.strokeRect(75, 140, 150, 110);
    ctx.fillRect(130, 190, 40, 60);
    ctx.moveTo(50, 140);
    ctx.lineTo(150, 60);
    ctx.lineTo(250, 140);
    ctx.closePath();
    await ctx.stroke();
  } catch (err) {
    console.error(err);
  }
  close();
})();