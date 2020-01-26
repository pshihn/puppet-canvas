import { createCanvas, close } from './puppet-canvas';

(async () => {
  try {
    const canvas = await createCanvas(400, 400);
    const ctx = (await canvas.getContext('2d'))!;

    // GRADIENT
    // const gradient = await ctx.createLinearGradient(20, 0, 220, 0);
    // gradient.addColorStop(0, 'green');
    // gradient.addColorStop(.5, 'cyan');
    // gradient.addColorStop(1, 'green');
    // ctx.fillStyle = gradient;
    // await ctx.fillRect(20, 20, 200, 100);

    // Create + Put Image data
    // const imageData = await ctx.createImageData(10, 10);
    // const dataArray = await imageData.data;
    // const dataLength = await dataArray.length;
    // for (let i = 0; i < dataLength; i += 4) {
    //   dataArray[i + 0] = 190;  // R value
    //   dataArray[i + 1] = 0;    // G value
    //   dataArray[i + 2] = 210;  // B value
    //   dataArray[i + 3] = 255;  // A value
    // }
    // await ctx.putImageData(imageData, 20, 20);

    // Get + Put Image data
    // ctx.rect(10, 10, 100, 100);
    // await ctx.fill();
    // const imageData = await ctx.getImageData(60, 60, 200, 100);
    // await ctx.putImageData(imageData, 150, 10);


    // HOUSE
    ctx.lineWidth = 10;
    ctx.strokeRect(75, 140, 150, 110);
    ctx.fillRect(130, 190, 40, 60);
    ctx.moveTo(50, 140);
    ctx.lineTo(150, 60);
    ctx.lineTo(250, 140);
    ctx.closePath();
    ctx.stroke();

    // const dataUrl = await canvas.toDataURL();

    // const image = await loadImage(dataUrl, canvas);
    // await ctx.drawImage(image, 100, 100);
  } catch (err) {
    console.error(err);
  }
  close();
})();