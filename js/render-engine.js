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

function drawScaledMaskToCanvas(maskImg, maskCanvas, scalePercent = 100) {
  const ctx = maskCanvas.getContext("2d");
  const { width, height } = maskCanvas;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;

  const scale = Math.max(0.1, Number(scalePercent || 100) / 100);

  const baseW = maskImg.width || width;
  const baseH = maskImg.height || height;

  const fitScale = Math.min(width / baseW, height / baseH) * scale;

  const drawW = Math.max(1, Math.round(baseW * fitScale));
  const drawH = Math.max(1, Math.round(baseH * fitScale));
  const dx = Math.round((width - drawW) / 2);
  const dy = Math.round((height - drawH) / 2);

  ctx.drawImage(maskImg, dx, dy, drawW, drawH);
}

function getMaskBounds(maskCtx, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pointInsideMask(maskCtx, x, y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function drawTextureSpatially(ctx, textureCanvas, bounds, drawCellSize) {
  const cols = Math.ceil(bounds.width / drawCellSize);
  const rows = Math.ceil(bounds.height / drawCellSize);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dx = bounds.x + col * drawCellSize;
      const dy = bounds.y + row * drawCellSize;

      const dw = Math.min(drawCellSize, bounds.x + bounds.width - dx);
      const dh = Math.min(drawCellSize, bounds.y + bounds.height - dy);
      if (dw <= 0 || dh <= 0) continue;

      const sx = Math.floor((col / cols) * textureCanvas.width);
      const sy = Math.floor((row / rows) * textureCanvas.height);
      const sx2 = Math.floor(((col + 1) / cols) * textureCanvas.width);
      const sy2 = Math.floor(((row + 1) / rows) * textureCanvas.height);

      const sw = Math.max(1, sx2 - sx);
      const sh = Math.max(1, sy2 - sy);

      ctx.drawImage(
        textureCanvas,
        sx,
        sy,
        sw,
        sh,
        dx,
        dy,
        dw,
        dh
      );
    }
  }
}

export function render(options) {
  const {
    maskImg,
    outputCanvas,
    sourceQrCanvas,
    innerTextureCanvas,
    modulePixelSize,
    qrSize = "medium",
    qrOffsetX = 0,
    qrOffsetY = 0,
    maskScale = 100
  } = options;

  const OUTPUT_SIZE = 800;
  const ctx = outputCanvas.getContext("2d");

  outputCanvas.width = OUTPUT_SIZE;
  outputCanvas.height = OUTPUT_SIZE;
  ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.imageSmoothingEnabled = false;

  if (!maskImg) throw new Error("Render failed: no mask image available");
  if (!sourceQrCanvas) throw new Error("Render failed: no source QR canvas available");
  if (!innerTextureCanvas) throw new Error("Render failed: no inner texture canvas available");

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = OUTPUT_SIZE;
  maskCanvas.height = OUTPUT_SIZE;
  drawScaledMaskToCanvas(maskImg, maskCanvas, maskScale);

  const mctx = maskCanvas.getContext("2d");
  const bounds = getMaskBounds(mctx, OUTPUT_SIZE, OUTPUT_SIZE);

  let safeModulePixelSize = modulePixelSize;
  if (!safeModulePixelSize || safeModulePixelSize < 1) {
    safeModulePixelSize = 1;
  }

  const moduleCount = Math.max(
    1,
    Math.round(sourceQrCanvas.width / safeModulePixelSize)
  );

  const centerFit = fitQrCenter(OUTPUT_SIZE, moduleCount, qrSize);

  const centerX = centerFit.x + qrOffsetX;
  const centerY = centerFit.y + qrOffsetY;

  const camoCanvas = document.createElement("canvas");
  camoCanvas.width = OUTPUT_SIZE;
  camoCanvas.height = OUTPUT_SIZE;

  const cctx = camoCanvas.getContext("2d");
  cctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  cctx.imageSmoothingEnabled = false;

  // Use slightly chunkier cells than the core QR modules.
  // This avoids both static and giant blocks.
  const fillCellSize = Math.max(
    centerFit.moduleDisplaySize,
    Math.round(centerFit.moduleDisplaySize * 1.15)
  );

  drawTextureSpatially(cctx, innerTextureCanvas, bounds, fillCellSize);

  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(maskCanvas, 0, 0);
  cctx.globalCompositeOperation = "source-over";

  ctx.drawImage(camoCanvas, 0, 0);

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
