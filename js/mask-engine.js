export async function loadMask(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function pointInsideMask(ctx, x, y) {
  const data = ctx.getImageData(x, y, 1, 1).data;
  return data[3] > 10;
}
