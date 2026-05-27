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
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
    return [];
  }

  const safeTileSize = Math.max(1, Math.floor(tileSize));

  const {
    stride = safeTileSize,
    rejectMostlySolid = true,
    minBlackRatio = 0.02,
    maxBlackRatio = 0.98
  } = options;

  const safeStride = Math.max(1, Math.floor(stride));
  const tiles = [];
  const rejected = [];

  for (let y = 0; y + safeTileSize <= sourceCanvas.height; y += safeStride) {
    for (let x = 0; x + safeTileSize <= sourceCanvas.width; x += safeStride) {
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = safeTileSize;
      tileCanvas.height = safeTileSize;

      const tctx = tileCanvas.getContext("2d");
      tctx.imageSmoothingEnabled = false;

      tctx.drawImage(
        sourceCanvas,
        x, y, safeTileSize, safeTileSize,
        0, 0, safeTileSize, safeTileSize
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
