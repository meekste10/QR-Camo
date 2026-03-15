import { pointInsideMask } from "./mask-engine.js";
import { buildWeightedTilePool, randomTileFromPool } from "./tile-engine.js";

function getMaskBounds(maskCtx, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const data = maskCtx.getImageData(x, y, 1, 1).data;
      if (data[3] > 10) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) {
    return {
      minX: 0,
      minY: 0,
      maxX: width - 1,
      maxY: height - 1,
      width,
      height
    };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function getHorizontalSpanAtY(maskCtx, width, y) {
  let minX = width;
  let maxX = -1;

  for (let x = 0; x < width; x++) {
    const data = maskCtx.getImageData(x, y, 1, 1).data;
    if (data[3] > 10) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  if (maxX === -1) return null;

  return {
    minX,
    maxX,
    width: maxX - minX + 1,
    centerX: Math.floor((minX + maxX) / 2)
  };
}

function getVerticalSpanAtX(maskCtx, height, x) {
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const data = maskCtx.getImageData(x, y, 1, 1).data;
    if (data[3] > 10) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxY === -1) return null;

  return {
    minY,
    maxY,
    height: maxY - minY + 1,
    centerY: Math.floor((minY + maxY) / 2)
  };
}

function estimateShapeBody(maskCtx, width, height) {
  const bounds = getMaskBounds(maskCtx, width, height);

  const centerY = Math.floor((bounds.minY + bounds.maxY) / 2);
  const centerX = Math.floor((bounds.minX + bounds.maxX) / 2);

  const sampleYs = [
    centerY,
    Math.floor(bounds.minY + bounds.height * 0.42),
    Math.floor(bounds.minY + bounds.height * 0.58)
  ];

  const sampleXs = [
    centerX,
    Math.floor(bounds.minX + bounds.width * 0.42),
    Math.floor(bounds.minX + bounds.width * 0.58)
  ];

  const horizontalSpans = sampleYs
    .map(y => getHorizontalSpanAtY(maskCtx, width, y))
    .filter(Boolean);

  const verticalSpans = sampleXs
    .map(x => getVerticalSpanAtX(maskCtx, height, x))
    .filter(Boolean);

  const avgWidth =
    horizontalSpans.length
      ? horizontalSpans.reduce((sum, s) => sum + s.width, 0) / horizontalSpans.length
      : bounds.width;

  const avgHeight =
    verticalSpans.length
      ? verticalSpans.reduce((sum, s) => sum + s.height, 0) / verticalSpans.length
      : bounds.height;

  return {
    bounds,
    centerX,
    centerY,
    bodyWidth: avgWidth,
    bodyHeight: avgHeight
  };
}

function fitQrCenterToMask(maskCtx, outputSize, moduleCount) {
  if (!moduleCount || moduleCount <= 0) moduleCount = 21;

  const shape = estimateShapeBody(maskCtx, outputSize, outputSize);

  // Use the central "body" of the mask, not the full silhouette extent.
  // Slightly conservative so the QR feels embedded instead of oversized.
  const usableSize = Math.floor(Math.min(shape.bodyWidth, shape.bodyHeight) * 0.72);

  let moduleDisplaySize = Math.max(2, Math.floor(usableSize / moduleCount));
  let qrDisplaySize = moduleDisplaySize * moduleCount;

  // Secondary safety cap so it never overwhelms the body.
  const absoluteCap = Math.floor(Math.min(shape.bounds.width, shape.bounds.height) * 0.78);
  if (qrDisplaySize > absoluteCap) {
    moduleDisplaySize = Math.max(2, Math.floor(absoluteCap / moduleCount));
    qrDisplaySize = moduleDisplaySize * moduleCount;
  }

  const x = Math.floor(shape.centerX - qrDisplaySize / 2);
  const y = Math.floor(shape.centerY - qrDisplaySize / 2);

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

export function render(options) {
  const {
    tiles,
    maskImg,
    outputCanvas,
    sourceQrCanvas,
    modulePixelSize
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

  const centerFit = fitQrCenterToMask(mctx, OUTPUT_SIZE, moduleCount);

  ctx.drawImage(
    sourceQrCanvas,
    0,
    0,
    sourceQrCanvas.width,
    sourceQrCanvas.height,
    centerFit.x,
    centerFit.y,
    centerFit.qrDisplaySize,
    centerFit.qrDisplaySize
  );

  const centerRect = {
    x: centerFit.x,
    y: centerFit.y,
    size: centerFit.qrDisplaySize
  };

  const drawSize = centerFit.moduleDisplaySize;
  const tilePool = buildWeightedTilePool(tiles);

  for (let y = 0; y < OUTPUT_SIZE; y += drawSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += drawSize) {
      const cx = Math.floor(x + drawSize / 2);
      const cy = Math.floor(y + drawSize / 2);

      if (!pointInsideMask(mctx, cx, cy)) continue;
      if (cellIntersectsRect(x, y, drawSize, centerRect)) continue;

      const tile = randomTileFromPool(tilePool);
      if (!tile) continue;

      ctx.drawImage(
        tile.canvas,
        0,
        0,
        tile.canvas.width,
        tile.canvas.height,
        x,
        y,
        drawSize,
        drawSize
      );
    }
  }
}
