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
}
