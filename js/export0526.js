export function exportPNG(canvas, filename = "qr-camo.png") {
  if (!canvas || !canvas.width || !canvas.height) {
    console.warn("Export failed: canvas is empty");
    return;
  }

  canvas.toBlob((blob) => {
    if (!blob) {
      console.warn("Export failed: could not create blob");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
}
