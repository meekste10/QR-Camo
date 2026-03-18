export const maskPresets = {
  heart: "../assets/masks/heart.png",
  house: "../assets/masks/house.png",
  tag: "../assets/masks/tag.png",
  star: "../assets/masks/star.png",
  pizza: "../assets/masks/pizza.png",
  mug: "../assets/masks/mug.png",
  tree: "../assets/masks/tree.png",
  turtle: "../assets/masks/turtle.png"
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load preset mask: ${src}`));
    img.src = src;
  });
}

function makeCanvasFromImage(img, size = 800) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const sw = img.width || 1;
  const sh = img.height || 1;
  const scale = Math.min(size / sw, size / sh);

  const drawW = Math.round(sw * scale);
  const drawH = Math.round(sh * scale);
  const dx = Math.round((size - drawW) / 2);
  const dy = Math.round((size - drawH) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, dx, dy, drawW, drawH);

  return canvas;
}

function labelFromKey(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export async function loadPresetMasks() {
  const entries = Object.entries(maskPresets);

  return Promise.all(
    entries.map(async ([key, src]) => {
      const image = await loadImage(src);
      const canvas = makeCanvasFromImage(image, 800);

      return {
        key,
        label: labelFromKey(key),
        src,
        image,
        canvas
      };
    })
  );
}
