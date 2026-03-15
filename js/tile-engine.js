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

export function extractTilesFromModuleCanvas(moduleCanvas) {
  const tiles = [];
  const w = moduleCanvas.width;
  const h = moduleCanvas.height;
  const sctx = moduleCanvas.getContext("2d");

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = 1;
      tileCanvas.height = 1;
      const tctx = tileCanvas.getContext("2d");
      tctx.imageSmoothingEnabled = false;

      tctx.drawImage(
        moduleCanvas,
        x, y, 1, 1,
        0, 0, 1, 1
      );

      const stats = getTileStats(tileCanvas);

      tiles.push({
        canvas: tileCanvas,
        stats
      });
    }
  }

  return tiles;
}

export function buildWeightedTilePool(tiles) {
  if (!tiles || !tiles.length) return [];

  const strong = [];
  const medium = [];
  const weak = [];

  for (const tile of tiles) {
    const score = tile.stats.contrastScore;
    const blackRatio = tile.stats.blackRatio;

    if (blackRatio < 0.05 || blackRatio > 0.95) {
      weak.push(tile);
    } else if (score >= 0.55) {
      strong.push(tile);
    } else if (score >= 0.25) {
      medium.push(tile);
    } else {
      weak.push(tile);
    }
  }

  const pool = [];

  strong.forEach(tile => {
    pool.push(tile, tile, tile, tile, tile);
  });

  medium.forEach(tile => {
    pool.push(tile, tile, tile);
  });

  weak.forEach(tile => {
    pool.push(tile);
  });

  return pool.length ? pool : tiles;
}

export function randomTileFromPool(pool) {
  if (!pool || !pool.length) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
