function getTileStats(tileCanvas) {
  const ctx = tileCanvas.getContext("2d");
  const { width, height } = tileCanvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let blackCount = 0;
  let whiteCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const isBlack = data[i] < 128;
    if (isBlack) blackCount++;
    else whiteCount++;
  }

  const total = blackCount + whiteCount;
  const blackRatio = total ? blackCount / total : 0;
  const contrastScore = 1 - Math.abs(0.5 - blackRatio) * 2;

  return {
    blackCount,
    whiteCount,
    blackRatio,
    contrastScore
  };
}

export function extractTiles(sourceCanvas, tileSize = 2, options = {}) {
  const {
    stride = tileSize,
    rejectMostlySolid = true,
    minBlackRatio = 0.02,
    maxBlackRatio = 0.98
  } = options;

  const tiles = [];
  const rejected = [];

  for (let y = 0; y + tileSize <= sourceCanvas.height; y += stride) {
    for (let x = 0; x + tileSize <= sourceCanvas.width; x += stride) {
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

      const stats = getTileStats(tileCanvas);

      const tile = {
        canvas: tileCanvas,
        stats
      };

      if (rejectMostlySolid) {
        if (stats.blackRatio < minBlackRatio || stats.blackRatio > maxBlackRatio) {
          rejected.push(tile);
          continue;
        }
      }

      tiles.push(tile);
    }
  }

  if (!tiles.length && rejected.length) {
    return rejected;
  }

  return tiles;
}
