const maskCache = new WeakMap();

export async function loadMask(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load mask: ${src}`));
    img.src = src;
  });
}

function buildMaskCache(maskCtx) {
  const canvas = maskCtx.canvas;
  const { width, height } = canvas;
  const imageData = maskCtx.getImageData(0, 0, width, height).data;

  const alpha = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < imageData.length; i += 4, p++) {
    alpha[p] = imageData[i + 3] > 0 ? 1 : 0;
  }

  const cache = { width, height, alpha };
  maskCache.set(canvas, cache);
  return cache;
}

function getMaskCache(maskCtx) {
  const canvas = maskCtx.canvas;
  let cache = maskCache.get(canvas);

  if (!cache || cache.width !== canvas.width || cache.height !== canvas.height) {
    cache = buildMaskCache(maskCtx);
  }

  return cache;
}

export function invalidateMaskCache(maskCanvasOrCtx) {
  if (!maskCanvasOrCtx) return;

  const canvas = maskCanvasOrCtx.canvas || maskCanvasOrCtx;
  if (canvas) {
    maskCache.delete(canvas);
  }
}

export function pointInsideMask(maskCtx, x, y) {
  const { width, height, alpha } = getMaskCache(maskCtx);

  const px = Math.floor(x);
  const py = Math.floor(y);

  if (px < 0 || py < 0 || px >= width || py >= height) {
    return false;
  }

  return alpha[py * width + px] === 1;
}
