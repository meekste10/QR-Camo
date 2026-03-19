import { pointInsideMask } from "./mask-engine.js";
import { buildWeightedTilePool, randomTileFromPool } from "./tile-engine.js";

function analyzeMask(maskCtx, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pointInsideMask(maskCtx, x, y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count === 0) {
    return {
      bounds: { x: 0, y: 0, width, height },
      centroid: { x: width / 2, y: height / 2 }
    };
  }

  return {
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    },
    centroid: {
      x: sumX / count,
      y: sumY / count
    }
  };
}

function measureHorizontalSpan(maskCtx, startX, y, width) {
  let left = startX;
  let right = startX;

  while (left > 0 && pointInsideMask(maskCtx, left - 1, y)) left--;
  while (right < width - 1 && pointInsideMask(maskCtx, right + 1, y)) right++;

  return {
    left,
    right,
    span: right - left + 1
  };
}

function measureVerticalSpan(maskCtx, x, startY, height) {
  let top = startY;
  let bottom = startY;

  while (top > 0 && pointInsideMask(maskCtx, x, top - 1)) top--;
  while (bottom < height - 1 && pointInsideMask(maskCtx, x, bottom + 1)) bottom++;

  return {
    top,
    bottom,
    span: bottom - top + 1
  };
}

function fitQrToShapeCore(maskCtx, maskInfo, outputSize, moduleCount, qrSize = "medium") {
  if (!moduleCount || moduleCount <= 0) moduleCount = 21;

  const cx = Math.max(0, Math.min(outputSize - 1, Math.round(maskInfo.centroid.x)));
  const cy = Math.max(0, Math.min(outputSize - 1, Math.round(maskInfo.centroid.y)));

  const hSpan = measureHorizontalSpan(maskCtx, cx, cy, outputSize);
  const vSpan = measureVerticalSpan(maskCtx, cx, cy, outputSize);

  // Use the local body thickness, not the full silhouette bounds.
  const localBase = Math.max(20, Math.min(hSpan.span, vSpan.span));

  let targetFraction = 0.52;
  if (qrSize === "xsmall") targetFraction = 0.30;
  if (qrSize === "small") targetFraction = 0.40;
  if (qrSize === "medium") targetFraction = 0.52;
  if (qrSize === "large") targetFraction = 0.64;

  let qrDisplaySize = Math.floor(localBase * targetFraction);
  const moduleDisplaySize = Math.max(2, Math.floor(qrDisplaySize / moduleCount));
  qrDisplaySize = moduleDisplaySize * moduleCount;

  let x = Math.round(cx - qrDisplaySize / 2);
  let y = Math.round(cy - qrDisplaySize / 2);

  // Clamp to local body span first
  x = Math.max(hSpan.left, Math.min(x, hSpan.right - qrDisplaySize + 1));
  y = Math.max(vSpan.top, Math.min(y, vSpan.bottom - qrDisplaySize + 1));

  // Safety clamp to overall bounds
  const minX = maskInfo.bounds.x;
  const minY = maskInfo.bounds.y;
  const maxX = maskInfo.bounds.x + maskInfo.bounds.width - qrDisplaySize;
  const maxY = maskInfo.bounds.y + maskInfo.bounds.height - qrDisplaySize;

  x = Math.max(minX, Math.min(x, maxX));
  y = Math.max(minY, Math.min(y, maxY));

  return {
    x,
    y,
    qrDisplaySize,
    moduleDisplaySize
  };
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

  const maskInfo = analyzeMask(mctx, OUTPUT_SIZE, OUTPUT_SIZE);
  const fit = fitQrToShapeCore(mctx, maskInfo, OUTPUT_SIZE, moduleCount, qrSize);

  const centerX = fit.x + qrOffsetX;
  const centerY = fit.y + qrOffsetY;

  ctx.drawImage(
    sourceQrCanvas,
    0,
    0,
    sourceQrCanvas.width,
    sourceQrCanvas.height,
    centerX,
    centerY,
    fit.qrDisplaySize,
    fit.qrDisplaySize
  );

  const centerRect = {
    x: centerX,
    y: centerY,
    size: fit.qrDisplaySize
  };

  const drawSize = fit.moduleDisplaySize;
  const weightedPool = buildWeightedTilePool(tiles);

  let previousTile = null;

  for (let y = 0; y < OUTPUT_SIZE; y += drawSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += drawSize) {
      const px = Math.floor(x + drawSize / 2);
      const py = Math.floor(y + drawSize / 2);

      if (!pointInsideMask(mctx, px, py)) continue;
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
