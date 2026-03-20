import { pointInsideMask } from "./mask-engine.js?v=0.6.2";

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

function rectsIntersect(a, b) {
  return !(
    a.x + a.size <= b.x ||
    a.x >= b.x + b.size ||
    a.y + a.size <= b.y ||
    a.y >= b.y + b.size
  );
}

function normalizeTile(tile) {
  if (!tile) return null;
  if (tile.canvas) return tile.canvas;
  return tile;
}

function hash2D(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return Math.abs(h);
}

function pickTileIndex(gridX, gridY, tileCount, seed = 0) {
  if (!tileCount) return 0;
  return hash2D(gridX, gridY, seed) % tileCount;
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

function drawTileWithBleed(ctx, tileCanvas, dx, dy, drawSize, bleed = 0) {
  const destX = dx - bleed;
  const destY = dy - bleed;
  const destSize = drawSize + bleed * 2;

  ctx.drawImage(
    tileCanvas,
    0,
    0,
    tileCanvas.width,
    tileCanvas.height,
    destX,
    destY,
    destSize,
    destSize
  );
}

function drawScaledMaskToCanvas(maskImg, maskCanvas, scalePercent = 100) {
  const ctx = maskCanvas.getContext("2d");
  const { width, height } = maskCanvas;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

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

export function render(options) {
  const {
    tiles,
    maskImg,
    outputCanvas,
    sourceQrCanvas,
    overlayQrCanvas,
    moduleCount,
    qrSize = "medium",
    qrOffsetX = 0,
    qrOffsetY = 0,
    blendTightness = 50,
    maskScale = 100,
    blockModules = 2
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

  const safeModuleCount = Math.max(21, moduleCount || sourceQrCanvas.width);
  const safeBlockModules = Math.max(1, blockModules);

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

  const centerFit = fitQrCenter(OUTPUT_SIZE, safeModuleCount, qrSize);

  const centerX = centerFit.x + qrOffsetX;
  const centerY = centerFit.y + qrOffsetY;

  const centerRect = {
    x: centerX,
    y: centerY,
    size: centerFit.qrDisplaySize
  };

  const moduleDisplaySize = centerFit.moduleDisplaySize;
  const tileDisplaySize = moduleDisplaySize * safeBlockModules;

  const qrGapPx = Math.max(2, Math.round(moduleDisplaySize * 0.85));
  const protectedCenterRect = {
    x: centerRect.x - qrGapPx,
    y: centerRect.y - qrGapPx,
    size: centerRect.size + qrGapPx * 2
  };

  const tightness = clamp(Number(blendTightness) / 100, 0, 1);
  const minCoverage = 0.14 + tightness * 0.30;
  const bleed = 0;

  for (let y = 0; y < OUTPUT_SIZE; y += tileDisplaySize) {
    for (let x = 0; x < OUTPUT_SIZE; x += tileDisplaySize) {
      const tileRect = { x, y, size: tileDisplaySize };
      if (rectsIntersect(tileRect, protectedCenterRect)) continue;

      const coverage = cellMaskCoverage(mctx, x, y, tileDisplaySize);
      if (coverage < minCoverage) continue;

      const gridX = Math.floor(x / tileDisplaySize);
      const gridY = Math.floor(y / tileDisplaySize);

      const tileCanvas = normalizeTile(
        tiles[pickTileIndex(gridX, gridY, tiles.length, 17)]
      );
      if (!tileCanvas) continue;

      drawTileWithBleed(cctx, tileCanvas, x, y, tileDisplaySize, bleed);
    }
  }

  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(maskCanvas, 0, 0);
  cctx.globalCompositeOperation = "source-over";

  ctx.drawImage(camoCanvas, 0, 0);

  const topQrCanvas = overlayQrCanvas || sourceQrCanvas;

  ctx.imageSmoothingEnabled = false;
  if ("mozImageSmoothingEnabled" in ctx) ctx.mozImageSmoothingEnabled = false;
  if ("webkitImageSmoothingEnabled" in ctx) ctx.webkitImageSmoothingEnabled = false;
  if ("msImageSmoothingEnabled" in ctx) ctx.msImageSmoothingEnabled = false;

  const qrDrawX = Math.round(centerX);
  const qrDrawY = Math.round(centerY);
  const qrDrawSize = Math.round(centerFit.qrDisplaySize);

  ctx.drawImage(
    topQrCanvas,
    0,
    0,
    topQrCanvas.width,
    topQrCanvas.height,
    qrDrawX,
    qrDrawY,
    qrDrawSize,
    qrDrawSize
  );
}
