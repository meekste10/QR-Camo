import { pointInsideMask } from "./mask-engine.js?v=0.6.3";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitQrCenter(outputSize, moduleCount, qrSize = "medium") {
  if (!moduleCount || moduleCount <= 0) moduleCount = 21;

  let targetFraction = 0.34;
  if (qrSize === "xxxxsmall") targetFraction = 0.08;
  if (qrSize === "xxxsmall") targetFraction = 0.11;
  if (qrSize === "xxsmall") targetFraction = 0.14;
  if (qrSize === "xsmall") targetFraction = 0.20;
  if (qrSize === "small") targetFraction = 0.26;
  if (qrSize === "medium") targetFraction = 0.34;
  if (qrSize === "large") targetFraction = 0.42;

  let qrDisplaySize = Math.floor(outputSize * targetFraction);

  const moduleDisplaySize = Math.max(1, Math.floor(qrDisplaySize / moduleCount));
  qrDisplaySize = moduleDisplaySize * moduleCount;

  const x = Math.floor((outputSize - qrDisplaySize) / 2);
  const y = Math.floor((outputSize - qrDisplaySize) / 2);

  return { x, y, qrDisplaySize, moduleDisplaySize };
}

function normalizeTile(tile) {
  if (!tile) return null;
  if (tile.canvas) return tile.canvas;
  return tile;
}

function hash2D(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return Math.abs(h);
}

function pickTileIndex(gridX, gridY, tileCount, seed = 0) {
  if (!tileCount) return 0;
  return hash2D(gridX, gridY, seed) % tileCount;
}

function cellMaskCoverage(mctx, x, y, size) {
  const inset = Math.max(1, Math.floor(size * 0.18));

  const samples = [
    [x + Math.floor(size / 2), y + Math.floor(size / 2)],
    [x + inset, y + inset],
    [x + size - inset, y + inset],
    [x + inset, y + size - inset],
    [x + size - inset, y + size - inset],
    [x + Math.floor(size / 2), y + inset],
    [x + Math.floor(size / 2), y + size - inset],
    [x + inset, y + Math.floor(size / 2)],
    [x + size - inset, y + Math.floor(size / 2)]
  ];

  let inside = 0;
  for (const [sx, sy] of samples) {
    if (pointInsideMask(mctx, sx, sy)) inside++;
  }

  return inside / samples.length;
}

function drawTile(ctx, tileCanvas, dx, dy, drawSize) {
  ctx.drawImage(
    tileCanvas,
    0,
    0,
    tileCanvas.width,
    tileCanvas.height,
    dx,
    dy,
    drawSize,
    drawSize
  );
}

function drawScaledMaskToCanvas(maskImg, maskCanvas, scalePercent = 100, paddingPx = 0, invertMask = false) {
  const ctx = maskCanvas.getContext("2d");
  const { width, height } = maskCanvas;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const scale = Math.max(0.1, Number(scalePercent || 100) / 100);
  const safePadding = Math.max(0, Number(paddingPx || 0));

  const baseW = maskImg.width || width;
  const baseH = maskImg.height || height;

  const fitW = Math.max(1, width - safePadding * 2);
  const fitH = Math.max(1, height - safePadding * 2);

  const fitScale = Math.min(fitW / baseW, fitH / baseH) * scale;

  const drawW = Math.max(1, Math.round(baseW * fitScale));
  const drawH = Math.max(1, Math.round(baseH * fitScale));
  const dx = Math.round((width - drawW) / 2);
  const dy = Math.round((height - drawH) / 2);

  ctx.drawImage(maskImg, dx, dy, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;

    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    const inside = invertMask ? gray > 180 : gray < 180;

    if (inside) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    } else {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function buildEdgeBand(maskCanvas, insetPx, fillStyle) {
  const w = maskCanvas.width;
  const h = maskCanvas.height;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;

  const ctx = out.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(maskCanvas, 0, 0);

  const innerInset = Math.max(1, insetPx);

  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(
    maskCanvas,
    innerInset,
    innerInset,
    Math.max(1, w - innerInset * 2),
    Math.max(1, h - innerInset * 2)
  );

  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "source-over";
  return out;
}

function applyEdgePostFX(ctx, maskCanvas, depth = 3) {
  const safeDepth = Math.max(0, Math.round(depth || 0));
  if (!safeDepth) return;

  const highlightBand = buildEdgeBand(maskCanvas, safeDepth, "rgba(255,255,255,1)");
  const shadowBand = buildEdgeBand(maskCanvas, safeDepth, "rgba(0,0,0,1)");

  ctx.save();

  ctx.globalAlpha = 0.14;
  ctx.drawImage(shadowBand, safeDepth, safeDepth);

  ctx.globalAlpha = 0.18;
  ctx.drawImage(highlightBand, -safeDepth, -safeDepth);

  ctx.restore();
}

function sizeFractionsForPreset(qrSize = "medium") {
  if (qrSize === "xxxxsmall") return [0.12, 0.10, 0.09, 0.08, 0.07];
  if (qrSize === "xxxsmall") return [0.16, 0.14, 0.12, 0.11, 0.10];
  if (qrSize === "xxsmall") return [0.20, 0.18, 0.16, 0.14, 0.12];
  if (qrSize === "xsmall") return [0.26, 0.24, 0.22, 0.20, 0.18];
  if (qrSize === "small") return [0.34, 0.31, 0.28, 0.26, 0.22];
  if (qrSize === "large") return [0.52, 0.48, 0.44, 0.40, 0.36];
  return [0.42, 0.38, 0.34, 0.30, 0.26];
}

function buildIntegralMask(maskCtx) {
  const { width, height } = maskCtx.canvas;
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += pointInsideMask(maskCtx, x, y) ? 1 : 0;
      const idx = (y + 1) * (width + 1) + (x + 1);
      integral[idx] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  return { integral, width, height };
}

function rectInsideCount(integralData, x, y, size) {
  const { integral, width, height } = integralData;

  const x0 = clamp(Math.floor(x), 0, width);
  const y0 = clamp(Math.floor(y), 0, height);
  const x1 = clamp(Math.floor(x + size), 0, width);
  const y1 = clamp(Math.floor(y + size), 0, height);

  const stride = width + 1;

  return (
    integral[y1 * stride + x1]
    - integral[y0 * stride + x1]
    - integral[y1 * stride + x0]
    + integral[y0 * stride + x0]
  );
}

function rectCoverage(integralData, x, y, size) {
  const inside = rectInsideCount(integralData, x, y, size);
  const total = Math.max(1, Math.floor(size) * Math.floor(size));
  return inside / total;
}

function squareSampleCoverage(maskCtx, x, y, size, divisions = 5) {
  let inside = 0;
  let total = 0;

  const step = size / divisions;

  for (let gy = 0; gy < divisions; gy++) {
    for (let gx = 0; gx < divisions; gx++) {
      const sx = x + gx * step + step / 2;
      const sy = y + gy * step + step / 2;
      if (pointInsideMask(maskCtx, sx, sy)) inside++;
      total++;
    }
  }

  return total ? inside / total : 0;
}

function cornerSupport(maskCtx, x, y, size) {
  const inset = Math.max(6, Math.floor(size * 0.08));
  const probe = Math.max(8, Math.floor(size * 0.16));

  const corners = [
    [x + inset, y + inset],
    [x + size - inset - probe, y + inset],
    [x + inset, y + size - inset - probe],
    [x + size - inset - probe, y + size - inset - probe]
  ];

  let total = 0;
  for (const [cx, cy] of corners) {
    total += squareSampleCoverage(maskCtx, cx, cy, probe, 4);
  }

  return total / corners.length;
}

function edgeSupport(maskCtx, x, y, size) {
  const probe = Math.max(8, Math.floor(size * 0.14));
  const mid = Math.floor(size / 2);

  const zones = [
    [x + mid - probe / 2, y + 4],
    [x + mid - probe / 2, y + size - probe - 4],
    [x + 4, y + mid - probe / 2],
    [x + size - probe - 4, y + mid - probe / 2]
  ];

  let total = 0;
  for (const [zx, zy] of zones) {
    total += squareSampleCoverage(maskCtx, zx, zy, probe, 4);
  }

  return total / zones.length;
}

function centerSupport(maskCtx, x, y, size) {
  const probe = Math.max(12, Math.floor(size * 0.22));
  const cx = x + size / 2 - probe / 2;
  const cy = y + size / 2 - probe / 2;
  return squareSampleCoverage(maskCtx, cx, cy, probe, 5);
}

function scoreQrCandidate(maskCtx, integralData, x, y, size) {
  const coverage = rectCoverage(integralData, x, y, size);
  if (coverage < 0.78) return -Infinity;

  const corner = cornerSupport(maskCtx, x, y, size);
  if (corner < 0.58) return -Infinity;

  const edge = edgeSupport(maskCtx, x, y, size);
  const center = centerSupport(maskCtx, x, y, size);

  const maskCenterX = maskCtx.canvas.width / 2;
  const maskCenterY = maskCtx.canvas.height / 2;
  const qrCenterX = x + size / 2;
  const qrCenterY = y + size / 2;

  const distFromCenter = Math.hypot(qrCenterX - maskCenterX, qrCenterY - maskCenterY);
  const maxDist = Math.hypot(maskCenterX, maskCenterY);
  const centerBias = 1 - distFromCenter / Math.max(1, maxDist);

  const sizeScore = size / maskCtx.canvas.width;

  return (
    coverage * 6.4 +
    corner * 3.1 +
    edge * 1.8 +
    center * 1.1 +
    centerBias * 0.85 +
    sizeScore * 1.0
  );
}

function getQrPixelData(qrCanvas) {
  const qctx = qrCanvas.getContext("2d");
  return qctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height).data;
}

function qrModuleIsDark(qrData, qrWidth, x, y) {
  const idx = (y * qrWidth + x) * 4;
  return qrData[idx] < 128;
}

function drawQrChannelLayer(ctx, maskCtx, qrCanvas, fit) {
  const qrData = getQrPixelData(qrCanvas);
  const qrWidth = qrCanvas.width;
  const qrHeight = qrCanvas.height;
  const moduleSize = fit.moduleDisplaySize;

  for (let row = 0; row < qrHeight; row++) {
    for (let col = 0; col < qrWidth; col++) {
      const x = fit.x + col * moduleSize;
      const y = fit.y + row * moduleSize;

      const coverage = cellMaskCoverage(maskCtx, x, y, moduleSize);
      if (coverage < 0.55) continue;

      const isDark = qrModuleIsDark(qrData, qrWidth, col, row);

      ctx.fillStyle = isDark ? "#000000" : "#ffffff";
      ctx.fillRect(x, y, moduleSize, moduleSize);
    }
  }
}

function rectsOverlap(a, b, padding = 0) {
  return !(
    a.x + a.qrDisplaySize + padding <= b.x ||
    b.x + b.qrDisplaySize + padding <= a.x ||
    a.y + a.qrDisplaySize + padding <= b.y ||
    b.y + b.qrDisplaySize + padding <= a.y
  );
}

export function buildMaskCanvas({
  maskImg,
  outputSize = 800,
  maskScale = 100,
  maskPadding = 0,
  invertMask = false
}) {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = outputSize;
  maskCanvas.height = outputSize;
  drawScaledMaskToCanvas(maskImg, maskCanvas, maskScale, maskPadding, invertMask);
  return maskCanvas;
}

export function renderStapledBase(options) {
  const {
    tiles,
    maskCanvas,
    outputSize = 800,
    blendTightness = 50,
    blockModules = 2
  } = options;

  const mctx = maskCanvas.getContext("2d");
  const safeBlockModules = Math.max(1, blockModules);

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = outputSize;
  baseCanvas.height = outputSize;

  const cctx = baseCanvas.getContext("2d");
  cctx.clearRect(0, 0, outputSize, outputSize);
  cctx.imageSmoothingEnabled = false;

  const moduleDisplaySize = 8;
  const tileDisplaySize = Math.max(1, moduleDisplaySize * safeBlockModules);
  const tightness = clamp(Number(blendTightness) / 100, 0, 1);
  const minCoverage = 0.14 + tightness * 0.30;

  for (let y = 0; y < outputSize; y += tileDisplaySize) {
    for (let x = 0; x < outputSize; x += tileDisplaySize) {
      const coverage = cellMaskCoverage(mctx, x, y, tileDisplaySize);
      if (coverage < minCoverage) continue;

      const gridX = Math.floor(x / tileDisplaySize);
      const gridY = Math.floor(y / tileDisplaySize);

      const tileCanvas = normalizeTile(
        tiles[pickTileIndex(gridX, gridY, tiles.length, 17)]
      );
      if (!tileCanvas) continue;

      drawTile(cctx, tileCanvas, x, y, tileDisplaySize);
    }
  }

  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(maskCanvas, 0, 0);
  cctx.globalCompositeOperation = "source-over";

  applyEdgePostFX(cctx, maskCanvas, 3);

  return baseCanvas;
}

export function findQrPlacementCandidates(maskCtx, outputSize, moduleCount, qrSize = "medium") {
  const safeModuleCount = Math.max(21, moduleCount || 21);
  const fractions = sizeFractionsForPreset(qrSize);
  const integralData = buildIntegralMask(maskCtx);

  const candidates = [];
  const seen = new Set();

  for (const fraction of fractions) {
    let qrDisplaySize = Math.floor(outputSize * fraction);
    let moduleDisplaySize = Math.max(1, Math.floor(qrDisplaySize / safeModuleCount));
    qrDisplaySize = moduleDisplaySize * safeModuleCount;

    if (qrDisplaySize <= 0 || qrDisplaySize > outputSize) continue;

    const maxX = outputSize - qrDisplaySize;
    const maxY = outputSize - qrDisplaySize;
    const step = Math.max(3, Math.floor(moduleDisplaySize));

    for (let y = 0; y <= maxY; y += step) {
      for (let x = 0; x <= maxX; x += step) {
        const score = scoreQrCandidate(maskCtx, integralData, x, y, qrDisplaySize);
        if (score === -Infinity) continue;

        const coverage = rectCoverage(integralData, x, y, qrDisplaySize);
        const corner = cornerSupport(maskCtx, x, y, qrDisplaySize);
        const edge = edgeSupport(maskCtx, x, y, qrDisplaySize);
        const center = centerSupport(maskCtx, x, y, qrDisplaySize);

        const key = [
          Math.round(x / 4),
          Math.round(y / 4),
          qrDisplaySize
        ].join(":");

        if (seen.has(key)) continue;
        seen.add(key);

        candidates.push({
          x,
          y,
          qrDisplaySize,
          moduleDisplaySize,
          score,
          coverage,
          corner,
          edge,
          center
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

export function selectBestQrChannels(candidates, count = 5, minSpacing = 24) {
  const selected = [];

  for (const candidate of candidates) {
    const overlaps = selected.some((picked) => rectsOverlap(candidate, picked, minSpacing));
    if (overlaps) continue;

    selected.push(candidate);
    if (selected.length >= count) break;
  }

  return selected;
}

export function findBestQrPlacement(maskCtx, outputSize, moduleCount, qrSize = "medium") {
  const candidates = findQrPlacementCandidates(maskCtx, outputSize, moduleCount, qrSize);
  if (candidates.length) return candidates[0];
  return fitQrCenter(outputSize, Math.max(21, moduleCount || 21), qrSize);
}

export function createAutoQrChannels({
  maskCanvas,
  moduleCount,
  qrSize = "medium",
  channelCount = 5,
  minSpacing = 24,
  outputSize = 800
}) {
  const maskCtx = maskCanvas.getContext("2d");
  const candidates = findQrPlacementCandidates(maskCtx, outputSize, moduleCount, qrSize);
  const selected = selectBestQrChannels(candidates, channelCount, minSpacing);

  return selected.map((fit, index) => ({
    id: index + 1,
    enabled: true,
    size: qrSize,
    x: 0,
    y: 0,
    autoX: fit.x,
    autoY: fit.y,
    fitScore: fit.score,
    cornersFit: fit.corner >= 0.95 ? 4 : 3,
    overlapRisk: 0,
    qrDisplaySize: fit.qrDisplaySize,
    moduleDisplaySize: fit.moduleDisplaySize
  }));
}

export function drawMultipleQrOverlays(options) {
  const {
    baseCanvas,
    maskCanvas,
    outputCanvas,
    sourceQrCanvas,
    moduleCount,
    channels = [],
    outputSize = 800
  } = options;

  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;

  const ctx = outputCanvas.getContext("2d");
  ctx.clearRect(0, 0, outputSize, outputSize);
  ctx.imageSmoothingEnabled = false;

  if (baseCanvas) {
    ctx.drawImage(baseCanvas, 0, 0);
  }

  if (!sourceQrCanvas || !maskCanvas) {
    return;
  }

  const mctx = maskCanvas.getContext("2d");

  for (const channel of channels) {
    if (!channel || !channel.enabled) continue;

    const fitBase = channel.qrDisplaySize && channel.moduleDisplaySize
      ? {
          x: channel.autoX || 0,
          y: channel.autoY || 0,
          qrDisplaySize: channel.qrDisplaySize,
          moduleDisplaySize: channel.moduleDisplaySize
        }
      : findBestQrPlacement(
          mctx,
          outputSize,
          Math.max(21, moduleCount || 21),
          channel.size || "medium"
        );

    const fit = {
      ...fitBase,
      x: clamp(
        Math.round((channel.autoX ?? fitBase.x) + (channel.x || 0)),
        0,
        outputSize - fitBase.qrDisplaySize
      ),
      y: clamp(
        Math.round((channel.autoY ?? fitBase.y) + (channel.y || 0)),
        0,
        outputSize - fitBase.qrDisplaySize
      )
    };

    const qrLayerCanvas = document.createElement("canvas");
    qrLayerCanvas.width = outputSize;
    qrLayerCanvas.height = outputSize;

    const qrLayerCtx = qrLayerCanvas.getContext("2d");
    qrLayerCtx.clearRect(0, 0, outputSize, outputSize);
    qrLayerCtx.imageSmoothingEnabled = false;

    drawQrChannelLayer(qrLayerCtx, mctx, sourceQrCanvas, fit);

    qrLayerCtx.globalCompositeOperation = "destination-in";
    qrLayerCtx.drawImage(maskCanvas, 0, 0);
    qrLayerCtx.globalCompositeOperation = "source-over";

    ctx.drawImage(qrLayerCanvas, 0, 0);
  }
}

export function drawQrOverlayOnly(options) {
  const {
    baseCanvas,
    maskCanvas,
    outputCanvas,
    sourceQrCanvas,
    moduleCount,
    qrSize = "medium",
    qrOffsetX = 0,
    qrOffsetY = 0
  } = options;

  const OUTPUT_SIZE = outputCanvas.width || 800;
  outputCanvas.width = OUTPUT_SIZE;
  outputCanvas.height = OUTPUT_SIZE;

  const ctx = outputCanvas.getContext("2d");
  ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.imageSmoothingEnabled = false;

  if (baseCanvas) {
    ctx.drawImage(baseCanvas, 0, 0);
  }

  if (!sourceQrCanvas || !maskCanvas) {
    return;
  }

  const mctx = maskCanvas.getContext("2d");
  const autoFit = findBestQrPlacement(
    mctx,
    OUTPUT_SIZE,
    Math.max(21, moduleCount || 21),
    qrSize
  );

  const fit = {
    ...autoFit,
    x: clamp(
      Math.round(autoFit.x + qrOffsetX),
      0,
      OUTPUT_SIZE - autoFit.qrDisplaySize
    ),
    y: clamp(
      Math.round(autoFit.y + qrOffsetY),
      0,
      OUTPUT_SIZE - autoFit.qrDisplaySize
    )
  };

  const qrLayerCanvas = document.createElement("canvas");
  qrLayerCanvas.width = OUTPUT_SIZE;
  qrLayerCanvas.height = OUTPUT_SIZE;

  const qrLayerCtx = qrLayerCanvas.getContext("2d");
  qrLayerCtx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  qrLayerCtx.imageSmoothingEnabled = false;

  drawQrChannelLayer(qrLayerCtx, mctx, sourceQrCanvas, fit);

  qrLayerCtx.globalCompositeOperation = "destination-in";
  qrLayerCtx.drawImage(maskCanvas, 0, 0);
  qrLayerCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(qrLayerCanvas, 0, 0);
}

export function render(options) {
  const {
    tiles,
    maskImg,
    outputCanvas,
    sourceQrCanvas,
    moduleCount,
    qrSize = "medium",
    qrOffsetX = 0,
    qrOffsetY = 0,
    blendTightness = 50,
    maskScale = 100,
    maskPadding = 0,
    invertMask = false,
    blockModules = 2,
    channels = null
  } = options;

  const OUTPUT_SIZE = 800;

  const maskCanvas = buildMaskCanvas({
    maskImg,
    outputSize: OUTPUT_SIZE,
    maskScale,
    maskPadding,
    invertMask
  });

  const baseCanvas = renderStapledBase({
    tiles,
    maskCanvas,
    outputSize: OUTPUT_SIZE,
    blendTightness,
    blockModules
  });

  if (Array.isArray(channels) && channels.length) {
    drawMultipleQrOverlays({
      baseCanvas,
      maskCanvas,
      outputCanvas,
      sourceQrCanvas,
      moduleCount,
      channels,
      outputSize: OUTPUT_SIZE
    });
  } else {
    drawQrOverlayOnly({
      baseCanvas,
      maskCanvas,
      outputCanvas,
      sourceQrCanvas,
      moduleCount,
      qrSize,
      qrOffsetX,
      qrOffsetY
    });
  }

  return { baseCanvas, maskCanvas };
}
