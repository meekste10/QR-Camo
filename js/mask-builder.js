export function buildMaskFromImage(img, options = {}) {
  const {
    size = 800,
    invert = false,
    targetFill = 0.9,
    backgroundTolerance = 32,
    alphaTolerance = 20
  } = options;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = img.width;
  sourceCanvas.height = img.height;
  const sctx = sourceCanvas.getContext("2d");
  sctx.clearRect(0, 0, img.width, img.height);
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0);

  const imageData = sctx.getImageData(0, 0, img.width, img.height);
  const { width, height, data } = imageData;

  function idx(x, y) {
    return (y * width + x) * 4;
  }

  function colorDistance(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function getPixel(x, y) {
    const i = idx(x, y);
    return {
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
      a: data[i + 3]
    };
  }

  function averageBackgroundColor() {
    const samples = [];
    const points = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
      [Math.floor(width * 0.5), 0],
      [Math.floor(width * 0.5), height - 1],
      [0, Math.floor(height * 0.5)],
      [width - 1, Math.floor(height * 0.5)]
    ];

    for (const [x, y] of points) {
      const p = getPixel(x, y);
      if (p.a > alphaTolerance) {
        samples.push(p);
      }
    }

    if (!samples.length) {
      return { r: 255, g: 255, b: 255 };
    }

    const sum = samples.reduce(
      (acc, p) => {
        acc.r += p.r;
        acc.g += p.g;
        acc.b += p.b;
        return acc;
      },
      { r: 0, g: 0, b: 0 }
    );

    return {
      r: Math.round(sum.r / samples.length),
      g: Math.round(sum.g / samples.length),
      b: Math.round(sum.b / samples.length)
    };
  }

  const bg = averageBackgroundColor();

  // Step 1: foreground extraction based on difference from background
  const solid = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a <= alphaTolerance) continue;

      const dist = colorDistance(r, g, b, bg.r, bg.g, bg.b);
      if (dist > backgroundTolerance) {
        solid[y * width + x] = 1;
      }
    }
  }

  // Step 2: keep only the largest connected foreground component
  const visited = new Uint8Array(width * height);
  let bestPixels = null;
  let bestCount = 0;

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let start = 0; start < solid.length; start++) {
    if (!solid[start] || visited[start]) continue;

    const queue = [start];
    visited[start] = 1;

    const pixels = [];
    let qIndex = 0;

    while (qIndex < queue.length) {
      const current = queue[qIndex++];
      pixels.push(current);

      const x = current % width;
      const y = Math.floor(current / width);

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

        const ni = ny * width + nx;
        if (!solid[ni] || visited[ni]) continue;

        visited[ni] = 1;
        queue.push(ni);
      }
    }

    if (pixels.length > bestCount) {
      bestCount = pixels.length;
      bestPixels = pixels;
    }
  }

  const mainMask = new Uint8Array(width * height);
  if (bestPixels) {
    for (const p of bestPixels) {
      mainMask[p] = 1;
    }
  }

  // Step 3: fill internal holes so logos become a full silhouette
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mainMask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = size;
    emptyCanvas.height = size;
    return emptyCanvas;
  }

  const pad = 2;
  const bw = maxX - minX + 1 + pad * 2;
  const bh = maxY - minY + 1 + pad * 2;

  const boxMask = new Uint8Array(bw * bh);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (mainMask[y * width + x]) {
        const bx = x - minX + pad;
        const by = y - minY + pad;
        boxMask[by * bw + bx] = 1;
      }
    }
  }

  const outsideVisited = new Uint8Array(bw * bh);
  const floodQueue = [];

  function pushIfEmpty(x, y) {
    if (x < 0 || y < 0 || x >= bw || y >= bh) return;
    const i = y * bw + x;
    if (outsideVisited[i] || boxMask[i]) return;
    outsideVisited[i] = 1;
    floodQueue.push(i);
  }

  for (let x = 0; x < bw; x++) {
    pushIfEmpty(x, 0);
    pushIfEmpty(x, bh - 1);
  }
  for (let y = 0; y < bh; y++) {
    pushIfEmpty(0, y);
    pushIfEmpty(bw - 1, y);
  }

  let fq = 0;
  while (fq < floodQueue.length) {
    const current = floodQueue[fq++];
    const x = current % bw;
    const y = Math.floor(current / bw);

    pushIfEmpty(x + 1, y);
    pushIfEmpty(x - 1, y);
    pushIfEmpty(x, y + 1);
    pushIfEmpty(x, y - 1);
  }

  // Fill holes: any empty pixel not reachable from outside becomes solid
  for (let i = 0; i < boxMask.length; i++) {
    if (!boxMask[i] && !outsideVisited[i]) {
      boxMask[i] = 1;
    }
  }

  // Step 4: draw final mask centered into square output canvas
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = bw;
  cropCanvas.height = bh;
  const cctx = cropCanvas.getContext("2d");
  const cropImage = cctx.createImageData(bw, bh);

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const on = boxMask[y * bw + x];
      const i = (y * bw + x) * 4;

      if ((on && !invert) || (!on && invert)) {
        cropImage.data[i] = 0;
        cropImage.data[i + 1] = 0;
        cropImage.data[i + 2] = 0;
        cropImage.data[i + 3] = 255;
      } else {
        cropImage.data[i] = 0;
        cropImage.data[i + 1] = 0;
        cropImage.data[i + 2] = 0;
        cropImage.data[i + 3] = 0;
      }
    }
  }

  cctx.putImageData(cropImage, 0, 0);

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const octx = out.getContext("2d");
  octx.clearRect(0, 0, size, size);
  octx.imageSmoothingEnabled = false;

  const scale = Math.min(
    (size * targetFill) / cropCanvas.width,
    (size * targetFill) / cropCanvas.height
  );

  const drawW = Math.max(1, Math.round(cropCanvas.width * scale));
  const drawH = Math.max(1, Math.round(cropCanvas.height * scale));
  const drawX = Math.floor((size - drawW) / 2);
  const drawY = Math.floor((size - drawH) / 2);

  octx.drawImage(cropCanvas, drawX, drawY, drawW, drawH);

  return out;
}
