import { pointInsideMask } from "./mask-engine.js";
import { buildWeightedTilePool, randomTileFromPool } from "./tile-engine.js";

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

function normalizeTile(tile) {
  if (!tile) return null;
  if (tile.canvas) return tile.canvas;
  return tile;
}

function drawTileVariant(ctx, tileCanvas, x, y, drawSize, variantIndex) {
  ctx.save();
  ctx.translate(x + drawSize / 2, y + drawSize / 2);

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
    qrOffsetY = 0
  } = options;

  const OUTPUT_SIZE = 800;

  const ctx = outputCanvas.getContext("2d");
  outputCanvas.width = OUTPUT_SIZE;
  outputCanvas.height = OUTPUT_SIZE;
  ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.imageSmoothingEnabled = false;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = OUTPUT_SIZE;
  maskCanvas.height = OUTPUT_SIZE;

  const mctx = maskCanvas.getContext("2d");
  mctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  mctx.drawImage(maskImg, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

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

  const centerRect = {
    x: centerX,
    y: centerY,
    size: centerFit.qrDisplaySize
  };

  const drawSize = centerFit.moduleDisplaySize;
  const weightedPool = buildWeightedTilePool(tiles);

  let previousTile = null;

  for (let y = 0; y < OUTPUT_SIZE; y += drawSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += drawSize) {
      const cx = Math.floor(x + drawSize / 2);
      const cy = Math.floor(y + drawSize / 2);

      if (!pointInsideMask(mctx, cx, cy)) continue;
      if (cellIntersectsRect(x, y, drawSize, centerRect)) continue;

      let picked = null;
      let attempts = 0;

      while (attempts < 5) {
        const candidate = randomTileFromPool(weightedPool);
        const tileCanvas = normalizeTile(candidate);

        if (!tileCanvas) {
          attempts++;
          continue;
        }

        if (tileCanvas !== previousTile || weightedPool.length < 3) {
          picked = tileCanvas;
          break;
        }

        attempts++;
      }

      if (!picked) {
        const fallback = randomTileFromPool(weightedPool);
        picked = normalizeTile(fallback);
      }

      if (!picked) continue;

      const variantIndex = Math.floor(Math.random() * 8);
      drawTileVariant(ctx, picked, x, y, drawSize, variantIndex);
      previousTile = picked;
    }
  }
}
