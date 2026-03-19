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

export function extractTiles(imageData, tileSize) {
  const { width, height, data } = imageData;

  const tiles = [];

  const cols = Math.floor(width / tileSize);
  const rows = Math.floor(height / tileSize);

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const canvas = document.createElement("canvas");
      canvas.width = tileSize;
      canvas.height = tileSize;

      const ctx = canvas.getContext("2d");
      const tileImage = ctx.createImageData(tileSize, tileSize);

      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const srcX = tx * tileSize + x;
          const srcY = ty * tileSize + y;

          const srcIndex = (srcY * width + srcX) * 4;
          const dstIndex = (y * tileSize + x) * 4;

          tileImage.data[dstIndex] = data[srcIndex];
          tileImage.data[dstIndex + 1] = data[srcIndex + 1];
          tileImage.data[dstIndex + 2] = data[srcIndex + 2];
          tileImage.data[dstIndex + 3] = data[srcIndex + 3];
        }
      }

      ctx.putImageData(tileImage, 0, 0);
      tiles.push(canvas);
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

  strong.forEach((tile) => {
    pool.push(tile, tile, tile, tile, tile);
  });

  medium.forEach((tile) => {
    pool.push(tile, tile, tile);
  });

  weak.forEach((tile) => {
    pool.push(tile);
  });

  return pool.length ? pool : tiles;
}

export function randomTileFromPool(pool) {
  if (!pool || !pool.length) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
