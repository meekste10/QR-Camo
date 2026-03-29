import { pointInsideMask } from "./mask-engine.js?v=0.6.3";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitQrCenter(outputSize, moduleCount, qrSize = "medium") {
  if (!moduleCount || moduleCount <= 0) moduleCount = 21;

  let targetFraction = 0.34;
  if (qrSize === "xxsmall") targetFraction = 0.14;
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

function drawTile(ctx, tileCanvas, dx, dy, drawSize) {
  ctx.drawImage(
    tileCanvas,
    0,
    0,
    tileCanvas.width,
    tileCanvas.height,
    dx,
    dy,
    drawSize,
    drawSize
  );
}

function drawScaledMaskToCanvas(maskImg, maskCanvas, scalePercent = 100, paddingPx = 0) {
  const ctx = maskCanvas.getContext("2d");
  const { width, height } = maskCanvas;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const scale = Math.max(0.1, Number(scalePercent || 100) / 100);
  const safePadding = Math.max(0, Number(paddingPx || 0));

  const baseW = maskImg.width || width;
  const baseH = maskImg.height || height;

  const fitW = Math.max(1, width - safePadding * 2);
  const fitH = Math.max(1, height - safePadding * 2);

  const fitScale = Math.min(fitW / baseW, fitH / baseH) * scale;

  const drawW = Math.max(1, Math.round(baseW * fitScale));
  const drawH = Math.max(1, Math.round(baseH * fitScale));
  const dx = Math.round((width - drawW) / 2);
  const dy = Math.round((height - drawH) / 2);

  ctx.drawImage(maskImg, dx, dy, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];

    if (a === 0) continue;

    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    const inside = gray < 180;

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
}

function buildEdgeBand(maskCanvas, insetPx, fillStyle) {
  const w = maskCanvas.width;
  const h = maskCanvas.height;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;

  const ctx = out.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(maskCanvas, 0, 0);

  const innerInset = Math.max(1, insetPx);

  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(
    maskCanvas,
    innerInset,
    innerInset,
    Math.max(1, w - innerInset * 2),
    Math.max(1, h - innerInset * 2)
  );

  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "source-over";
  return out;
}

function applyEdgePostFX(ctx, maskCanvas, depth = 3) {
  const safeDepth = Math.max(0, Math.round(depth || 0));
  if (!safeDepth) return;

  const highlightBand = buildEdgeBand(maskCanvas, safeDepth, "rgba(255,255,255,1)");
  const shadowBand = buildEdgeBand(maskCanvas, safeDepth, "rgba(0,0,0,1)");

  ctx.save();

  ctx.globalAlpha = 0.14;
  ctx.drawImage(shadowBand, safeDepth, safeDepth);

  ctx.globalAlpha = 0.18;
  ctx.drawImage(highlightBand, -safeDepth, -safeDepth);

  ctx.restore();
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
    maskPadding = 0,
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
  drawScaledMaskToCanvas(maskImg, maskCanvas, maskScale, maskPadding);

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

  const moduleDisplaySize = centerFit.moduleDisplaySize;
  const tileDisplaySize = moduleDisplaySize * safeBlockModules;

  const tightness = clamp(Number(blendTightness) / 100, 0, 1);
  const minCoverage = 0.14 + tightness * 0.30;

  for (let y = 0; y < OUTPUT_SIZE; y += tileDisplaySize) {
    for (let x = 0; x < OUTPUT_SIZE; x += tileDisplaySize) {
      const coverage = cellMaskCoverage(mctx, x, y, tileDisplaySize);
      if (coverage < minCoverage) continue;

      const gridX = Math.floor(x / tileDisplaySize);
      const gridY = Math.floor(y / tileDisplaySize);

      const tileCanvas = normalizeTile(
        tiles[pickTileIndex(gridX, gridY, tiles.length, 17)]
      );
      if (!tileCanvas) continue;

      drawTile(cctx, tileCanvas, x, y, tileDisplaySize);
    }
  }

  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(maskCanvas, 0, 0);
  cctx.globalCompositeOperation = "source-over";

    ctx.drawImage(camoCanvas, 0, 0);

  applyEdgePostFX(ctx, maskCanvas, 3);

  const topQrCanvas = overlayQrCanvas || sourceQrCanvas;

  ctx.imageSmoothingEnabled = false;
  if ("mozImageSmoothingEnabled" in ctx) ctx.mozImageSmoothingEnabled = false;
  if ("webkitImageSmoothingEnabled" in ctx) ctx.webkitImageSmoothingEnabled = false;
  if ("msImageSmoothingEnabled" in ctx) ctx.msImageSmoothingEnabled = false;

  const qrDrawX = Math.round(centerX);
  const qrDrawY = Math.round(centerY);
  const qrDrawSize = Math.round(centerFit.qrDisplaySize);

  const qrLayerCanvas = document.createElement("canvas");
  qrLayerCanvas.width = OUTPUT_SIZE;
  qrLayerCanvas.height = OUTPUT_SIZE;

  const qrLayerCtx = qrLayerCanvas.getContext("2d");
  qrLayerCtx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  qrLayerCtx.imageSmoothingEnabled = false;

  qrLayerCtx.drawImage(
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

  qrLayerCtx.globalCompositeOperation = "destination-in";
  qrLayerCtx.drawImage(maskCanvas, 0, 0);
  qrLayerCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(qrLayerCanvas, 0, 0);
}
