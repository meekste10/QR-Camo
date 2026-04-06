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
    const edgeStep = Math.max(1, Math.floor(Math.min(workW, workH) / 24));

    for (let x = 0; x < workW; x += edgeStep) {
      const p1 = getPixel(x, 0);
      const p2 = getPixel(x, workH - 1);
      if (p1.a > alphaTolerance) samples.push(p1);
      if (p2.a > alphaTolerance) samples.push(p2);
    }

    for (let y = 0; y < workH; y += edgeStep) {
      const p1 = getPixel(0, y);
      const p2 = getPixel(workW - 1, y);
      if (p1.a > alphaTolerance) samples.push(p1);
      if (p2.a > alphaTolerance) samples.push(p2);
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

  function bboxGap(a, b) {
    const dx = Math.max(0, a.minX - b.maxX - 1, b.minX - a.maxX - 1);
    const dy = Math.max(0, a.minY - b.maxY - 1, b.minY - a.maxY - 1);
    return Math.max(dx, dy);
  }

  function unionBoxes(a, b) {
    return {
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY)
    };
  }

  function buildMaskFromComponents(components, width, height) {
    const out = new Uint8Array(width * height);
    for (const comp of components) {
      for (const p of comp.pixels) {
        out[p] = 1;
      }
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

  function fillInternalHoles(mask, width, height) {
    const visited = new Uint8Array(mask.length);
    const queue = [];

    function push(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = index(x, y, width);
      if (visited[i] || mask[i]) return;
      visited[i] = 1;
      queue.push(i);
    }

    for (let x = 0; x < width; x++) {
      push(x, 0);
      push(x, height - 1);
    }

    for (let y = 0; y < height; y++) {
      push(0, y);
      push(width - 1, y);
    }

    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      const x = current % width;
      const y = Math.floor(current / width);

      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    const out = new Uint8Array(mask);

    for (let i = 0; i < out.length; i++) {
      if (!out[i] && !visited[i]) {
        out[i] = 1;
      }
    }

    return out;
  }

  const bg = estimateBackgroundColor();

  let initialMask = new Uint8Array(workW * workH);

  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      const i = (y * workW + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a <= alphaTolerance) continue;

      const dist = colorDistance(r, g, b, bg.r, bg.g, bg.b);
      const inside = dist > backgroundTolerance;

      if (inside) {
        initialMask[index(x, y, workW)] = 1;
      }
    }
  }

  initialMask = closeMask(initialMask, workW, workH, 1);
  initialMask = openMask(initialMask, workW, workH, 1);

  const components = extractComponents(initialMask, workW, workH);

  if (!components.length) {
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = size;
    emptyCanvas.height = size;
    return emptyCanvas;
  }

  const anchor = components
    .slice()
    .sort((a, b) => {
      const aScore = a.area * (1 + (1 - a.cy / workH) * 0.12);
      const bScore = b.area * (1 + (1 - b.cy / workH) * 0.12);
      return bScore - aScore;
    })[0];

  const joinGap = Math.max(3, Math.round(Math.max(anchor.boxW, anchor.boxH) * 0.14));
  const minJoinArea = Math.max(6, Math.round(anchor.area * 0.012));

  const selected = [anchor];
  let union = {
    minX: anchor.minX,
    minY: anchor.minY,
    maxX: anchor.maxX,
    maxY: anchor.maxY
  };

  let changed = true;
  while (changed) {
    changed = false;

    for (const comp of components) {
      if (selected.includes(comp)) continue;
      if (comp.area < minJoinArea) continue;

      const gap = bboxGap(comp, union);
      if (gap <= joinGap) {
        selected.push(comp);
        union = unionBoxes(union, comp);
        changed = true;
      }
    }
  }

  let clusterMask = buildMaskFromComponents(selected, workW, workH);

  const croppedBeforeClose = cropMask(clusterMask, workW, workH, 2);
  const solidifyRadius = Math.max(
    2,
    Math.min(24, Math.round(Math.min(croppedBeforeClose.width, croppedBeforeClose.height) * 0.045))
  );

  let solidMask = closeMask(
    croppedBeforeClose.mask,
    croppedBeforeClose.width,
    croppedBeforeClose.height,
    solidifyRadius
  );

  solidMask = closeMask(
    solidMask,
    croppedBeforeClose.width,
    croppedBeforeClose.height,
    Math.max(1, Math.round(solidifyRadius * 0.5))
  );

  solidMask = fillInternalHoles(
    solidMask,
    croppedBeforeClose.width,
    croppedBeforeClose.height
  );

  const finalCropped = cropMask(
    solidMask,
    croppedBeforeClose.width,
    croppedBeforeClose.height,
    2
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
