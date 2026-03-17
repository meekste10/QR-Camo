import { state } from "../js/state.js";
import { maskPresets } from "../js/presets.js";
import {
  threshold,
  trimWhiteBorder,
  innerCrop,
  estimateModuleSize,
  imageDataToCanvas
} from "../js/qr-preprocess.js";
import { extractTiles } from "../js/tile-engine.js";
import { loadMask } from "../js/mask-engine.js";
import { buildMaskFromImage } from "../js/mask-builder.js";
import { render } from "../js/render-engine.js";
import { exportPNG } from "../js/export.js";

/* ------------------------------
   DOM LOOKUPS
------------------------------ */

const debugPanel = document.getElementById("debugPanel");
const previewMeta = document.getElementById("previewMeta");
const sourceMeta = document.getElementById("sourceMeta");
const engineStatus = document.getElementById("engineStatus");
const contrastWarning = document.getElementById("contrastWarning");

const qrTextInput = document.getElementById("qrTextInput");
const makeQrBtn = document.getElementById("makeQrBtn");
const qrUpload = document.getElementById("qrUpload");

const maskSelect = document.getElementById("maskSelect");
const customMaskUpload = document.getElementById("customMaskUpload");
const customMaskThreshold = document.getElementById("customMaskThreshold");
const customMaskInvert = document.getElementById("customMaskInvert");

const generateBtn = document.getElementById("generateBtn");
const exportBtn = document.getElementById("exportBtn");

const qrSizeSelect = document.getElementById("qrSizeSelect");
const qrOffsetX = document.getElementById("qrOffsetX");
const qrOffsetY = document.getElementById("qrOffsetY");
const qrOffsetXLabel = document.getElementById("qrOffsetXLabel");
const qrOffsetYLabel = document.getElementById("qrOffsetYLabel");

const foregroundColor = document.getElementById("foregroundColor");
const backgroundColor = document.getElementById("backgroundColor");
const transparentBackground = document.getElementById("transparentBackground");

const foregroundSwatch = document.getElementById("foregroundSwatch");
const backgroundSwatch = document.getElementById("backgroundSwatch");

const qrReadyBadge = document.getElementById("qrReadyBadge");
const maskReadyBadge = document.getElementById("maskReadyBadge");

const sourcePreviewCanvas = document.getElementById("sourcePreviewCanvas");
const originalCanvas = document.getElementById("originalCanvas");
const thresholdCanvas = document.getElementById("thresholdCanvas");
const cropCanvas = document.getElementById("cropCanvas");
const customMaskCanvas = document.getElementById("customMaskCanvas");
const outputCanvas = document.getElementById("outputCanvas");

const sizeButtons = document.querySelectorAll(".pill-btn");

const nudgeUp = document.getElementById("nudgeUp");
const nudgeLeft = document.getElementById("nudgeLeft");
const nudgeRight = document.getElementById("nudgeRight");
const nudgeDown = document.getElementById("nudgeDown");
const resetPositionBtn = document.getElementById("resetPositionBtn");

/* Optional enhanced controls */
const maskScale = document.getElementById("maskScale");
const maskScaleLabel = document.getElementById("maskScaleLabel");

const quietZone = document.getElementById("quietZone");
const quietZoneLabel = document.getElementById("quietZoneLabel");

const innerTrim = document.getElementById("innerTrim");
const innerTrimLabel = document.getElementById("innerTrimLabel");

const blendTightness = document.getElementById("blendTightness");
const blendTightnessLabel = document.getElementById("blendTightnessLabel");

const effectGlow = document.getElementById("effectGlow");
const effectGlowLabel = document.getElementById("effectGlowLabel");

const effectShadow = document.getElementById("effectShadow");
const effectShadowLabel = document.getElementById("effectShadowLabel");

const effectGrain = document.getElementById("effectGrain");
const effectGrainLabel = document.getElementById("effectGrainLabel");

const loadingOverlay = document.getElementById("loadingOverlay");
const canvasPlaceholder = document.getElementById("canvasPlaceholder");
const scanStrengthFill = document.getElementById("scanStrengthFill");
const scanStrengthText = document.getElementById("scanStrengthText");

/* ------------------------------
   STATE BOOTSTRAP
------------------------------ */

state.customMaskImage = null;
state.customMaskCanvas = null;
state.lastRendered = false;

const NUDGE_STEP = 12;

/* ------------------------------
   HELPERS
------------------------------ */

function getErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function setDebug(msg) {
  if (debugPanel) debugPanel.textContent = msg;
  console.log(msg);
}

function setMeta(msg) {
  if (previewMeta) previewMeta.textContent = msg;
}

function setSourceMeta(msg) {
  if (sourceMeta) sourceMeta.textContent = msg;
}

function setEngineReady(msg = "Engine ready") {
  if (engineStatus) engineStatus.textContent = msg;
}

function setQrReady(isReady) {
  if (qrReadyBadge) qrReadyBadge.classList.toggle("hidden", !isReady);
}

function setMaskReady(isReady) {
  if (maskReadyBadge) maskReadyBadge.classList.toggle("hidden", !isReady);
}

function setLoading(isLoading, message = "Rendering preview...") {
  if (loadingOverlay) {
    loadingOverlay.classList.toggle("hidden", !isLoading);
    const p = loadingOverlay.querySelector(".placeholder-copy");
    if (p && message) p.textContent = message;
  }

  if (generateBtn) {
    generateBtn.disabled = isLoading;
    generateBtn.textContent = isLoading ? "Generating..." : "Generate QR-Camo";
  }

  if (makeQrBtn) {
    makeQrBtn.disabled = isLoading;
  }
}

function showCanvasPlaceholder(show) {
  if (!canvasPlaceholder) return;
  canvasPlaceholder.classList.toggle("hidden", !show);
}

function updateRangeLabel(inputEl, labelEl, suffix = "") {
  if (!inputEl || !labelEl) return;
  labelEl.textContent = `${inputEl.value}${suffix}`;
}

function syncOffsetLabels() {
  if (qrOffsetXLabel) qrOffsetXLabel.textContent = qrOffsetX.value;
  if (qrOffsetYLabel) qrOffsetYLabel.textContent = qrOffsetY.value;
}

function syncSizePills() {
  const current = qrSizeSelect.value;
  sizeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.size === current);
  });
}

function resolveMaskPath(path) {
  if (!path) return path;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/") ||
    path.startsWith("../")
  ) {
    return path;
  }
  return `../${path}`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;

  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function luminanceFromHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function updateContrastWarning() {
  if (!contrastWarning) return;

  if (transparentBackground?.checked) {
    contrastWarning.classList.add("hidden");
    return;
  }

  const diff = Math.abs(
    luminanceFromHex(foregroundColor.value) - luminanceFromHex(backgroundColor.value)
  );

  contrastWarning.classList.toggle("hidden", diff >= 110);
}

function recolorOutputCanvas(canvas, fgHex, bgHex, transparent) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);

  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    if (alpha === 0) continue;

    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const isDark = avg < 128;

    if (isDark) {
      d[i] = fg.r;
      d[i + 1] = fg.g;
      d[i + 2] = fg.b;
      d[i + 3] = 255;
    } else {
      if (transparent) {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      } else {
        d[i] = bg.r;
        d[i + 1] = bg.g;
        d[i + 2] = bg.b;
        d[i + 3] = 255;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
}

function applyCurrentColorsToOutput() {
  syncColorSwatches();

  if (!outputCanvas.width || !outputCanvas.height) {
    updateContrastWarning();
    return;
  }

  recolorOutputCanvas(
    outputCanvas,
    foregroundColor.value,
    backgroundColor.value,
    transparentBackground.checked
  );

  applyVisualEffects();
  updateContrastWarning();
}

function syncColorSwatches() {
  if (foregroundSwatch) foregroundSwatch.style.background = foregroundColor.value;
  if (backgroundSwatch) backgroundSwatch.style.background = backgroundColor.value;
}

function populatePresetMasks() {
  if (!maskSelect || maskSelect.options.length > 0) return;

  Object.keys(maskPresets).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    maskSelect.appendChild(option);
  });

  if (maskSelect.options.length > 0) {
    maskSelect.selectedIndex = 0;
  }
}

function drawImageToCanvas(img, canvas) {
  const max = 900;
  const scale = Math.min(max / img.width, max / img.height, 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);

  return ctx.getImageData(0, 0, w, h);
}

function syncSourcePreviewFromOriginal() {
  if (!originalCanvas.width || !originalCanvas.height || !sourcePreviewCanvas) return;

  const size = 320;
  sourcePreviewCanvas.width = size;
  sourcePreviewCanvas.height = size;

  const ctx = sourcePreviewCanvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  const scale = Math.min(size / originalCanvas.width, size / originalCanvas.height);
  const drawW = Math.round(originalCanvas.width * scale);
  const drawH = Math.round(originalCanvas.height * scale);
  const drawX = Math.floor((size - drawW) / 2);
  const drawY = Math.floor((size - drawH) / 2);

  ctx.drawImage(
    originalCanvas,
    0,
    0,
    originalCanvas.width,
    originalCanvas.height,
    drawX,
    drawY,
    drawW,
    drawH
  );
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image file"));
      img.src = reader.result;
    };

    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function buildQrFromText(text) {
  if (!window.QRCode) {
    throw new Error("QRCode library not loaded");
  }

  const tempCanvas = document.createElement("canvas");
  const quiet = Number(quietZone?.value ?? 0);

  await window.QRCode.toCanvas(tempCanvas, text, {
    width: 900,
    margin: quiet,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#ffffff"
    }
  });

  originalCanvas.width = tempCanvas.width;
  originalCanvas.height = tempCanvas.height;

  const octx = originalCanvas.getContext("2d");
  octx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
  octx.imageSmoothingEnabled = false;
  octx.drawImage(tempCanvas, 0, 0);

  state.qrImage = null;
  state.qrImageData = octx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

  syncSourcePreviewFromOriginal();
}

function autoBuildCustomMaskIfNeeded() {
  if (!state.customMaskImage) return null;

  const builtMaskCanvas = buildMaskFromImage(state.customMaskImage, {
    size: Number(maskScale?.value || 800),
    threshold: Number(customMaskThreshold?.value || 180),
    invert: !!customMaskInvert?.checked
  });

  state.customMaskCanvas = builtMaskCanvas;

  if (customMaskCanvas) {
    customMaskCanvas.width = builtMaskCanvas.width;
    customMaskCanvas.height = builtMaskCanvas.height;

    const ctx = customMaskCanvas.getContext("2d");
    ctx.clearRect(0, 0, customMaskCanvas.width, customMaskCanvas.height);
    ctx.drawImage(builtMaskCanvas, 0, 0);
  }

  setMaskReady(true);
  return builtMaskCanvas;
}

function nudgePosition(dx, dy) {
  qrOffsetX.value = String(Number(qrOffsetX.value || 0) + dx);
  qrOffsetY.value = String(Number(qrOffsetY.value || 0) + dy);
  syncOffsetLabels();
}

function updateScanStrength(level = 0.82) {
  if (!scanStrengthFill || !scanStrengthText) return;

  const clamped = Math.max(0, Math.min(1, level));
  const pct = Math.round(clamped * 100);
  scanStrengthFill.style.width = `${pct}%`;

  if (pct >= 85) {
    scanStrengthText.textContent = "High scannability";
    scanStrengthText.style.color = "#bde9d8";
  } else if (pct >= 65) {
    scanStrengthText.textContent = "Good scannability";
    scanStrengthText.style.color = "#ffe1a7";
  } else {
    scanStrengthText.textContent = "Needs refinement";
    scanStrengthText.style.color = "#ffb5be";
  }
}

function estimateScanStrength() {
  let score = 0.9;

  if (!transparentBackground?.checked) {
    const diff = Math.abs(
      luminanceFromHex(foregroundColor.value) - luminanceFromHex(backgroundColor.value)
    );
    if (diff < 110) score -= 0.15;
    if (diff < 80) score -= 0.10;
  }

  const size = qrSizeSelect?.value || "medium";
  if (size === "xsmall") score -= 0.08;
  if (size === "small") score -= 0.03;

  const absOffset = Math.abs(Number(qrOffsetX.value || 0)) + Math.abs(Number(qrOffsetY.value || 0));
  if (absOffset > 80) score -= 0.06;
  if (absOffset > 140) score -= 0.08;

  if (state.customMaskImage) score -= 0.02;

  return Math.max(0.45, Math.min(0.98, score));
}

function applyVisualEffects() {
  if (!outputCanvas?.width || !outputCanvas?.height) return;

  const glow = Number(effectGlow?.value || 0);
  const shadow = Number(effectShadow?.value || 0);
  const grain = Number(effectGrain?.value || 0);

  outputCanvas.style.filter = `
    drop-shadow(0 ${Math.round(shadow * 0.35)}px ${Math.max(10, shadow)}px rgba(0,0,0,.32))
    drop-shadow(0 0 ${Math.round(glow * 0.9)}px rgba(108,168,255,.14))
  `.trim();

  outputCanvas.dataset.grain = String(grain);
}

function bindRange(inputEl, labelEl, suffix = "") {
  if (!inputEl || !labelEl) return;
  const sync = () => updateRangeLabel(inputEl, labelEl, suffix);
  inputEl.addEventListener("input", sync);
  sync();
}

/* ------------------------------
   EVENTS
------------------------------ */

sizeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    qrSizeSelect.value = btn.dataset.size;
    syncSizePills();
  });
});

nudgeUp?.addEventListener("click", () => nudgePosition(0, -NUDGE_STEP));
nudgeDown?.addEventListener("click", () => nudgePosition(0, NUDGE_STEP));
nudgeLeft?.addEventListener("click", () => nudgePosition(-NUDGE_STEP, 0));
nudgeRight?.addEventListener("click", () => nudgePosition(NUDGE_STEP, 0));

resetPositionBtn?.addEventListener("click", () => {
  qrOffsetX.value = "0";
  qrOffsetY.value = "0";
  syncOffsetLabels();
});

foregroundColor?.addEventListener("input", applyCurrentColorsToOutput);
backgroundColor?.addEventListener("input", applyCurrentColorsToOutput);
transparentBackground?.addEventListener("change", applyCurrentColorsToOutput);

[effectGlow, effectShadow, effectGrain].forEach((el) => {
  el?.addEventListener("input", () => {
    applyVisualEffects();
  });
});

makeQrBtn?.addEventListener("click", async () => {
  try {
    const text = qrTextInput.value.trim();
    if (!text) {
      setDebug("Enter a link or text first");
      return;
    }

    setLoading(true, "Generating source QR...");
    await buildQrFromText(text);

    setQrReady(true);
    setSourceMeta("Generated from link/text");
    setMeta("QR ready. Pick a shape and click Generate.");
    setEngineReady("QR generated");
    setDebug("QR generated from text/link");
    showCanvasPlaceholder(true);
  } catch (err) {
    console.error(err);
    setDebug(`QR generation error: ${getErrorMessage(err)}`);
    setEngineReady("Engine error");
  } finally {
    setLoading(false);
  }
});

qrUpload?.addEventListener("change", async (e) => {
  try {
    const file = e.target.files?.[0];
    if (!file) {
      setDebug("No QR file selected");
      return;
    }

    setLoading(true, "Loading uploaded QR...");
    const img = await loadImageFromFile(file);
    state.qrImage = img;
    state.qrImageData = drawImageToCanvas(img, originalCanvas);

    syncSourcePreviewFromOriginal();
    setQrReady(true);
    setSourceMeta(`Uploaded QR: ${file.name}`);
    setMeta("QR ready. Pick a shape and click Generate.");
    setEngineReady("QR loaded");
    setDebug(`QR loaded: ${state.qrImageData.width}×${state.qrImageData.height}`);
    showCanvasPlaceholder(true);
  } catch (err) {
    console.error(err);
    setDebug(`QR upload error: ${getErrorMessage(err)}`);
    setEngineReady("Engine error");
  } finally {
    setLoading(false);
  }
});

customMaskUpload?.addEventListener("change", async (e) => {
  try {
    const file = e.target.files?.[0];
    if (!file) {
      setDebug("No custom mask file selected");
      return;
    }

    const img = await loadImageFromFile(file);
    state.customMaskImage = img;
    state.customMaskCanvas = null;
    setMaskReady(true);
    setDebug(`Custom mask source loaded: ${img.width}×${img.height}`);
    setMeta("Custom silhouette ready. Click Generate.");
  } catch (err) {
    console.error(err);
    setDebug(`Custom mask upload error: ${getErrorMessage(err)}`);
  }
});

generateBtn?.addEventListener("click", async () => {
  try {
    if (!state.qrImageData) {
      throw new Error("Generate or upload a QR first");
    }

    setLoading(true, "Rendering QR-Camo...");
    showCanvasPlaceholder(false);

    const thresholded = threshold(
      new ImageData(
        new Uint8ClampedArray(state.qrImageData.data),
        state.qrImageData.width,
        state.qrImageData.height
      )
    );

    if (thresholdCanvas) {
      thresholdCanvas.width = thresholded.width;
      thresholdCanvas.height = thresholded.height;
      thresholdCanvas.getContext("2d").putImageData(thresholded, 0, 0);
    }

    const trimPx = Number(quietZone?.value ?? 0);
    const innerTrimPx = Number(innerTrim?.value ?? 24);

    const trimmed = trimWhiteBorder(thresholded, trimPx);
    const inner = innerCrop(trimmed, innerTrimPx);

    if (cropCanvas) {
      cropCanvas.width = inner.width;
      cropCanvas.height = inner.height;
      cropCanvas.getContext("2d").putImageData(inner, 0, 0);
    }

    let modulePixelSize = estimateModuleSize(trimmed);
    if (!modulePixelSize || modulePixelSize < 1) {
      modulePixelSize = 4;
    }

    const tiles = extractTiles(inner, modulePixelSize);
    if (!tiles || !tiles.length) {
      throw new Error("No tiles could be extracted from this QR");
    }

    let maskSource = null;

    if (state.customMaskImage) {
      maskSource = autoBuildCustomMaskIfNeeded();
    } else {
      const selectedMask = maskSelect?.value;
      if (!selectedMask || !maskPresets[selectedMask]) {
        throw new Error("No valid preset mask selected");
      }
      const resolvedPath = resolveMaskPath(maskPresets[selectedMask]);
      maskSource = await loadMask(resolvedPath);
    }

    const sourceQrCanvas = imageDataToCanvas(trimmed);

    render({
      tiles,
      maskImg: maskSource,
      outputCanvas,
      sourceQrCanvas,
      modulePixelSize,
      qrSize: qrSizeSelect.value,
      qrOffsetX: Number(qrOffsetX.value || 0),
      qrOffsetY: Number(qrOffsetY.value || 0),
      maskScale: Number(maskScale?.value || 100),
      blendTightness: Number(blendTightness?.value || 50)
    });

    applyCurrentColorsToOutput();
    applyVisualEffects();

    const strength = estimateScanStrength();
    updateScanStrength(strength);

    state.lastRendered = true;
    setDebug("Render complete");
    setMeta("Live preview ready. Export when satisfied.");
    setEngineReady("Render complete");
  } catch (err) {
    console.error(err);
    setDebug(`Generate error: ${getErrorMessage(err)}`);
    setEngineReady("Engine error");
    updateScanStrength(0.5);
  } finally {
    setLoading(false);
  }
});

exportBtn?.addEventListener("click", () => {
  try {
    exportPNG(outputCanvas);
    setDebug("Export triggered");
  } catch (err) {
    console.error(err);
    setDebug(`Export error: ${getErrorMessage(err)}`);
  }
});

/* ------------------------------
   INIT
------------------------------ */

setDebug("Creator UI loaded");
setMeta("Waiting for QR upload or generation");
setSourceMeta("Nothing loaded yet");
setEngineReady("Engine ready");

populatePresetMasks();
syncOffsetLabels();
syncSizePills();
syncColorSwatches();
updateContrastWarning();
updateScanStrength(0.82);

setQrReady(false);
setMaskReady(false);
showCanvasPlaceholder(true);

bindRange(maskScale, maskScaleLabel, "%");
bindRange(quietZone, quietZoneLabel, " px");
bindRange(innerTrim, innerTrimLabel, " px");
bindRange(blendTightness, blendTightnessLabel, "%");
bindRange(effectGlow, effectGlowLabel, "%");
bindRange(effectShadow, effectShadowLabel, "%");
bindRange(effectGrain, effectGrainLabel, "%");

applyVisualEffects();
