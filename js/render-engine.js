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
    y + size <= rect.y + 0 ||
    y >= rect.y + rect.size
  );
}

function normalizeTile(tile) {
  if (!tile) return null;
  if (tile.canvas) return tile.canvas;
  return tile;
}

/**
 * Stable spatial hash.
 * This avoids tileIndex scanline banding and gives each cell
 * a consistent tile choice based on position.
 */
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

/**
 * Sample the mask more intelligently than just the center point.
 * This makes edges, rooflines, and bottom silhouette areas much cleaner.
 */
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

/**
 * Draw a tile with optional tiny overscan to hide seams.
 */
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
    blendTightness = 50
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

  /* ------------------------------
     MASK CANVAS
  ------------------------------ */
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = OUTPUT_SIZE;
  maskCanvas.height = OUTPUT_SIZE;

  const mctx = maskCanvas.getContext("2d");
  mctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(maskImg, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  /* ------------------------------
     CAMO CANVAS
  ------------------------------ */
  const camoCanvas = document.createElement("canvas");
  camoCanvas.width = OUTPUT_SIZE;
  camoCanvas.height = OUTPUT_SIZE;

  const cctx = camoCanvas.getContext("2d");
  cctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  cctx.imageSmoothingEnabled = false;

  let safeModulePixelSize = modulePixelSize;
  if (!safeModulePixelSize || safeModulePixelSize < 1) {
    safeModulePixelSize = 4;
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

  const drawSize = centerFit.moduleDisplaySize;

  /**
   * Blend tightness:
   * lower = more forgiving fill
   * higher = tighter adherence to mask edge
   */
  const tightness = clamp(Number(blendTightness) / 100, 0, 1);

  /**
   * Edge rules:
   * - loose mode allows lower mask coverage, creates fuller fill
   * - tight mode requires stronger coverage, creates sharper silhouette edge
   */
  const minCoverage = 0.20 + tightness * 0.40;

  /**
   * Small bleed helps remove seams between tiles.
   * Keep it subtle so it does not mush the image.
   */
  const bleed = Math.max(1, Math.floor(drawSize * 0.04));

  /* ------------------------------
     DRAW CAMOUFLAGE FILL
  ------------------------------ */
  for (let y = 0; y < OUTPUT_SIZE; y += drawSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += drawSize) {
      if (cellIntersectsRect(x, y, drawSize, centerRect)) continue;

      const coverage = cellMaskCoverage(mctx, x, y, drawSize);
      if (coverage < minCoverage) continue;

      const gridX = Math.floor(x / drawSize);
      const gridY = Math.floor(y / drawSize);

      /**
       * Use spatially stable tile picking so the fill feels distributed,
       * not like it is marching row by row through the QR source.
       */
      const tileA = normalizeTile(tiles[pickTileIndex(gridX, gridY, tiles.length, 17)]);
      if (!tileA) continue;

      drawTileWithBleed(cctx, tileA, x, y, drawSize, bleed);
    }
  }

  /* ------------------------------
     HARD MASK THE ENTIRE CAMO LAYER
     This is the big edge cleanup move.
  ------------------------------ */
  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(maskCanvas, 0, 0);
  cctx.globalCompositeOperation = "source-over";

  /* ------------------------------
     DRAW CAMO TO OUTPUT
  ------------------------------ */
  ctx.drawImage(camoCanvas, 0, 0);

  /* ------------------------------
     DRAW CENTER QR LAST
     Keeps the scan-critical core crisp.
  ------------------------------ */
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
