export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function drawToCanvas(img, canvas, maxSize = 1200) {
  const ctx = canvas.getContext("2d");

  let width = img.width;
  let height = img.height;

  if (width > maxSize || height > maxSize) {
    const scale = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return ctx.getImageData(0, 0, width, height);
}

export function downloadCanvas(canvas, name = "qr-camo.png") {
  const link = document.createElement("a");
  link.download = name;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
