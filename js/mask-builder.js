export function buildMaskFromImage(img, options = {}) {
  const {
    size = 800,
    threshold = 180,
    invert = false,
    targetFill = 0.9,
    removeDetectedBackground = true,
    backgroundTolerance = 52,
    forceBackgroundToWhite = true
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  const scale = Math.min(
    (size * targetFill) / img.width,
    (size * targetFill) / img.height
  );

  const drawW = Math.max(1, Math.round(img.width * scale));
  const drawH = Math.max(1, Math.round(img.height * scale));
  const drawX = Math.floor((size - drawW) / 2);
  const drawY = Math.floor((size - drawH) / 2);

  if (forceBackgroundToWhite) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  let imageData = ctx.getImageData(0, 0, size, size);
  let d = imageData.data;

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
    const clampedX = Math.max(0, Math.min(size - 1, x));
    const clampedY = Math.max(0, Math.min(size - 1, y));
    const idx = (clampedY * size + clampedX) * 4;
    return {
      r: d[idx],
      g: d[idx + 1],
      b: d[idx + 2],
      a: d[idx + 3]
    };
  }

  function averagePixels(samples) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    for (const p of samples) {
      r += p.r;
      g += p.g;
      b += p.b;
      a += p.a;
    }

    const count = Math.max(1, samples.length);

    return {
      r: r / count,
      g: g / count,
      b: b / count,
      a: a / count
    };
  }

  function estimateBackgroundColor() {
    const samples = [];
    const step = Math.max(4, Math.floor(size / 40));

    for (let x = 0; x < size; x += step) {
      samples.push(getPixel(x, 0));
      samples.push(getPixel(x, size - 1));
    }

    for (let y = 0; y < size; y += step) {
      samples.push(getPixel(0, y));
      samples.push(getPixel(size - 1, y));
    }

    return averagePixels(samples);
  }

  function buildGrayscaleAndEdgeMaps() {
    const gray = new Float32Array(size * size);
    const edge = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        gray[y * size + x] = luminance(d[idx], d[idx + 1], d[idx + 2]);
      }
    }

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const center = gray[y * size + x];
        const left = gray[y * size + (x - 1)];
        const right = gray[y * size + (x + 1)];
        const up = gray[(y - 1) * size + x];
        const down = gray[(y + 1) * size + x];

        const gx = Math.abs(right - left);
        const gy = Math.abs(down - up);

        edge[y * size + x] = (gx + gy) * 0.5;
      }
    }

    return { gray, edge };
  }

  function buildBinaryMask() {
    const bg = estimateBackgroundColor();
    const { gray, edge } = buildGrayscaleAndEdgeMaps();
    const mask = new Uint8ClampedArray(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pIdx = (y * size + x) * 4;
        const mIdx = y * size + x;

        const r = d[pIdx];
        const g = d[pIdx + 1];
        const b = d[pIdx + 2];
        const a = d[pIdx + 3];

        if (a === 0) {
          mask[mIdx] = invert ? 255 : 0;
          continue;
        }

        const lum = gray[mIdx];
        const edgeStrength = edge[mIdx];
        const bgDist = colorDistance(r, g, b, bg.r, bg.g, bg.b);

        const isNearBackground =
          removeDetectedBackground &&
          bgDist <= backgroundTolerance &&
          edgeStrength < 22;

        let inside = false;

        if (isNearBackground) {
          inside = false;
        } else {
          const darkEnough = lum < threshold;
          const edgeEnough = edgeStrength > 18;
          inside = darkEnough || edgeEnough;
        }

        if (invert) inside = !inside;

        mask[mIdx] = inside ? 255 : 0;
      }
    }

    return mask;
  }

  function dilate(mask, radius = 1) {
    const out = new Uint8ClampedArray(mask.length);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let on = false;

        for (let dy = -radius; dy <= radius && !on; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            if (mask[ny * size + nx] > 0) {
              on = true;
              break;
            }
          }
        }

        out[y * size + x] = on ? 255 : 0;
      }
    }

    return out;
  }

  function erode(mask, radius = 1) {
    const out = new Uint8ClampedArray(mask.length);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let on = true;

        for (let dy = -radius; dy <= radius && on; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
              on = false;
              break;
            }
            if (mask[ny * size + nx] === 0) {
              on = false;
              break;
            }
          }
        }

        out[y * size + x] = on ? 255 : 0;
      }
    }

    return out;
  }

  function closeMask(mask) {
    // fills small gaps and makes edges more coherent
    return erode(dilate(mask, 1), 1);
  }

  function openMask(mask) {
    // removes tiny noise specks
    return dilate(erode(mask, 1), 1);
  }

  function keepLargestConnectedComponent(mask) {
    const visited = new Uint8Array(size * size);
    let bestComponent = null;
    let bestCount = 0;

    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const startIdx = y * size + x;
        if (visited[startIdx] || mask[startIdx] === 0) continue;

        const queue = [startIdx];
        const component = [];
        visited[startIdx] = 1;

        while (queue.length) {
          const idx = queue.pop();
          component.push(idx);

          const cx = idx % size;
          const cy = Math.floor(idx / size);

          for (const [dx, dy] of neighbors) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;

            const nIdx = ny * size + nx;
            if (visited[nIdx] || mask[nIdx] === 0) continue;

            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }

        if (component.length > bestCount) {
          bestCount = component.length;
          bestComponent = component;
        }
      }
    }

    if (!bestComponent) return mask;

    const out = new Uint8ClampedArray(size * size);
    for (const idx of bestComponent) {
      out[idx] = 255;
    }
    return out;
  }

  let mask = buildBinaryMask();

  mask = closeMask(mask);
  mask = openMask(mask);
  mask = keepLargestConnectedComponent(mask);

  // draw final alpha mask
  const out = ctx.createImageData(size, size);
  const outData = out.data;

  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    const idx = i * 4;

    if (v > 0) {
      outData[idx] = 0;
      outData[idx + 1] = 0;
      outData[idx + 2] = 0;
      outData[idx + 3] = 255;
    } else {
      outData[idx] = 0;
      outData[idx + 1] = 0;
      outData[idx + 2] = 0;
      outData[idx + 3] = 0;
    }
  }

  ctx.clearRect(0, 0, size, size);
  ctx.putImageData(out, 0, 0);

  return canvas;
}
