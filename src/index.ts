import { createCanvas, close } from './puppet-canvas';

(async () => {
  try {
    const canvas = await createCanvas(600, 400);
    const ctx = (await canvas.getContext('2d'))!;


    // const gradient = await ctx.createLinearGradient(20, 0, 220, 0);
    // // Add three color stops
    // await gradient.addColorStop(0, 'green');
    // await gradient.addColorStop(.5, 'cyan');
    // await gradient.addColorStop(1, 'green');
    // // Set the fill style and draw a rectangle
    // ctx.fillStyle = gradient;
    // await ctx.fillRect(20, 20, 200, 100);


    ctx.lineWidth = 10;
    // console.log(await ctx.lineWidth);
    // ctx.strokeRect(75, 140, 150, 110);
    // ctx.fillRect(130, 190, 40, 60);
    // ctx.moveTo(50, 140);
    // ctx.lineTo(150, 60);
    // ctx.lineTo(250, 140);
    // ctx.closePath();
    // await ctx.stroke();
  } catch (err) {
    console.error(err);
  }
  close();
})();