export function render(options) {
  const {
    maskImg,
    outputCanvas,
    sourceQrCanvas,
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

  if (!maskImg) throw new Error("No mask");
  if (!sourceQrCanvas) throw new Error("No QR");

  // ===== Build mask canvas =====
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = OUTPUT_SIZE;
  maskCanvas.height = OUTPUT_SIZE;
  const mctx = maskCanvas.getContext("2d");

  const scale = maskScale / 100;
  const drawW = maskImg.width * scale;
  const drawH = maskImg.height * scale;
  const dx = (OUTPUT_SIZE - drawW) / 2;
  const dy = (OUTPUT_SIZE - drawH) / 2;

  mctx.drawImage(maskImg, dx, dy, drawW, drawH);

  // ===== QR math =====
  const moduleCount = Math.round(sourceQrCanvas.width / modulePixelSize);

  const centerSize = Math.floor(OUTPUT_SIZE * 0.34);
  const moduleDraw = Math.max(3, Math.floor(centerSize / moduleCount));

  const qrSizePx = moduleDraw * moduleCount;

  const centerX = Math.floor((OUTPUT_SIZE - qrSizePx) / 2 + qrOffsetX);
  const centerY = Math.floor((OUTPUT_SIZE - qrSizePx) / 2 + qrOffsetY);

  // ===== BLOCK SIZE (this is the magic) =====
  const BLOCK = 2; // try 2 or 3 later

  const drawSize = moduleDraw * BLOCK;

  // ===== Fill shape =====
  for (let y = 0; y < OUTPUT_SIZE; y += drawSize) {
    for (let x = 0; x < OUTPUT_SIZE; x += drawSize) {

      // skip center QR zone
      if (
        x < centerX + qrSizePx &&
        x + drawSize > centerX &&
        y < centerY + qrSizePx &&
        y + drawSize > centerY
      ) continue;

      // mask check (center point)
      const alpha = mctx.getImageData(
        x + drawSize / 2,
        y + drawSize / 2,
        1,
        1
      ).data[3];

      if (alpha < 128) continue;

      // random block from QR
      const srcCol = Math.floor(Math.random() * (moduleCount - BLOCK));
      const srcRow = Math.floor(Math.random() * (moduleCount - BLOCK));

      ctx.drawImage(
        sourceQrCanvas,
        srcCol * modulePixelSize,
        srcRow * modulePixelSize,
        BLOCK * modulePixelSize,
        BLOCK * modulePixelSize,
        x,
        y,
        drawSize,
        drawSize
      );
    }
  }

  // ===== draw center QR clean =====
  ctx.drawImage(
    sourceQrCanvas,
    0,
    0,
    sourceQrCanvas.width,
    sourceQrCanvas.height,
    centerX,
    centerY,
    qrSizePx,
    qrSizePx
  );
}
