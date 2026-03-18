import { extractTiles, buildWeightedTilePool } from "./tile-engine.js";

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

function isWhitePixel(data, index) {
  return data[index] > 250 && data[index + 1] > 250 && data[index + 2] > 250;
}

export function trimWhiteBorder(imageData, keepMarginPx = 1) {
  const { width, height, data } = imageData;

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  const rowHasDark = (y) => {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isWhitePixel(data, i)) return true;
    }
    return false;
  };

  const colHasDark = (x) => {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (!isWhitePixel(data, i)) return true;
    }
    return false;
  };

  while (top < height && !rowHasDark(top)) top++;
  while (bottom >= 0 && !rowHasDark(bottom)) bottom--;
  while (left < width && !colHasDark(left)) left++;
  while (right >= 0 && !colHasDark(right)) right--;

  if (top > bottom || left > right) return imageData;

  top = Math.max(0, top - keepMarginPx);
  left = Math.max(0, left - keepMarginPx);
  bottom = Math.min(height - 1, bottom + keepMarginPx);
  right = Math.min(width - 1, right + keepMarginPx);

  const newW = right - left + 1;
  const newH = bottom - top + 1;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sctx = sourceCanvas.getContext("2d");
  sctx.putImageData(imageData, 0, 0);

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = newW;
  targetCanvas.height = newH;
  const tctx = targetCanvas.getContext("2d");

  tctx.drawImage(sourceCanvas, left, top, newW, newH, 0, 0, newW, newH);

  return tctx.getImageData(0, 0, newW, newH);
}

export function innerCrop(imageData, insetPercent = 24) {
  const w = imageData.width;
  const h = imageData.height;

  const insetX = Math.floor(w * (insetPercent / 100));
  const insetY = Math.floor(h * (insetPercent / 100));

  const newW = Math.max(1, w - insetX * 2);
  const newH = Math.max(1, h - insetY * 2);

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
    insetX,
    insetY,
    newW,
    newH,
    0,
    0,
    newW,
    newH
  );

  return tctx.getImageData(0, 0, newW, newH);
}

export function imageDataToCanvas(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function estimateModuleSize(imageData) {
  const { width, height, data } = imageData;

  const sampleRows = [
    Math.floor(height * 0.25),
    Math.floor(height * 0.5),
    Math.floor(height * 0.75)
  ];

  const runLengths = [];

  for (const y of sampleRows) {
    let current = null;
    let run = 0;

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isBlack = data[i] < 128;

      if (current === null) {
        current = isBlack;
        run = 1;
      } else if (current === isBlack) {
        run++;
      } else {
        runLengths.push(run);
        current = isBlack;
        run = 1;
      }
    }

    if (run > 0) runLengths.push(run);
  }

  const filtered = runLengths.filter((v) => v >= 1 && v <= Math.max(width, height) / 4);
  if (!filtered.length) return 4;

  filtered.sort((a, b) => a - b);
  const lowerHalf = filtered.slice(0, Math.max(1, Math.floor(filtered.length * 0.35)));
  const avg = lowerHalf.reduce((a, b) => a + b, 0) / lowerHalf.length;

  return Math.max(1, Math.round(avg));
}

export function buildTilesFromQr({
  sourceQrCanvas,
  originalCanvas,
  thresholdCanvas,
  cropCanvas
}) {
  const srcCtx = sourceQrCanvas.getContext("2d", { willReadFrequently: true });
  const srcImageData = srcCtx.getImageData(0, 0, sourceQrCanvas.width, sourceQrCanvas.height);

  if (originalCanvas) {
    originalCanvas.width = sourceQrCanvas.width;
    originalCanvas.height = sourceQrCanvas.height;
    const octx = originalCanvas.getContext("2d");
    octx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    octx.drawImage(sourceQrCanvas, 0, 0);
  }

  const thresholded = threshold(
    new ImageData(
      new Uint8ClampedArray(srcImageData.data),
      srcImageData.width,
      srcImageData.height
    ),
    128
  );

  const trimmed = trimWhiteBorder(thresholded, 1);
  const cropped = innerCrop(trimmed, 24);
  const modulePixelSize = estimateModuleSize(cropped);

  if (thresholdCanvas) {
    thresholdCanvas.width = trimmed.width;
    thresholdCanvas.height = trimmed.height;
    thresholdCanvas.getContext("2d").putImageData(trimmed, 0, 0);
  }

  if (cropCanvas) {
    cropCanvas.width = cropped.width;
    cropCanvas.height = cropped.height;
    cropCanvas.getContext("2d").putImageData(cropped, 0, 0);
  }

  const extractedTiles = extractTiles(cropped, modulePixelSize);
  const tilePool = buildWeightedTilePool(extractedTiles);

  return {
    tiles: tilePool,
    thresholdCanvasForRender: imageDataToCanvas(thresholded),
    modulePixelSize
  };
}
