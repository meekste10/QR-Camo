export function loadImage(fileOrSrc) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));

    if (typeof fileOrSrc === "string") {
      img.src = fileOrSrc;
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(fileOrSrc);
  });
}

export function drawToCanvas(img, canvas) {
  const maxSize = 900;
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);

  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, width, height);

  return ctx.getImageData(0, 0, width, height);
}
