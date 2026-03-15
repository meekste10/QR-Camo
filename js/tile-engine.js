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

  return {
    blackCount,
    whiteCount,
    blackRatio
  };
}

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

  const pool = [];

  for (const tile of tiles) {
    const r = tile.stats.blackRatio;

    // throw away tiles that are almost solid black or white
    if (r < 0.08 || r > 0.92) continue;

    // strongly prefer middle-balance tiles
    if (r >= 0.35 && r <= 0.65) {
      pool.push(tile, tile, tile, tile, tile, tile);
    }
    // moderately prefer near-middle tiles
    else if (r >= 0.22 && r <= 0.78) {
      pool.push(tile, tile, tile, tile);
    }
    // allow edge cases lightly
    else {
      pool.push(tile, tile);
    }
  }

  return pool.length ? pool : tiles;
}

export function randomTileFromPool(pool) {
  if (!pool || !pool.length) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
