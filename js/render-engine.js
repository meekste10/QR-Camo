import { pointInsideMask } from "./mask-engine.js?v=0.6.3";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitQrCenter(outputSize, moduleCount, qrSize = "medium") {
  if (!moduleCount || moduleCount <= 0) moduleCount = 21;

  let targetFraction = 0.34;
  if (qrSize === "xxsmall") targetFraction = 0.14;
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

/* -----------------------------
   SMART QR FIT HELPERS
----------------------------- */

function sizeFractionsForPreset(qrSize = "medium") {
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
  if (coverage < 0.76) return -Infinity;

  const corner = cornerSupport(maskCtx, x, y, size);
  if (corner < 0.62) return -Infinity;

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
    coverage * 6.0 +
    corner * 3.2 +
    edge * 1.9 +
    center * 1.2 +
    centerBias * 0.9 +
    sizeScore * 1.2
  );
}

function findBestQrPlacement(maskCtx, outputSize, moduleCount, qrSize = "medium") {
  const safeModuleCount = Math.max(21, moduleCount || 21);
  const fractions = sizeFractionsForPreset(qrSize);
  const integralData = buildIntegralMask(maskCtx);

  let best = null;

  for (const fraction of fractions) {
    let qrDisplaySize = Math.floor(outputSize * fraction);
    let moduleDisplaySize = Math.max(2, Math.floor(qrDisplaySize / safeModuleCount));
    qrDisplaySize = moduleDisplaySize * safeModuleCount;

    if (qrDisplaySize <= 0 || qrDisplaySize > outputSize) continue;

    const maxX = outputSize - qrDisplaySize;
    const maxY = outputSize - qrDisplaySize;

    const step = Math.max(4, Math.floor(moduleDisplaySize));

    let localBest = null;

    for (let y = 0; y <= maxY; y += step) {
      for (let x = 0; x <= maxX; x += step) {
        const score = scoreQrCandidate(maskCtx, integralData, x, y, qrDisplaySize);
        if (score === -Infinity) continue;

        if (!localBest || score > localBest.score) {
          localBest = {
            x,
            y,
            qrDisplaySize,
            moduleDisplaySize,
            score
          };
        }
      }
    }

    if (localBest) {
      best = localBest;
      break;
    }
  }

  if (!best) {
    return fitQrCenter(outputSize, safeModuleCount, qrSize);
  }

  return best;
}

/* -----------------------------
   QR MODULE INTEGRATION HELPERS
----------------------------- */

function getQrModuleValue(qrCanvas, col, row) {
  const ctx = qrCanvas.getContext("2d");
  const data = ctx.getImageData(col, row, 1, 1).data;
  return data[0] < 128;
}

function isFinderRegion(col, row, moduleCount) {
  const topLeft = col < 7 && row < 7;
  const topRight = col >= moduleCount - 7 && row < 7;
  const bottomLeft = col < 7 && row >= moduleCount - 7;
  return topLeft || topRight || bottomLeft;
}

function drawQrModulesIntegrated(ctx, qrCanvas, maskCtx, fit, tilePool) {
  const moduleCount = qrCanvas.width;
  const moduleDisplaySize = fit.moduleDisplaySize;
  const startX = Math.round(fit.x);
  const startY = Math.round(fit.y);

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const isDark = getQrModuleValue(qrCanvas, col, row);
      if (!isDark) continue;

      const x = startX + col * moduleDisplaySize;
      const y = startY + row * moduleDisplaySize;
      const size = moduleDisplaySize;

      const coverage = cellMaskCoverage(maskCtx, x, y, size);
      if (coverage < 0.55) continue;

      const isFinder = isFinderRegion(col, row, moduleCount);

      if (isFinder) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(x, y, size, size);
        continue;
      }

      const tileCanvas = normalizeTile(
        tilePool[pickTileIndex(col, row, tilePool.length, 91)]
      );

      if (tileCanvas) {
        drawTile(ctx, tileCanvas, x, y, size);
      } else {
        ctx.fillStyle = "#000000";
        ctx.fillRect(x, y, size, size);
      }

      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect(x, y, size, size);
    }
  }
}

export function render(options) {
  const {
    tiles,
    maskImg,
    outputCanvas,
    sourceQrCanvas,
    overlayQrCanvas, // kept for compatibility, but no longer used as top pasted layer
    moduleCount,
    qrSize = "medium",
    qrOffsetX = 0,
    qrOffsetY = 0,
    blendTightness = 50,
    maskScale = 100,
    maskPadding = 0,
    invertMask = false,
    blockModules = 2
  } = options;

  const OUTPUT_SIZE = 800;
  const ctx = outputCanvas.getContext("2d");

  outputCanvas.width = OUTPUT_SIZE;
  outputCanvas.height = OUTPUT_SIZE;
  ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.imageSmoothingEnabled = false;

  if (!tiles || !tiles.length) {
    throw new Error("Render failed: no tiles available");
  }
  if (!maskImg) {
    throw new Error("Render failed: no mask image available");
  }
  if (!sourceQrCanvas) {
    throw new Error("Render failed: no source QR canvas available");
  }

  const safeModuleCount = Math.max(21, moduleCount || sourceQrCanvas.width);
  const safeBlockModules = Math.max(1, blockModules);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = OUTPUT_SIZE;
  maskCanvas.height = OUTPUT_SIZE;
  drawScaledMaskToCanvas(maskImg, maskCanvas, maskScale, maskPadding, invertMask);

  const mctx = maskCanvas.getContext("2d");

  const mainCanvas = document.createElement("canvas");
  mainCanvas.width = OUTPUT_SIZE;
  mainCanvas.height = OUTPUT_SIZE;

  const mainCtx = mainCanvas.getContext("2d");
  mainCtx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  mainCtx.imageSmoothingEnabled = false;

  const autoFit = findBestQrPlacement(mctx, OUTPUT_SIZE, safeModuleCount, qrSize);

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

  const moduleDisplaySize = fit.moduleDisplaySize;
  const tileDisplaySize = moduleDisplaySize * safeBlockModules;

  const tightness = clamp(Number(blendTightness) / 100, 0, 1);
  const minCoverage = 0.14 + tightness * 0.30;

  // Base camo fill for the whole silhouette
  for (let y = 0; y < OUTPUT_SIZE; y += tileDisplaySize) {
    for (let x = 0; x < OUTPUT_SIZE; x += tileDisplaySize) {
      const coverage = cellMaskCoverage(mctx, x, y, tileDisplaySize);
      if (coverage < minCoverage) continue;

      const gridX = Math.floor(x / tileDisplaySize);
      const gridY = Math.floor(y / tileDisplaySize);

      const tileCanvas = normalizeTile(
        tiles[pickTileIndex(gridX, gridY, tiles.length, 17)]
      );
      if (!tileCanvas) continue;

      drawTile(mainCtx, tileCanvas, x, y, tileDisplaySize);
    }
  }

  // Integrate the QR modules directly into the artwork
  drawQrModulesIntegrated(mainCtx, sourceQrCanvas, mctx, fit, tiles);

  // Clip final artwork to mask
  mainCtx.globalCompositeOperation = "destination-in";
  mainCtx.drawImage(maskCanvas, 0, 0);
  mainCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(mainCanvas, 0, 0);

  applyEdgePostFX(ctx, maskCanvas, 3);
}
