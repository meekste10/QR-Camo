export function createThresholdMaskCanvas({
  image,
  size = 800,
  threshold = 180,
  invert = false,
  targetFill = 0.9
}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const scale = Math.min(
    (size * targetFill) / image.width,
    (size * targetFill) / image.height
  );

  const drawW = Math.round(image.width * scale);
  const drawH = Math.round(image.height * scale);
  const drawX = Math.floor((size - drawW) / 2);
  const drawY = Math.floor((size - drawH) / 2);

  ctx.drawImage(image, drawX, drawY, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, size, size);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];

    if (a === 0) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      continue;
    }

    const gray = Math.round((r + g + b) / 3);
    let inside = gray < threshold;

    if (invert) inside = !inside;

    if (inside) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    } else {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
