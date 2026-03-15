import { pointInsideMask } from "./mask-engine.js";
import { buildWeightedTilePool, randomTileFromPool } from "./tile-engine.js";

function cellIntersectsRect(x, y, size, rect) {
  return !(
    x + size <= rect.x ||
    x >= rect.x + rect.size ||
    y + size <= rect.y ||
    y >= rect.y + rect.size
  );
}

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

  // True module count from the trimmed QR itself
  const moduleCount = Math.max(
    1,
    Math.round(sourceQrCanvas.width / safeModulePixelSize)
  );

  // Size the WHOLE system from one shared module scale.
  // No special body-fit scaling for the center QR.
  const maskBounds = getMaskBounds(mctx, OUTPUT_SIZE, OUTPUT_SIZE);

  const maxQrWidthByCanvas = Math.floor(OUTPUT_SIZE * 0.34);
  const maxQrWidthByMask = Math.floor(maskBounds.width * 0.42);
  const maxQrHeightByMask = Math.floor(maskBounds.height * 0.42);

  const qrBudget = Math.max(
    42,
    Math.min(maxQrWidthByCanvas, maxQrWidthByMask, maxQrHeightByMask)
  );

  const moduleDisplaySize = Math.max(
    2,
    Math.floor(qrBudget / moduleCount)
  );

  const qrDisplaySize = moduleDisplaySize * moduleCount;

  const centerX = Math.floor((OUTPUT_SIZE - qrDisplaySize) / 2);
  const centerY = Math.floor((OUTPUT_SIZE - qrDisplaySize) / 2);

  // Draw center QR on the exact same module grid scale
  ctx.drawImage(
    sourceQrCanvas,
    0,
    0,
    sourceQrCanvas.width,
    sourceQrCanvas.height,
    centerX,
    centerY,
    qrDisplaySize,
    qrDisplaySize
  );

  const centerRect = {
    x: centerX,
    y: centerY,
    size: qrDisplaySize
  };

  const tilePool = buildWeightedTilePool(tiles);

  // Outer shape uses the SAME exact module display size
  for (let y = 0; y < OUTPUT_SIZE; y += moduleDisplaySize) {
    for (let x = 0; x < OUTPUT_SIZE; x += moduleDisplaySize) {
      const cx = Math.floor(x + moduleDisplaySize / 2);
      const cy = Math.floor(y + moduleDisplaySize / 2);

      if (!pointInsideMask(mctx, cx, cy)) continue;
      if (cellIntersectsRect(x, y, moduleDisplaySize, centerRect)) continue;

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
        moduleDisplaySize,
        moduleDisplaySize
      );
    }
  }
}
