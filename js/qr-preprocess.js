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

export function estimateTextureTileSize(imageData, moduleSize) {
  if (!imageData || !moduleSize) return moduleSize || 4;
  const base = Math.max(2, Math.floor(moduleSize));
  return Math.max(2, Math.round(base * 1.4));
}

function canvasFromImageData(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function squareCanvasFromImageData(imageData, size = 1024) {
  const srcCanvas = canvasFromImageData(imageData);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const scale = Math.min(size / srcCanvas.width, size / srcCanvas.height);
  const drawW = Math.round(srcCanvas.width * scale);
  const drawH = Math.round(srcCanvas.height * scale);
  const dx = Math.floor((size - drawW) / 2);
  const dy = Math.floor((size - drawH) / 2);

  ctx.drawImage(srcCanvas, dx, dy, drawW, drawH);
  return canvas;
}

function rebuildGridFromCanvas(squareCanvas, moduleCount) {
  const size = squareCanvas.width;
  const ctx = squareCanvas.getContext("2d");
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;

  const cleanCanvas = document.createElement("canvas");
  cleanCanvas.width = moduleCount;
  cleanCanvas.height = moduleCount;

  const cleanCtx = cleanCanvas.getContext("2d");
  cleanCtx.imageSmoothingEnabled = false;
  cleanCtx.fillStyle = "#ffffff";
  cleanCtx.fillRect(0, 0, moduleCount, moduleCount);
  cleanCtx.fillStyle = "#000000";

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const sx0 = Math.floor((col * size) / moduleCount);
      const sx1 = Math.floor(((col + 1) * size) / moduleCount);
      const sy0 = Math.floor((row * size) / moduleCount);
      const sy1 = Math.floor(((row + 1) * size) / moduleCount);

      let black = 0;
      let total = 0;

      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          const i = (y * size + x) * 4;
          if (data[i] < 128) black++;
          total++;
        }
      }

      const isBlack = total > 0 ? black / total >= 0.5 : false;
      if (isBlack) {
        cleanCtx.fillRect(col, row, 1, 1);
      }
    }
  }

  return cleanCanvas;
}

function scoreQrCandidate(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;

  let black = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 128) black++;
  }

  const total = canvas.width * canvas.height;
  const blackRatio = black / total;

  // good QR candidates tend to avoid extremely sparse or extremely dense fills
  const densityScore = 1 - Math.abs(0.42 - blackRatio);

  return densityScore;
}

export function normalizeQrCanvas(inputCanvas) {
  const ctx = inputCanvas.getContext("2d");
  const original = ctx.getImageData(0, 0, inputCanvas.width, inputCanvas.height);

  // stronger cleanup path for uploaded styled QRs
  const thresholded = threshold(original, 160);
  const trimmed = trimWhiteBorder(thresholded, 0);
  const squared = squareCanvasFromImageData(trimmed, 1024);

  const estimatedModule = Math.max(1, estimateModuleSize(trimmed));
  const roughCount = Math.max(21, Math.round(trimmed.width / estimatedModule));

  // Test nearby standard-ish counts
  const candidates = Array.from(new Set([
    roughCount - 2,
    roughCount - 1,
    roughCount,
    roughCount + 1,
    roughCount + 2,
    21,
    25,
    29,
    33,
    37,
    41
  ])).filter((n) => n >= 21);

  let bestCanvas = null;
  let bestScore = -Infinity;
  let bestCount = roughCount;

  for (const count of candidates) {
    const rebuilt = rebuildGridFromCanvas(squared, count);
    const score = scoreQrCandidate(rebuilt);

    if (score > bestScore) {
      bestScore = score;
      bestCanvas = rebuilt;
      bestCount = count;
    }
  }

  return {
    canvas: bestCanvas,
    moduleCount: bestCount,
    modulePixelSize: 1
  };
}
