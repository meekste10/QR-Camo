export function buildMaskFromImage(img, options = {}) {
  const {
    size = 800,
    invert = false,
    targetFill = 0.9,
    backgroundTolerance = 40,
    alphaTolerance = 12,
    workSize = 512
  } = options;

  const workScale = Math.min(
    workSize / Math.max(1, img.width),
    workSize / Math.max(1, img.height),
    1
  );

  const workW = Math.max(1, Math.round(img.width * workScale));
  const workH = Math.max(1, Math.round(img.height * workScale));

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = workW;
  sourceCanvas.height = workH;
  const sctx = sourceCanvas.getContext("2d");

  sctx.clearRect(0, 0, workW, workH);
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0, workW, workH);

  const imageData = sctx.getImageData(0, 0, workW, workH);
  const { data } = imageData;

  function index(x, y, width) {
    return y * width + x;
  }

  function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function colorDistance(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function getPixel(x, y) {
    const i = (y * workW + x) * 4;
    return {
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
      a: data[i + 3]
    };
  }

  function estimateBackgroundColor() {
    const samples = [];
    const step = Math.max(1, Math.floor(Math.min(workW, workH) / 24));

    for (let x = 0; x < workW; x += step) {
      const t = getPixel(x, 0);
      const b = getPixel(x, workH - 1);
      if (t.a > alphaTolerance) samples.push(t);
      if (b.a > alphaTolerance) samples.push(b);
    }

    for (let y = 0; y < workH; y += step) {
      const l = getPixel(0, y);
      const r = getPixel(workW - 1, y);
      if (l.a > alphaTolerance) samples.push(l);
      if (r.a > alphaTolerance) samples.push(r);
    }

    if (!samples.length) {
      return { r: 255, g: 255, b: 255 };
    }

    let r = 0;
    let g = 0;
    let b = 0;

    for (const p of samples) {
      r += p.r;
      g += p.g;
      b += p.b;
    }

    return {
      r: Math.round(r / samples.length),
      g: Math.round(g / samples.length),
      b: Math.round(b / samples.length)
    };
  }

  function buildGrayMap() {
    const gray = new Float32Array(workW * workH);

    for (let y = 0; y < workH; y++) {
      for (let x = 0; x < workW; x++) {
        const i = (y * workW + x) * 4;
        gray[index(x, y, workW)] = luminance(
          data[i],
          data[i + 1],
          data[i + 2]
        );
      }
    }

    return gray;
  }

  function buildEdgeMap(gray) {
    const edge = new Float32Array(workW * workH);

    for (let y = 1; y < workH - 1; y++) {
      for (let x = 1; x < workW - 1; x++) {
        const left = gray[index(x - 1, y, workW)];
        const right = gray[index(x + 1, y, workW)];
        const up = gray[index(x, y - 1, workW)];
        const down = gray[index(x, y + 1, workW)];

        edge[index(x, y, workW)] = (Math.abs(right - left) + Math.abs(down - up)) * 0.5;
      }
    }

    return edge;
  }

  function dilate(mask, width, height, radius = 1) {
    const out = new Uint8Array(mask.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let on = 0;

        for (let dy = -radius; dy <= radius && !on; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (mask[index(nx, ny, width)]) {
              on = 1;
              break;
            }
          }
        }

        out[index(x, y, width)] = on;
      }
    }

    return out;
  }

  function erode(mask, width, height, radius = 1) {
    const out = new Uint8Array(mask.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let on = 1;

        for (let dy = -radius; dy <= radius && on; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              on = 0;
              break;
            }
            if (!mask[index(nx, ny, width)]) {
              on = 0;
              break;
            }
          }
        }

        out[index(x, y, width)] = on;
      }
    }

    return out;
  }

  function openMask(mask, width, height, radius = 1) {
    return dilate(erode(mask, width, height, radius), width, height, radius);
  }

  function closeMask(mask, width, height, radius = 1) {
    return erode(dilate(mask, width, height, radius), width, height, radius);
  }

  function extractComponents(mask, width, height) {
    const visited = new Uint8Array(mask.length);
    const components = [];
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const start = index(x, y, width);
        if (!mask[start] || visited[start]) continue;

        const queue = [start];
        visited[start] = 1;

        const pixels = [];
        let minX = x;
        let minY = y;
        let maxX = x;
        let maxY = y;
        let sumX = 0;
        let sumY = 0;

        for (let q = 0; q < queue.length; q++) {
          const current = queue[q];
          const cx = current % width;
          const cy = Math.floor(current / width);

          pixels.push(current);
          sumX += cx;
          sumY += cy;

          if (cx < minX) minX = cx;
          if (cy < minY) minY = cy;
          if (cx > maxX) maxX = cx;
          if (cy > maxY) maxY = cy;

          for (const [dx, dy] of neighbors) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const ni = index(nx, ny, width);
            if (!mask[ni] || visited[ni]) continue;

            visited[ni] = 1;
            queue.push(ni);
          }
        }

        const area = pixels.length;
        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;

        components.push({
          pixels,
          area,
          minX,
          minY,
          maxX,
          maxY,
          boxW,
          boxH,
          cx: sumX / area,
          cy: sumY / area
        });
      }
    }

    return components;
  }

  function keepLargestConnectedComponent(mask, width, height) {
    const components = extractComponents(mask, width, height);
    if (!components.length) return mask;

    let best = components[0];
    for (const comp of components) {
      if (comp.area > best.area) best = comp;
    }

    const out = new Uint8Array(width * height);
    for (const p of best.pixels) {
      out[p] = 1;
    }

    return out;
  }

  function cropMask(mask, width, height, padding = 0) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!mask[index(x, y, width)]) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return {
        mask: new Uint8Array(1),
        width: 1,
        height: 1
      };
    }

    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const out = new Uint8Array(cropW * cropH);

    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        out[index(x, y, cropW)] = mask[index(minX + x, minY + y, width)];
      }
    }

    return {
      mask: out,
      width: cropW,
      height: cropH
    };
  }

  function fillSmallInternalHoles(mask, width, height, maxHoleArea = 64) {
    const visited = new Uint8Array(mask.length);
    const out = new Uint8Array(mask);

    function floodHole(startIdx) {
      const queue = [startIdx];
      visited[startIdx] = 1;

      const pixels = [];
      let touchesEdge = false;

      for (let q = 0; q < queue.length; q++) {
        const current = queue[q];
        const x = current % width;
        const y = Math.floor(current / width);

        pixels.push(current);

        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          touchesEdge = true;
        }

        const neighbors = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ];

        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

          const ni = index(nx, ny, width);
          if (visited[ni] || mask[ni]) continue;

          visited[ni] = 1;
          queue.push(ni);
        }
      }

      if (!touchesEdge && pixels.length <= maxHoleArea) {
        for (const p of pixels) {
          out[p] = 1;
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = index(x, y, width);
        if (mask[i] || visited[i]) continue;
        floodHole(i);
      }
    }

    return out;
  }

  function buildMaskFromAlpha() {
    const out = new Uint8Array(workW * workH);

    for (let y = 0; y < workH; y++) {
      for (let x = 0; x < workW; x++) {
        const i = (y * workW + x) * 4 + 3;
        if (data[i] > alphaTolerance) {
          out[index(x, y, workW)] = 1;
        }
      }
    }

    return out;
  }

  function buildMaskFromFloodFill() {
    const bg = estimateBackgroundColor();
    const bgGray = luminance(bg.r, bg.g, bg.b);
    const gray = buildGrayMap();
    const edge = buildEdgeMap(gray);

    const bgVisited = new Uint8Array(workW * workH);
    const queue = [];

    function canFlood(x, y) {
      const i = index(x, y, workW);
      const p = getPixel(x, y);

      if (p.a <= alphaTolerance) return true;

      const dist = colorDistance(p.r, p.g, p.b, bg.r, bg.g, bg.b);
      const grayDiff = Math.abs(gray[i] - bgGray);
      const edgeStrength = edge[i];

      if (dist <= backgroundTolerance) return true;
      if (grayDiff <= 18 && edgeStrength < 16) return true;
      if (dist <= backgroundTolerance * 1.35 && edgeStrength < 10) return true;

      return false;
    }

    function push(x, y) {
      if (x < 0 || y < 0 || x >= workW || y >= workH) return;

      const i = index(x, y, workW);
      if (bgVisited[i]) return;
      if (!canFlood(x, y)) return;

      bgVisited[i] = 1;
      queue.push(i);
    }

    for (let x = 0; x < workW; x++) {
      push(x, 0);
      push(x, workH - 1);
    }

    for (let y = 0; y < workH; y++) {
      push(0, y);
      push(workW - 1, y);
    }

    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      const x = current % workW;
      const y = Math.floor(current / workW);

      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    const out = new Uint8Array(workW * workH);

    for (let y = 0; y < workH; y++) {
      for (let x = 0; x < workW; x++) {
        const i = index(x, y, workW);
        const a = data[i * 4 + 3];

        if (a > alphaTolerance && !bgVisited[i]) {
          out[i] = 1;
        }
      }
    }

    return out;
  }

  let transparentPixels = 0;
  let opaquePixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= alphaTolerance) {
      transparentPixels++;
    } else {
      opaquePixels++;
    }
  }

  const totalPixels = Math.max(1, workW * workH);
  const transparencyRatio = transparentPixels / totalPixels;

  let mask = transparencyRatio > 0.02
    ? buildMaskFromAlpha()
    : buildMaskFromFloodFill();

  mask = closeMask(mask, workW, workH, 1);
  mask = openMask(mask, workW, workH, 1);

  const components = extractComponents(mask, workW, workH);

  if (!components.length) {
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = size;
    emptyCanvas.height = size;
    return emptyCanvas;
  }

  mask = keepLargestConnectedComponent(mask, workW, workH);

  const cropped = cropMask(mask, workW, workH, 1);

  const bridgeRadius = Math.max(
    1,
    Math.min(5, Math.round(Math.min(cropped.width, cropped.height) * 0.012))
  );

  let solidMask = closeMask(
    cropped.mask,
    cropped.width,
    cropped.height,
    bridgeRadius
  );

  solidMask = openMask(
    solidMask,
    cropped.width,
    cropped.height,
    1
  );

  solidMask = keepLargestConnectedComponent(
    solidMask,
    cropped.width,
    cropped.height
  );

  solidMask = fillSmallInternalHoles(
    solidMask,
    cropped.width,
    cropped.height,
    Math.max(8, Math.round(cropped.width * cropped.height * 0.002))
  );

  const finalCropped = cropMask(
    solidMask,
    cropped.width,
    cropped.height,
    1
  );

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = finalCropped.width;
  maskCanvas.height = finalCropped.height;

  const mctx = maskCanvas.getContext("2d");
  const outImage = mctx.createImageData(finalCropped.width, finalCropped.height);

  for (let y = 0; y < finalCropped.height; y++) {
    for (let x = 0; x < finalCropped.width; x++) {
      const on = finalCropped.mask[index(x, y, finalCropped.width)];
      const i = (y * finalCropped.width + x) * 4;

      const inside = invert ? !on : !!on;

      if (inside) {
        outImage.data[i] = 0;
        outImage.data[i + 1] = 0;
        outImage.data[i + 2] = 0;
        outImage.data[i + 3] = 255;
      } else {
        outImage.data[i] = 0;
        outImage.data[i + 1] = 0;
        outImage.data[i + 2] = 0;
        outImage.data[i + 3] = 0;
      }
    }
  }

  mctx.putImageData(outImage, 0, 0);

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;

  const octx = out.getContext("2d");
  octx.clearRect(0, 0, size, size);
  octx.imageSmoothingEnabled = false;

  const scale = Math.min(
    (size * targetFill) / Math.max(1, maskCanvas.width),
    (size * targetFill) / Math.max(1, maskCanvas.height)
  );

  const drawW = Math.max(1, Math.round(maskCanvas.width * scale));
  const drawH = Math.max(1, Math.round(maskCanvas.height * scale));
  const drawX = Math.floor((size - drawW) / 2);
  const drawY = Math.floor((size - drawH) / 2);

  octx.drawImage(maskCanvas, drawX, drawY, drawW, drawH);

  return out;
}”

And then render-engine.js is actually still :”import { pointInsideMask } from "./mask-engine.js?v=0.6.4";

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

function getQrPixelData(qrCanvas) {
  const qctx = qrCanvas.getContext("2d");
  return qctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height).data;
}

function qrModuleIsDark(qrData, qrWidth, x, y) {
  const idx = (y * qrWidth + x) * 4;
  return qrData[idx] < 128;
}

function drawQrLayer(ctx, maskCtx, qrCanvas, fit) {
  const qrData = getQrPixelData(qrCanvas);
  const qrWidth = qrCanvas.width;
  const qrHeight = qrCanvas.height;
  const moduleSize = fit.moduleDisplaySize;

  for (let row = 0; row < qrHeight; row++) {
    for (let col = 0; col < qrWidth; col++) {
      const x = fit.x + col * moduleSize;
      const y = fit.y + row * moduleSize;

      const coverage = cellMaskCoverage(maskCtx, x, y, moduleSize);
      if (coverage < 0.58) continue;

      const isDark = qrModuleIsDark(qrData, qrWidth, col, row);
      ctx.fillStyle = isDark ? "#000000" : "#ffffff";
      ctx.fillRect(x, y, moduleSize, moduleSize);
    }
  }
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
    moduleDisplaySize = 8
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

  drawQrLayer(qrLayerCtx, maskCtx, sourceQrCanvas, liveFit);

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
    liveScale = 1
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
    moduleDisplaySize: placement.moduleDisplaySize
  });

  drawSingleQrOverlay({
    baseCanvas,
    maskCanvas,
    qrMaskCanvas: maskCanvas,
    outputCanvas,
    sourceQrCanvas,
    moduleCount,
    placement,
    qrSize,
    liveScale,
    qrOffsetX,
    qrOffsetY,
    outputSize: OUTPUT_SIZE
  });

  return { baseCanvas, maskCanvas, qrMaskCanvas, placement };
}
