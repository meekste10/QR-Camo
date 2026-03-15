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

function nearestValidQrModuleCount(approxCount) {
  // QR versions: 21 + 4*(version-1)
  let best = 21;
  let bestDiff = Infinity;

  for (let version = 1; version <= 40; version++) {
    const count = 21 + 4 * (version - 1);
    const diff = Math.abs(count - approxCount);
    if (diff < bestDiff) {
      best = count;
      bestDiff = diff;
    }
  }

  return best;
}

export function normalizeQrToModuleGrid(imageData) {
  const modulePixelSize = estimateModuleSize(imageData);
  const approxModuleCount = Math.round(imageData.width / modulePixelSize);
  const moduleCount = nearestValidQrModuleCount(approxModuleCount);

  const sourceCanvas = imageDataToCanvas(imageData);

  // Build a 1-pixel-per-module logical canvas
  const moduleCanvas = document.createElement("canvas");
  moduleCanvas.width = moduleCount;
  moduleCanvas.height = moduleCount;
  const mctx = moduleCanvas.getContext("2d");
  mctx.imageSmoothingEnabled = false;

  mctx.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    0,
    0,
    moduleCount,
    moduleCount
  );

  // Re-threshold after resampling to snap cells cleanly
  const img = mctx.getImageData(0, 0, moduleCount, moduleCount);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = avg > 128 ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  mctx.putImageData(img, 0, 0);

  return {
    moduleCanvas,
    moduleCount,
    modulePixelSize
  };
}

export function innerCropFromModuleCanvas(moduleCanvas, insetModules = 8) {
  const w = moduleCanvas.width;
  const h = moduleCanvas.height;

  const x = Math.max(0, insetModules);
  const y = Math.max(0, insetModules);
  const newW = Math.max(1, w - insetModules * 2);
  const newH = Math.max(1, h - insetModules * 2);

  const target = document.createElement("canvas");
  target.width = newW;
  target.height = newH;
  const tctx = target.getContext("2d");
  tctx.imageSmoothingEnabled = false;

  tctx.drawImage(
    moduleCanvas,
    x,
    y,
    newW,
    newH,
    0,
    0,
    newW,
    newH
  );

  return target;
}
