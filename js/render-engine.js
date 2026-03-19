import { pointInsideMask } from "./mask-engine.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitQrCenter(outputSize, moduleCount, qrSize = "medium") {
  if (!moduleCount || moduleCount <= 0) moduleCount = 21;

  let targetFraction = 0.34;
  if (qrSize === "xsmall") targetFraction = 0.20;
  if (qrSize === "small") targetFraction = 0.26;
  if (qrSize === "medium") targetFraction = 0.34;
  if (qrSize === "large") targetFraction = 0.42;

  let qrDisplaySize = Math.floor(outputSize * targetFraction);

  const moduleDisplaySize = Math.max(2, Math.floor(qrDisplaySize / moduleCount));
  qrDisplaySize = moduleDisplaySize * moduleCount;

  const x = Math.floor((outputSize - qrDisplaySize) / 2);
  const y = Math.floor((outputSize - qrDisplaySize) / 2);

  return { x, y, qrDisplaySize, moduleDisplaySize };
}

function cellIntersectsRect(x, y, size, rect) {
  return !(
    x + size <= rect.x ||
    x >= rect.x + rect.size ||
    y + size <= rect.y ||
    y >= rect.y + rect.size
  );
}

function hash2D(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return Math.abs(h);
}

function cellMaskCoverage(mctx, x, y, size) {
  const inset = Math.max(1, Math.floor(size * 0.18));

  const samples = [
    [x + Math.floor(size / 2), y + Math.floor(size / 2)],
    [x + inset, y + inset],
    [x + size - inset, y + inset],
    [x + inset, y + size - inset],
    [x + size - inset, y + size - inset],
    [x + Math.floor(size / 2), y + inset],
    [x + Math.floor(size / 2), y + size - inset],
    [x + inset, y + Math.floor(size / 2)],
    [x + size - inset, y + Math.floor(size / 2)]
  ];

  let inside = 0;
  for (const [sx, sy] of samples) {
    if (pointInsideMask(mctx, sx, sy)) inside++;
  }

  return inside / samples.length;
}

function drawScaledMaskToCanvas(maskImg, maskCanvas, scalePercent = 100) {
  const ctx = maskCanvas.getContext("2d");
  const { width, height } = maskCanvas;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;

  const scale = Math.max(0.1, Number(scalePercent || 100) / 100);

  const baseW = maskImg.width || width;
  const baseH = maskImg.height || height;

  const fitScale = Math.min(width / baseW, height / baseH) * scale;

  const drawW = Math.max(1, Math.round(baseW * fitScale));
  const drawH = Math.max(1, Math.round(baseH * fitScale));
  const dx = Math.round((width - drawW) / 2);
  const dy = Math.round((height - drawH) / 2);

  ctx.drawImage(maskImg, dx, dy, drawW, drawH);
}

function normalizeTile(tile) {
  if (!tile) return null;
  if (tile.canvas) return tile.canvas;
  return tile;
}

function drawTileVariant(ctx, tileCanvas, dx, dy, drawSize, variantIndex) {
  ctx.save();
  ctx.translate(dx + drawSize / 2, dy + drawSize / 2);

  const rotation = (variantIndex % 4) * (Math.PI / 2);
  ctx.rotate(rotation);

  const flipX = variantIndex % 2 === 1 ? -1 : 1;
  const flipY = variantIndex % 3 === 2 ? -1 : 1;
  ctx.scale(flipX, flipY);

  ctx.drawImage(
    tileCanvas,
    0,
    0,
    tileCanvas.width,
    tileCanvas.height,
    -drawSize / 2,
    -drawSize / 2,
    drawSize,
    drawSize
  );

  ctx.restore();
}

export function render(options) {
  const {
    tiles,
    maskImg,
    outputCanvas,
    sourceQrCanvas,
    modulePixelSize,
    qrSize = "medium",
    qrOffsetX = 0,
    qrOffsetY = 0,
    blendTightness = 50,
    maskScale = 100
  } = options;

  const OUTPUT_SIZE = 800;
  const ctx = outputCanvas.getContext("2d");

  outputCanvas.width = OUTPUT_SIZE;
  outputCanvas.height = OUTPUT_SIZE;
  ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.imageSmoothingEnabled = false;

  if (!tiles || !tiles.length) {
    throw new Error("Render failed: no tiles available");
  }
  if (!maskImg) {
    throw new Error("Render failed: no mask image available");
  }
  if (!sourceQrCanvas) {
    throw new Error("Render failed: no source QR canvas available");
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = OUTPUT_SIZE;
  maskCanvas.height = OUTPUT_SIZE;
  drawScaledMaskToCanvas(maskImg, maskCanvas, maskScale);

  const mctx = maskCanvas.getContext("2d");

  const camoCanvas = document.createElement("canvas");
  camoCanvas.width = OUTPUT_SIZE;
  camoCanvas.height = OUTPUT_SIZE;

  const cctx = camoCanvas.getContext("2d");
  cctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  cctx.imageSmoothingEnabled = false;

  let safeModulePixelSize = modulePixelSize;
  if (!safeModulePixelSize || safeModulePixelSize < 1) {
    safeModulePixelSize = 1;
  }

  const moduleCount = Math.max(
    1,
    Math.round(sourceQrCanvas.width / safeModulePixelSize)
  );

  const centerFit = fitQrCenter(OUTPUT_SIZE, moduleCount, qrSize);

  const centerX = centerFit.x + qrOffsetX;
  const centerY = centerFit.y + qrOffsetY;

  const centerRect = {
    x: centerX,
    y: centerY,
    size: centerFit.qrDisplaySize
  };

  // Key fix:
  // Fill should be slightly chunkier than the core module cadence,
  // not finer. That helps the camouflage feel blended instead of noisy.
  const fillDrawSize = Math.max(
    centerFit.moduleDisplaySize,
    Math.round(centerFit.moduleDisplaySize * 1.22)
  );

  const tightness = clamp(Number(blendTightness) / 100, 0, 1);
  const minCoverage = 0.20 + tightness * 0.40;

  for (let y = 0; y < OUTPUT_SIZE; y += fillDrawSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += fillDrawSize) {
      if (cellIntersectsRect(x, y, fillDrawSize, centerRect)) continue;

      const coverage = cellMaskCoverage(mctx, x, y, fillDrawSize);
      if (coverage < minCoverage) continue;

      const gridX = Math.floor(x / fillDrawSize);
      const gridY = Math.floor(y / fillDrawSize);

      const tileIndex = hash2D(gridX, gridY, 17) % tiles.length;
      const tileCanvas = normalizeTile(tiles[tileIndex]);
      if (!tileCanvas) continue;

      const variantIndex = hash2D(gridX, gridY, 53) % 8;
      drawTileVariant(cctx, tileCanvas, x, y, fillDrawSize, variantIndex);
    }
  }

  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(maskCanvas, 0, 0);
  cctx.globalCompositeOperation = "source-over";

  ctx.drawImage(camoCanvas, 0, 0);

  ctx.drawImage(
    sourceQrCanvas,
    0,
    0,
    sourceQrCanvas.width,
    sourceQrCanvas.height,
    centerX,
    centerY,
    centerFit.qrDisplaySize,
    centerFit.qrDisplaySize
  );
}
