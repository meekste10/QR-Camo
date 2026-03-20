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

export function extractTiles(sourceCanvas, tileModules = 2, options = {}) {
  const {
    stride = tileModules,
    rejectMostlySolid = true
  } = options;

  const tiles = [];

  for (let y = 0; y + tileModules <= sourceCanvas.height; y += stride) {
    for (let x = 0; x + tileModules <= sourceCanvas.width; x += stride) {
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileModules;
      tileCanvas.height = tileModules;

      const tctx = tileCanvas.getContext("2d");
      tctx.imageSmoothingEnabled = false;

      tctx.drawImage(
        sourceCanvas,
        x, y, tileModules, tileModules,
        0, 0, tileModules, tileModules
      );

      const stats = getTileStats(tileCanvas);

      if (rejectMostlySolid) {
        if (stats.blackRatio < 0.03 || stats.blackRatio > 0.97) {
          continue;
        }
      }

      tiles.push({
        canvas: tileCanvas,
        stats
      });
    }
  }

  return tiles;
}
