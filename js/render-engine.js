import { pointInsideMask } from "./mask-engine.js";

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
  let tileIndex = 0;

  for (let y = 0; y < OUTPUT_SIZE; y += drawSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += drawSize) {
      const cx = Math.floor(x + drawSize / 2);
      const cy = Math.floor(y + drawSize / 2);

      if (!pointInsideMask(mctx, cx, cy)) continue;
      if (cellIntersectsRect(x, y, drawSize, centerRect)) continue;

      const rawTile = tiles[tileIndex % tiles.length];
      const tileCanvas = normalizeTile(rawTile);
      if (!tileCanvas) continue;

      ctx.drawImage(
        tileCanvas,
        0,
        0,
        tileCanvas.width,
        tileCanvas.height,
        x,
        y,
        drawSize,
        drawSize
      );

      tileIndex++;
    }
  }
}
