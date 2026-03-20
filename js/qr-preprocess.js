export function threshold(imageData, thresholdValue = 128) {
  const out = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );

  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = avg > thresholdValue ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  return out;
}

function isWhitePixel(data, index) {
  return data[index] > 250 && data[index + 1] > 250 && data[index + 2] > 250;
}

export function trimWhiteBorder(imageData, keepMarginPx = 0) {
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
  tctx.imageSmoothingEnabled = false;

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

  const filtered = runLengths.filter(
    (v) => v >= 1 && v <= Math.max(width, height) / 4
  );

  if (!filtered.length) return 4;

  filtered.sort((a, b) => a - b);
  const lowerHalf = filtered.slice(0, Math.max(1, Math.floor(filtered.length * 0.35)));
  const avg = lowerHalf.reduce((a, b) => a + b, 0) / lowerHalf.length;

  return Math.max(1, Math.round(avg));
}

function sampleRegionIsBlack(imageData, x0, y0, w, h) {
  const { width, data } = imageData;
  let dark = 0;
  let total = 0;

  const x1 = Math.min(imageData.width, x0 + w);
  const y1 = Math.min(imageData.height, y0 + h);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < 128) dark++;
      total++;
    }
  }

  return total > 0 ? dark / total >= 0.5 : false;
}

function nearestValidQrModuleCount(estimated) {
  const valid = [];
  for (let v = 1; v <= 40; v++) {
    valid.push(21 + (v - 1) * 4);
  }

  let best = valid[0];
  let bestDiff = Math.abs(estimated - best);

  for (const count of valid) {
    const diff = Math.abs(estimated - count);
    if (diff < bestDiff) {
      best = count;
      bestDiff = diff;
    }
  }

  return best;
}

export function normalizeQrImageData(imageData, thresholdValue = 128) {
  const thresholded = threshold(imageData, thresholdValue);
  const trimmed = trimWhiteBorder(thresholded, 0);

  let moduleSize = estimateModuleSize(trimmed);
  if (!moduleSize || moduleSize < 1) moduleSize = 1;

  let estimatedModuleCount = Math.max(21, Math.round(trimmed.width / moduleSize));
  let moduleCount = nearestValidQrModuleCount(estimatedModuleCount);
  moduleSize = trimmed.width / moduleCount;

  const normalizedCanvas = document.createElement("canvas");
  normalizedCanvas.width = moduleCount;
  normalizedCanvas.height = moduleCount;

  const ctx = normalizedCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, moduleCount, moduleCount);
  ctx.fillStyle = "#000000";

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const sx = Math.floor(col * moduleSize);
      const sy = Math.floor(row * moduleSize);
      const sw = Math.max(1, Math.ceil((col + 1) * moduleSize) - sx);
      const sh = Math.max(1, Math.ceil((row + 1) * moduleSize) - sy);

      if (sampleRegionIsBlack(trimmed, sx, sy, sw, sh)) {
        ctx.fillRect(col, row, 1, 1);
      }
    }
  }

  return {
    canvas: normalizedCanvas,
    moduleCount,
    modulePixelSize: 1,
    trimmedImageData: trimmed
  };
}

export function cropQrInterior(normalizedCanvas, insetModules = 8) {
  const moduleCount = normalizedCanvas.width;
  const inset = Math.max(1, Math.min(insetModules, Math.floor(moduleCount / 4)));

  const cropX = inset;
  const cropY = inset;
  const cropW = Math.max(1, moduleCount - inset * 2);
  const cropH = Math.max(1, moduleCount - inset * 2);

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    normalizedCanvas,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    cropW,
    cropH
  );

  return canvas;
}

export function cropQrInteriorFromTrimmed(trimmedImageData, modulePixelSize, moduleCount, insetModules = 8) {
  const pxInset = Math.max(1, Math.round(insetModules * modulePixelSize));
  const canvas = imageDataToCanvas(trimmedImageData);

  const cropX = pxInset;
  const cropY = pxInset;
  const cropW = Math.max(1, canvas.width - pxInset * 2);
  const cropH = Math.max(1, canvas.height - pxInset * 2);

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;

  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return out;
}
