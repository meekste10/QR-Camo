function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleCornerBackground(imageData, sampleSize = 24) {
  const { width, height, data } = imageData;

  const corners = [
    [0, 0],
    [Math.max(0, width - sampleSize), 0],
    [0, Math.max(0, height - sampleSize)],
    [Math.max(0, width - sampleSize), Math.max(0, height - sampleSize)]
  ];

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (const [sx, sy] of corners) {
    for (let y = sy; y < Math.min(height, sy + sampleSize); y++) {
      for (let x = sx; x < Math.min(width, sx + sampleSize); x++) {
        const i = (y * width + x) * 4;
        const a = data[i + 3];
        if (a === 0) continue;

        totalR += data[i];
        totalG += data[i + 1];
        totalB += data[i + 2];
        count++;
      }
    }
  }

  if (!count) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count)
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
      break;
  }

  h /= 6;
  return { h, s, l };
}

export function buildMaskFromImage(img, options = {}) {
  const {
    size = 800,
    targetFill = 0.9,
    threshold = 180,
    invert = false,
    removeDetectedBackground = true,
    backgroundTolerance = 58,
    forceBackgroundToWhite = true,
    saturationBoostCutoff = 0.16
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

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, size, size);
  const d = imageData.data;

  const bg = sampleCornerBackground(imageData, 24);
  const bgLum = luminance(bg.r, bg.g, bg.b);
  const bgHsl = rgbToHsl(bg.r, bg.g, bg.b);

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];

    if (a === 0) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      continue;
    }

    const lum = luminance(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    const distFromBg = colorDistance({ r, g, b }, bg);

    const closeToBg =
      removeDetectedBackground &&
      distFromBg <= backgroundTolerance &&
      Math.abs(hsl.l - bgHsl.l) < 0.16 &&
      Math.abs(hsl.s - bgHsl.s) < 0.22;

    if (closeToBg) {
      if (forceBackgroundToWhite) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = 0;
      } else {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      }
      continue;
    }

    const isStrongColoredForeground =
      hsl.s >= saturationBoostCutoff &&
      distFromBg > Math.max(42, backgroundTolerance * 0.7);

    const isDarkForeground = lum < threshold;
    const isLightForegroundOnDarkBg =
      bgLum < 110 && lum > bgLum + 22 && distFromBg > 26;

    let inside =
      isStrongColoredForeground ||
      isDarkForeground ||
      isLightForegroundOnDarkBg;

    if (invert) inside = !inside;

    if (inside) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 255;
    } else {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
