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

function expandRect(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    size: rect.size + amount * 2
  };
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

function tintWhiteDown(canvas, whiteValue = 232) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const isWhite = d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200;
    if (isWhite) {
      d[i] = whiteValue;
      d[i + 1] = whiteValue;
      d[i + 2] = whiteValue;
      d[i + 3] = 255;
    } else {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function makeQrDisplayCanvas(sourceQrCanvas, displaySize, whiteValue = 232) {
  const c = document.createElement("canvas");
  c.width = displaySize;
  c.height = displaySize;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sourceQrCanvas,
    0,
    0,
    sourceQrCanvas.width,
    sourceQrCanvas.height,
    0,
    0,
    displaySize,
    displaySize
  );

  tintWhiteDown(c, whiteValue);
  return c;
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

  const centerRect = {
    x: centerX,
    y: centerY,
    size: qrDisplaySize
  };

  const tilePool = buildWeightedTilePool(tiles);

  // New: two zones around the QR
  const exclusionBand = moduleDisplaySize * 1;   // hard no-tile zone
  const blendBand = moduleDisplaySize * 3;       // soft transition zone

  const hardRect = expandRect(centerRect, exclusionBand);
  const softRect = expandRect(centerRect, blendBand);

  // 1) draw outer field first
  for (let y = 0; y < OUTPUT_SIZE; y += moduleDisplaySize) {
    for (let x = 0; x < OUTPUT_SIZE; x += moduleDisplaySize) {
      const cx = Math.floor(x + moduleDisplaySize / 2);
      const cy = Math.floor(y + moduleDisplaySize / 2);

      if (!pointInsideMask(mctx, cx, cy)) continue;

      // never draw directly into QR area or immediate hard band
      if (cellIntersectsRect(x, y, moduleDisplaySize, hardRect)) continue;

      const tile = randomTileFromPool(tilePool);
      if (!tile) continue;

      // if inside soft transition zone, draw with slightly reduced opacity
      const inSoftZone = cellIntersectsRect(x, y, moduleDisplaySize, softRect);

      if (inSoftZone) {
        ctx.save();
        ctx.globalAlpha = 0.72;
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
        ctx.restore();
      } else {
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

  // 2) subtle tone bridge around center
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(softRect.x, softRect.y, softRect.size, softRect.size);
  ctx.clearRect(centerRect.x, centerRect.y, centerRect.size, centerRect.size);
  ctx.restore();

  // 3) draw center QR with slightly dimmed white
  const qrDisplayCanvas = makeQrDisplayCanvas(sourceQrCanvas, qrDisplaySize, 232);
  ctx.drawImage(qrDisplayCanvas, centerX, centerY);
}
