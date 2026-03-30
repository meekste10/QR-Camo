export function buildMaskFromImage(img, options = {}) {
  const {
    size = 800,
    targetFill = 0.9,

    // Background cleanup
    removeWhiteBackground = true,
    backgroundThreshold = 245,

    // Base fill logic
    threshold = 180,
    invert = false,

    // Smarter logo handling
    subtractDarkDetails = true,
    holeThreshold = 90,
    maxHoleFraction = 0.38
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

  const drawW = Math.round(img.width * scale);
  const drawH = Math.round(img.height * scale);
  const drawX = Math.floor((size - drawW) / 2);
  const drawY = Math.floor((size - drawH) / 2);

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, size, size);
  const d = imageData.data;

  const pixelCount = size * size;
  const baseInside = new Uint8Array(pixelCount);
  const darkHole = new Uint8Array(pixelCount);

  let foregroundCount = 0;
  let darkForegroundCount = 0;

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];

    if (a === 0) continue;

    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    const isNearWhite =
      r >= backgroundThreshold &&
      g >= backgroundThreshold &&
      b >= backgroundThreshold;

    // Step 1: establish base foreground
    let inside = gray < threshold;

    // If requested, treat non-white opaque pixels as foreground too.
    // This helps colored logos like Spotify.
    if (removeWhiteBackground && !isNearWhite) {
      inside = true;
    }

    if (invert) inside = !inside;

    if (inside) {
      baseInside[p] = 1;
      foregroundCount++;

      // Track very dark internal details that may need to become cutouts
      if (gray <= holeThreshold) {
        darkHole[p] = 1;
        darkForegroundCount++;
      }
    }
  }

  // Decide whether dark pixels should be subtracted as internal holes.
  // Good for logos like Spotify.
  const holeFraction = foregroundCount
    ? darkForegroundCount / foregroundCount
    : 0;

  const shouldSubtractDarkDetails =
    subtractDarkDetails &&
    foregroundCount > 0 &&
    darkForegroundCount > 0 &&
    holeFraction > 0.01 &&
    holeFraction < maxHoleFraction;

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let inside = baseInside[p] === 1;

    if (inside && shouldSubtractDarkDetails && darkHole[p] === 1) {
      inside = false;
    }

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
