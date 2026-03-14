export function threshold(imageData, thresholdValue = 128) {
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = avg > thresholdValue ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  return imageData;
}

export function cropInterior(imageData, cropPercent) {
  const w = imageData.width;
  const h = imageData.height;

  const cropX = Math.floor(w * (cropPercent / 100));
  const cropY = Math.floor(h * (cropPercent / 100));

  const newW = Math.max(1, w - cropX * 2);
  const newH = Math.max(1, h - cropY * 2);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = w;
  sourceCanvas.height = h;
  const sctx = sourceCanvas.getContext("2d");
  sctx.putImageData(imageData, 0, 0);

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = newW;
  targetCanvas.height = newH;
  const tctx = targetCanvas.getContext("2d");

  tctx.drawImage(
    sourceCanvas,
    cropX, cropY, newW, newH,
    0, 0, newW, newH
  );

  return tctx.getImageData(0, 0, newW, newH);
}
