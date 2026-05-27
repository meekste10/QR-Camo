import { pointInsideMask } from "./mask-engine.js?v=0.6.4";
import { drawStyledQrLayer } from "./module-style-engine.js?v=0.6.4";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sizeFractionsForPreset(qrSize = "medium") {
  if (qrSize === "xxxxsmall") return [0.10, 0.09, 0.08, 0.07, 0.06];
  if (qrSize === "xxxsmall") return [0.13, 0.12, 0.11, 0.10, 0.09];
  if (qrSize === "xxsmall") return [0.16, 0.14, 0.12, 0.11, 0.10];
  if (qrSize === "xsmall") return [0.22, 0.20, 0.18, 0.16, 0.14];
  if (qrSize === "small") return [0.30, 0.27, 0.24, 0.22, 0.20];
  if (qrSize === "large") return [0.52, 0.48, 0.44, 0.40, 0.36];
  return [0.38, 0.34, 0.30, 0.27, 0.24];
}

function fitQrCenter(outputSize, moduleCount, qrSize = "medium") {
  const safeModuleCount = Math.max(21, moduleCount || 21);
  const fractions = sizeFractionsForPreset(qrSize);
  const fraction = fractions[0] || 0.34;

  let qrDisplaySize = Math.floor(outputSize * fraction);
  const moduleDisplaySize = Math.max(1, Math.floor(qrDisplaySize / safeModuleCount));
  qrDisplaySize = moduleDisplaySize * safeModuleCount;

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

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(maskImg, dx, dy, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  let transparentPixels = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 250) transparentPixels++;
  }

  const usesAlphaMask = transparentPixels > d.length / 16;

  for (let i = 0; i < d.length; i += 4) {
    let inside = false;

    if (usesAlphaMask) {
      inside = d[i + 3] > 10;
    } else {
      const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      inside = gray < 180;
    }

    if (invertMask) inside = !inside;

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

function maskCanvasHasEnoughPixels(maskCanvas, minPixels = 64) {
  const ctx = maskCanvas.getContext("2d");
  const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;

  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 10) count++;
    if (count >= minPixels) return true;
  }

  return false;
}

function erodeMaskCanvas(sourceCanvas, radius = 1) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  const srcCtx = sourceCanvas.getContext("2d");
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;

  const outCtx = out.getContext("2d");
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  function alphaAt(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return src[(y * w + x) * 4 + 3];
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = true;

      for (let dy = -radius; dy <= radius && inside; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (alphaAt(x + dx, y + dy) <= 10) {
            inside = false;
            break;
          }
        }
      }

      const i = (y * w + x) * 4;
      if (inside) {
        dst[i] = 255;
        dst[i + 1] = 255;
        dst[i + 2] = 255;
        dst[i + 3] = 255;
      } else {
        dst[i] = 0;
        dst[i + 1] = 0;
        dst[i + 2] = 0;
        dst[i + 3] = 0;
      }
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return out;
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

function drawQrLayer(ctx, maskCtx, qrCanvas, fit, moduleStyle = "classic") {
  drawStyledQrLayer(ctx, maskCtx, qrCanvas, fit, {
    moduleStyle,
    coverageFn: cellMaskCoverage,
    coverageThreshold: 0.58
  });
}

function buildLivePlacement(placement, moduleCount, outputSize, liveScale = 1, qrOffsetX = 0, qrOffsetY = 0) {
  const safeModuleCount = Math.max(21, moduleCount || 21);

  const baseQrDisplaySize = Math.max(1, Number(placement?.qrDisplaySize || 0));
  const baseModuleDisplaySize = Math.max(1, Number(placement?.moduleDisplaySize || 1));
  const baseX = Number(placement?.x || 0);
  const baseY = Number(placement?.y || 0);

  const centerX = baseX + baseQrDisplaySize / 2 + Number(qrOffsetX || 0);
  const centerY = baseY + baseQrDisplaySize / 2 + Number(qrOffsetY || 0);

  let moduleDisplaySize = Math.max(1, Math.round(baseModuleDisplaySize * Number(liveScale || 1)));
  let qrDisplaySize = moduleDisplaySize * safeModuleCount;

  let x = Math.round(centerX - qrDisplaySize / 2);
  let y = Math.round(centerY - qrDisplaySize / 2);

  x = clamp(x, 0, outputSize - qrDisplaySize);
  y = clamp(y, 0, outputSize - qrDisplaySize);

  return {
    x,
    y,
    qrDisplaySize,
    moduleDisplaySize
  };
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

export function buildSafeQrMaskCanvas(maskCanvas, moduleDisplaySize = 1) {
  const safeRadius = Math.max(
    1,
    Math.round((moduleDisplaySize || 1) * 0.45)
  );

  const safeCandidate = erodeMaskCanvas(maskCanvas, safeRadius);
  return maskCanvasHasEnoughPixels(safeCandidate) ? safeCandidate : maskCanvas;
}

export function renderStapledBase(options) {
  const {
    tiles,
    maskCanvas,
    outputSize = 800,
    blendTightness = 50,
    blockModules = 2,
    moduleDisplaySize = 8,
    minCoverage = null,
    moduleStyle = "classic"
  } = options;

  const mctx = maskCanvas.getContext("2d");
  const safeBlockModules = Math.max(1, blockModules);
  const safeModuleDisplaySize = Math.max(1, Math.round(moduleDisplaySize || 8));

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = outputSize;
  baseCanvas.height = outputSize;

  const cctx = baseCanvas.getContext("2d");
  cctx.clearRect(0, 0, outputSize, outputSize);
  cctx.imageSmoothingEnabled = false;

  const tileDisplaySize = Math.max(1, safeModuleDisplaySize * safeBlockModules);
  const tightness = clamp(Number(blendTightness) / 100, 0, 1);

  const computedMinCoverage = 0.14 + tightness * 0.30;
  const effectiveMinCoverage =
    Number.isFinite(minCoverage) ? clamp(minCoverage, 0, 1) : computedMinCoverage;

  for (let y = 0; y < outputSize; y += tileDisplaySize) {
    for (let x = 0; x < outputSize; x += tileDisplaySize) {
      const coverage = cellMaskCoverage(mctx, x, y, tileDisplaySize);
      if (coverage < effectiveMinCoverage) continue;

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

export function findBestQrPlacement(maskCtx, outputSize, moduleCount, qrSize = "medium") {
  const safeModuleCount = Math.max(21, moduleCount || 21);
  const fractions = sizeFractionsForPreset(qrSize);
  const integralData = buildIntegralMask(maskCtx);

  let best = null;

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

        if (!best || score > best.score) {
          best = {
            x,
            y,
            qrDisplaySize,
            moduleDisplaySize,
            score
          };
        }
      }
    }

    if (best) break;
  }

  if (!best) {
    return fitQrCenter(outputSize, safeModuleCount, qrSize);
  }

  return best;
}

export function drawSingleQrOverlay(options) {
  const {
    baseCanvas,
    maskCanvas,
    qrMaskCanvas = null,
    outputCanvas,
    sourceQrCanvas,
    moduleCount,
    placement = null,
    qrSize = "medium",
    liveScale = 1,
    qrOffsetX = 0,
    qrOffsetY = 0,
    outputSize = 800,
    moduleStyle = "classic"
  } = options;

  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;

  const ctx = outputCanvas.getContext("2d");
  ctx.clearRect(0, 0, outputSize, outputSize);
  ctx.imageSmoothingEnabled = false;

  if (baseCanvas) {
    ctx.drawImage(baseCanvas, 0, 0);
  }

  if (!sourceQrCanvas || !maskCanvas) return;

  const overlayMaskCanvas = qrMaskCanvas || maskCanvas;
  const maskCtx = overlayMaskCanvas.getContext("2d");

  const basePlacement =
    placement ||
    findBestQrPlacement(maskCtx, outputSize, Math.max(21, moduleCount || 21), qrSize);

  const liveFit = buildLivePlacement(
    basePlacement,
    moduleCount,
    outputSize,
    liveScale,
    qrOffsetX,
    qrOffsetY
  );

  const qrLayerCanvas = document.createElement("canvas");
  qrLayerCanvas.width = outputSize;
  qrLayerCanvas.height = outputSize;

  const qrLayerCtx = qrLayerCanvas.getContext("2d");
  qrLayerCtx.clearRect(0, 0, outputSize, outputSize);
  qrLayerCtx.imageSmoothingEnabled = false;

  drawQrLayer(qrLayerCtx, maskCtx, sourceQrCanvas, liveFit, moduleStyle);

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
    liveScale = 1,
    minCoverage = null,
    moduleStyle = "classic"
  } = options;

  const OUTPUT_SIZE = 800;

  const maskCanvas = buildMaskCanvas({
    maskImg,
    outputSize: OUTPUT_SIZE,
    maskScale,
    maskPadding,
    invertMask
  });

  const roughPlacement = findBestQrPlacement(
    maskCanvas.getContext("2d"),
    OUTPUT_SIZE,
    moduleCount,
    qrSize
  );

  const qrMaskCanvas = buildSafeQrMaskCanvas(
    maskCanvas,
    roughPlacement?.moduleDisplaySize || 1
  );

  const placement = findBestQrPlacement(
    qrMaskCanvas.getContext("2d"),
    OUTPUT_SIZE,
    moduleCount,
    qrSize
  );

  const baseCanvas = renderStapledBase({
    tiles,
    maskCanvas,
    outputSize: OUTPUT_SIZE,
    blendTightness,
    blockModules,
    moduleDisplaySize: placement.moduleDisplaySize,
    minCoverage
  });

  drawSingleQrOverlay({
    baseCanvas,
    maskCanvas,
    qrMaskCanvas,
    outputCanvas,
    sourceQrCanvas,
    moduleCount,
    placement,
    qrSize,
    liveScale,
    qrOffsetX,
    qrOffsetY,
    outputSize: OUTPUT_SIZE,
    moduleStyle
  });

  return { baseCanvas, maskCanvas, qrMaskCanvas, placement };
}
