import { pointInsideMask } from "./mask-engine.js";

function drawCenteredQr(ctx, qrCanvas, outputSize) {
  const qrSize = Math.floor(outputSize * 0.34);
  const x = Math.floor((outputSize - qrSize) / 2);
  const y = Math.floor((outputSize - qrSize) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, x, y, qrSize, qrSize);

  return { x, y, size: qrSize };
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
    tileSize,
    sourceQrCanvas
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

  let centerQrRect = null;

  if (sourceQrCanvas) {
    centerQrRect = drawCenteredQr(ctx, sourceQrCanvas, OUTPUT_SIZE);
  }

  let tileIndex = 0;

  for (let y = 0; y < OUTPUT_SIZE; y += tileSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += tileSize) {
      const cx = Math.floor(x + tileSize / 2);
      const cy = Math.floor(y + tileSize / 2);

      if (!pointInsideMask(mctx, cx, cy)) continue;

      if (centerQrRect && cellIntersectsRect(x, y, tileSize, centerQrRect)) {
        continue;
      }

      const tile = tiles[tileIndex % tiles.length];
      ctx.drawImage(tile, 0, 0, tile.width, tile.height, x, y, tileSize, tileSize);
      tileIndex++;
    }
  }
}
