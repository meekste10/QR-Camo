import { pointInsideMask } from "./mask-engine.js";

function fitQrCenter(outputSize, qrPixelWidth, moduleCount) {

  if (!moduleCount || moduleCount <= 0) moduleCount = 21;

  const targetFraction = 0.34;
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

  ctx.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);
  ctx.imageSmoothingEnabled = false;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = OUTPUT_SIZE;
  maskCanvas.height = OUTPUT_SIZE;

  const mctx = maskCanvas.getContext("2d");
  mctx.drawImage(maskImg,0,0,OUTPUT_SIZE,OUTPUT_SIZE);

  if (!modulePixelSize || modulePixelSize < 1) {
    modulePixelSize = 4;
  }

  const moduleCount = Math.round(sourceQrCanvas.width / modulePixelSize);

  const centerFit = fitQrCenter(
    OUTPUT_SIZE,
    sourceQrCanvas.width,
    moduleCount
  );

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

  let tileIndex = 0;
  const drawSize = centerFit.moduleDisplaySize;

  for (let y = 0; y < OUTPUT_SIZE; y += drawSize) {

    for (let x = 0; x < OUTPUT_SIZE; x += drawSize) {

      const cx = x + drawSize/2;
      const cy = y + drawSize/2;

      if (!pointInsideMask(mctx,cx,cy)) continue;

      if (cellIntersectsRect(x,y,drawSize,centerRect)) continue;

      const tile = tiles[tileIndex % tiles.length];

      ctx.drawImage(
        tile,
        0,
        0,
        tile.width,
        tile.height,
        x,
        y,
        drawSize,
        drawSize
      );

      tileIndex++;

    }
  }
}
