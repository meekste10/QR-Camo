export function threshold(imageData, thresholdValue = 128) {
  const copy = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );

  const d = copy.data;

  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = avg > thresholdValue ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  return copy;
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
  tctx.imageSmoothingEnabled = false;

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

function collectRunLengths(imageData, mode = "rows") {
  const { width, height, data } = imageData;
  const runLengths = [];

  if (mode === "rows") {
    const sampleRows = [
      Math.floor(height * 0.2),
      Math.floor(height * 0.35),
      Math.floor(height * 0.5),
      Math.floor(height * 0.65),
      Math.floor(height * 0.8)
    ];

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
  } else {
    const sampleCols = [
      Math.floor(width * 0.2),
      Math.floor(width * 0.35),
      Math.floor(width * 0.5),
      Math.floor(width * 0.65),
      Math.floor(width * 0.8)
    ];

    for (const x of sampleCols) {
      let current = null;
      let run = 0;

      for (let y = 0; y < height; y++) {
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
  }

  return runLengths;
}

export function estimateModuleSize(imageData) {
  const rowRuns = collectRunLengths(imageData, "rows");
  const colRuns = collectRunLengths(imageData, "cols");
  const runLengths = [...rowRuns, ...colRuns];

  const filtered = runLengths.filter(
    (v) => v >= 1 && v <= Math.max(imageData.width, imageData.height) / 4
  );

  if (!filtered.length) return 4;

  filtered.sort((a, b) => a - b);
  const lowerHalf = filtered.slice(
    0,
    Math.max(1, Math.floor(filtered.length * 0.35))
  );

  const avg = lowerHalf.reduce((a, b) => a + b, 0) / lowerHalf.length;
  return Math.max(1, Math.round(avg));
}

/**
 * For the camo fill, we want tiles that come from the QR's inner visual tissue.
 * This should usually be at or slightly above the detected module size.
 */
export function estimateTextureTileSize(imageData, moduleSize) {
  if (!imageData || !moduleSize) return moduleSize || 4;

  const rowRuns = collectRunLengths(imageData, "rows");
  const colRuns = collectRunLengths(imageData, "cols");
  const allRuns = [...rowRuns, ...colRuns].filter(
    (v) => v >= 1 && v <= Math.max(imageData.width, imageData.height) / 5
  );

  if (!allRuns.length) {
    return Math.max(2, Math.round(moduleSize * 1.6));
  }

  allRuns.sort((a, b) => a - b);

  const p35 = allRuns[Math.floor((allRuns.length - 1) * 0.35)];
  const p50 = allRuns[Math.floor((allRuns.length - 1) * 0.50)];

  // Intentionally bigger than before.
  // We want fewer, chunkier inner tiles so the fill doesn't become static-y.
  const candidate = Math.round((moduleSize * 2 + p35 + p50) / 2);

  return Math.max(
    Math.round(moduleSize * 1.35),
    candidate
  );
}

  
