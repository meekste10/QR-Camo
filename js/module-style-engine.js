const STYLE_CONFIGS = {
  classic: {
    label: "Classic",
    shape: "square",
    scale: 1,
    radius: 0,
    jitter: 0,
    preserveTiming: true
  },
  rounded: {
    label: "Rounded",
    shape: "rounded",
    scale: 0.88,
    radius: 0.34,
    jitter: 0,
    preserveTiming: true
  },
  dots: {
    label: "Dots",
    shape: "circle",
    scale: 0.82,
    radius: 0.5,
    jitter: 0,
    preserveTiming: true
  },
  pearls: {
    label: "Pearls",
    shape: "pearl",
    scale: 0.78,
    radius: 0.5,
    jitter: 0,
    preserveTiming: true
  },
  softInk: {
    label: "Soft Ink",
    shape: "rounded",
    scale: 0.94,
    radius: 0.24,
    jitter: 0.055,
    preserveTiming: true
  },
  luxeStamp: {
    label: "Luxe Stamp",
    shape: "stamp",
    scale: 0.9,
    radius: 0.18,
    jitter: 0.035,
    preserveTiming: true
  }
};

function getStyleConfig(styleName = "classic") {
  return STYLE_CONFIGS[styleName] || STYLE_CONFIGS.classic;
}

function getPixelData(canvas) {
  const ctx = canvas.getContext("2d");
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function moduleIsDark(data, width, x, y) {
  const i = (y * width + x) * 4;
  return data[i] < 128;
}

function isInFinderZone(col, row, moduleCount) {
  const zone = 9;
  const nearTop = row < zone;
  const nearLeft = col < zone;
  const nearRight = col >= moduleCount - zone;
  const nearBottom = row >= moduleCount - zone;

  return (
    (nearTop && nearLeft) ||
    (nearTop && nearRight) ||
    (nearBottom && nearLeft)
  );
}

function isTimingModule(col, row, moduleCount) {
  if (moduleCount < 21) return false;
  return row === 6 || col === 6;
}

function isProtectedModule(col, row, moduleCount) {
  return isInFinderZone(col, row, moduleCount) || isTimingModule(col, row, moduleCount);
}

function hash2D(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return Math.abs(h);
}

function jitterFor(col, row, amountPx) {
  if (!amountPx) return { x: 0, y: 0, s: 0 };

  const hx = (hash2D(col, row, 11) % 1000) / 1000 - 0.5;
  const hy = (hash2D(col, row, 29) % 1000) / 1000 - 0.5;
  const hs = (hash2D(col, row, 47) % 1000) / 1000 - 0.5;

  return {
    x: hx * amountPx,
    y: hy * amountPx,
    s: hs * amountPx * 0.45
  };
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));

  if (!radius) {
    ctx.fillRect(x, y, w, h);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function drawStyledDarkModule(ctx, x, y, size, config, col, row) {
  const moduleScale = Math.max(0.35, Math.min(1, config.scale || 1));
  const baseSize = size * moduleScale;
  const jitter = jitterFor(col, row, size * (config.jitter || 0));
  const drawSize = Math.max(1, baseSize + jitter.s);
  const dx = x + (size - drawSize) / 2 + jitter.x;
  const dy = y + (size - drawSize) / 2 + jitter.y;

  if (config.shape === "circle" || config.shape === "pearl") {
    ctx.beginPath();
    ctx.arc(dx + drawSize / 2, dy + drawSize / 2, drawSize / 2, 0, Math.PI * 2);
    ctx.fill();

    if (config.shape === "pearl" && drawSize >= 6) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(dx + drawSize * 0.36, dy + drawSize * 0.34, drawSize * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }

  if (config.shape === "stamp") {
    const radius = drawSize * (config.radius || 0.18);
    roundedRect(ctx, dx, dy, drawSize, drawSize, radius);

    if (drawSize >= 7) {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(dx + drawSize * 0.14, dy + drawSize * 0.14, drawSize * 0.26, Math.max(1, drawSize * 0.08));
      ctx.restore();
    }
    return;
  }

  const radius = drawSize * (config.radius || 0);
  roundedRect(ctx, dx, dy, drawSize, drawSize, radius);
}

function drawClassicModule(ctx, x, y, size, dark) {
  ctx.fillStyle = dark ? "#000000" : "#ffffff";
  ctx.fillRect(x, y, size, size);
}

export function drawStyledQrLayer(ctx, maskCtx, qrCanvas, fit, options = {}) {
  const {
    moduleStyle = "classic",
    coverageFn = null,
    coverageThreshold = 0.58
  } = options;

  const config = getStyleConfig(moduleStyle);
  const qrData = getPixelData(qrCanvas);
  const moduleCount = qrCanvas.width;
  const moduleSize = Math.max(1, fit.moduleDisplaySize || 1);

  for (let row = 0; row < qrCanvas.height; row++) {
    for (let col = 0; col < qrCanvas.width; col++) {
      const x = fit.x + col * moduleSize;
      const y = fit.y + row * moduleSize;

      const coverage = coverageFn ? coverageFn(maskCtx, x, y, moduleSize) : 1;
      if (coverage < coverageThreshold) continue;

      const dark = moduleIsDark(qrData, moduleCount, col, row);
      const protectedModule = isProtectedModule(col, row, moduleCount);

      if (config.shape === "square" || protectedModule) {
        drawClassicModule(ctx, x, y, moduleSize, dark);
        continue;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, moduleSize, moduleSize);

      if (dark) {
        ctx.fillStyle = "#000000";
        drawStyledDarkModule(ctx, x, y, moduleSize, config, col, row);
      }
    }
  }
}

export function listQrModuleStyles() {
  return Object.entries(STYLE_CONFIGS).map(([value, config]) => ({
    value,
    label: config.label
  }));
}
