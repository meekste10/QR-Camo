export function extractTiles(imageData, tileSize) {
  const tiles = [];

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = imageData.width;
  sourceCanvas.height = imageData.height;
  const sctx = sourceCanvas.getContext("2d");
  sctx.putImageData(imageData, 0, 0);

  for (let y = 0; y + tileSize <= imageData.height; y += tileSize) {
    for (let x = 0; x + tileSize <= imageData.width; x += tileSize) {
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileSize;
      tileCanvas.height = tileSize;
      const tctx = tileCanvas.getContext("2d");
      tctx.imageSmoothingEnabled = false;

      tctx.drawImage(
        sourceCanvas,
        x, y, tileSize, tileSize,
        0, 0, tileSize, tileSize
      );

      tiles.push(tileCanvas);
    }
  }

  return tiles;
}
