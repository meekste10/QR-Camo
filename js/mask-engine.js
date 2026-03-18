export async function loadMask(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load mask: ${src}`));
    img.src = src;
  });
}

export function pointInsideMask(maskCtx, x, y) {
  const pixel = maskCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return pixel[3] > 0 && pixel[0] > 10;
}
