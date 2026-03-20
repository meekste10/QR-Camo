export async function loadMask(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load mask: ${src}`));
    img.src = src;
  });
}

export function pointInsideMask(maskCtx, x, y) {
  const canvas = maskCtx.canvas;

  const px = Math.floor(x);
  const py = Math.floor(y);

  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
    return false;
  }

  const pixel = maskCtx.getImageData(px, py, 1, 1).data;
  return pixel[3] > 0;
}
