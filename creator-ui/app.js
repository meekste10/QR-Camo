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

const debugPanel = document.getElementById("debugPanel");
const previewMeta = document.getElementById("previewMeta");
const sourceMeta = document.getElementById("sourceMeta");
const engineStatus = document.getElementById("engineStatus");
const contrastWarning = document.getElementById("contrastWarning");

const qrTextInput = document.getElementById("qrTextInput");
const makeQrBtn = document.getElementById("makeQrBtn");
const qrUpload = document.getElementById("qrUpload");
const qrUploadMirror = document.getElementById("qrUploadMirror");
const sourcePreviewClick = document.getElementById("sourcePreviewClick");

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

const qrReadyBadge = document.getElementById("qrReadyBadge");
const maskReadyBadge = document.getElementById("maskReadyBadge");

const sourcePreviewCanvas = document.getElementById("sourcePreviewCanvas");
const originalCanvas = document.getElementById("originalCanvas");
const thresholdCanvas = document.getElementById("thresholdCanvas");
const cropCanvas = document.getElementById("cropCanvas");
const customMaskCanvas = document.getElementById("customMaskCanvas");
const outputCanvas = document.getElementById("outputCanvas");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const sizeButtons = document.querySelectorAll(".pill-btn");

const nudgeUp = document.getElementById("nudgeUp");
const nudgeLeft = document.getElementById("nudgeLeft");
const nudgeRight = document.getElementById("nudgeRight");
const nudgeDown = document.getElementById("nudgeDown");
const resetPositionBtn = document.getElementById("resetPositionBtn");

state.customMaskImage = null;
state.customMaskCanvas = null;

const NUDGE_STEP = 12;

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

function syncOffsetLabels() {
  if (qrOffsetXLabel && qrOffsetX) qrOffsetXLabel.textContent = qrOffsetX.value;
  if (qrOffsetYLabel && qrOffsetY) qrOffsetYLabel.textContent = qrOffsetY.value;
}

function syncSizePills() {
  if (!qrSizeSelect || !sizeButtons.length) return;
  const current = qrSizeSelect.value;
  sizeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.size === current);
  });
}

function activateTab(tabId) {
  if (!tabButtons.length || !tabPanels.length) return;

  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
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
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
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
  if (!contrastWarning || !transparentBackground || !foregroundColor || !backgroundColor) return;

  if (transparentBackground.checked) {
    contrastWarning.classList.add("hidden");
    return;
  }

  const diff = Math.abs(
    luminanceFromHex(foregroundColor.value) - luminanceFromHex(backgroundColor.value)
  );

  contrastWarning.classList.toggle("hidden", diff >= 110);
}

function recolorOutputCanvas(canvas, fgHex, bgHex, transparent) {
  if (!canvas) return;

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
  if (!outputCanvas || !foregroundColor || !backgroundColor || !transparentBackground) return;
  if (!outputCanvas.width || !outputCanvas.height) return;

  recolorOutputCanvas(
    outputCanvas,
    foregroundColor.value,
    backgroundColor.value,
    transparentBackground.checked
  );

  updateContrastWarning();
}

function populatePresetMasks() {
  if (!maskSelect) return;
  if (maskSelect.options.length > 0) return;

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
  if (!sourcePreviewCanvas || !originalCanvas) return;
  if (!originalCanvas.width || !originalCanvas.height) return;

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

  await window.QRCode.toCanvas(tempCanvas, text, {
    width: 900,
    margin: 0,
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
    size: 800,
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
  if (!qrOffsetX || !qrOffsetY) return;

  qrOffsetX.value = String(Number(qrOffsetX.value || 0) + dx);
  qrOffsetY.value = String(Number(qrOffsetY.value || 0) + dy);
  syncOffsetLabels();
}

async function handleQrUploadChange(event) {
  try {
    const file = event?.target?.files?.[0];
    if (!file) {
      setDebug("No QR file selected");
      return;
    }

    const img = await loadImageFromFile(file);
    state.qrImage = img;
    state.qrImageData = drawImageToCanvas(img, originalCanvas);

    syncSourcePreviewFromOriginal();
    setQrReady(true);
    setSourceMeta(`Uploaded QR: ${file.name}`);
    setMeta("QR ready. Pick a shape and click Generate.");
    setEngineReady("QR loaded");
    setDebug(`QR loaded: ${state.qrImageData.width}×${state.qrImageData.height}`);
  } catch (err) {
    console.error(err);
    setDebug(`QR upload error: ${getErrorMessage(err)}`);
    setEngineReady("Engine error");
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tab);
  });
});

sizeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!qrSizeSelect) return;
    qrSizeSelect.value = btn.dataset.size;
    syncSizePills();
  });
});

if (nudgeUp) nudgeUp.addEventListener("click", () => nudgePosition(0, -NUDGE_STEP));
if (nudgeDown) nudgeDown.addEventListener("click", () => nudgePosition(0, NUDGE_STEP));
if (nudgeLeft) nudgeLeft.addEventListener("click", () => nudgePosition(-NUDGE_STEP, 0));
if (nudgeRight) nudgeRight.addEventListener("click", () => nudgePosition(NUDGE_STEP, 0));

if (resetPositionBtn) {
  resetPositionBtn.addEventListener("click", () => {
    if (!qrOffsetX || !qrOffsetY) return;
    qrOffsetX.value = "0";
    qrOffsetY.value = "0";
    syncOffsetLabels();
  });
}

setDebug("Creator UI loaded");
setMeta("Waiting for QR upload or generation");
setSourceMeta("Nothing loaded yet");
populatePresetMasks();
syncOffsetLabels();
syncSizePills();
updateContrastWarning();
setQrReady(false);
setMaskReady(false);
activateTab("sourceTab");

if (foregroundColor) foregroundColor.addEventListener("input", applyCurrentColorsToOutput);
if (backgroundColor) backgroundColor.addEventListener("input", applyCurrentColorsToOutput);
if (transparentBackground) {
  transparentBackground.addEventListener("change", applyCurrentColorsToOutput);
}

if (makeQrBtn) {
  makeQrBtn.addEventListener("click", async () => {
    try {
      const text = qrTextInput?.value?.trim() || "";
      if (!text) {
        setDebug("Enter a link or text first");
        return;
      }

      await buildQrFromText(text);
      setQrReady(true);
      setSourceMeta("Generated from link/text");
      setMeta("QR ready. Pick a shape and click Generate.");
      setEngineReady("QR generated");
      setDebug("QR generated from text/link");
    } catch (err) {
      console.error(err);
      setDebug(`QR generation error: ${getErrorMessage(err)}`);
      setEngineReady("Engine error");
    }
  });
}

if (qrUpload) {
  qrUpload.addEventListener("change", handleQrUploadChange);
}

if (qrUploadMirror && qrUpload) {
  qrUploadMirror.addEventListener("change", handleQrUploadChange);
}

if (sourcePreviewClick && qrUpload) {
  sourcePreviewClick.addEventListener("click", () => {
    qrUpload.click();
  });
}

if (customMaskUpload) {
  customMaskUpload.addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
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
}

if (customMaskThreshold) {
  customMaskThreshold.addEventListener("input", () => {
    if (!state.customMaskImage) return;
    autoBuildCustomMaskIfNeeded();
    setDebug("Custom mask threshold updated");
  });
}

if (customMaskInvert) {
  customMaskInvert.addEventListener("change", () => {
    if (!state.customMaskImage) return;
    autoBuildCustomMaskIfNeeded();
    setDebug("Custom mask invert updated");
  });
}

if (generateBtn) {
  generateBtn.addEventListener("click", async () => {
    try {
      if (!state.qrImageData) {
        throw new Error("Generate or upload a QR first");
      }

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

      const trimmed = trimWhiteBorder(thresholded, 0);
      const inner = innerCrop(trimmed, 24);

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
        qrSize: qrSizeSelect?.value || "medium",
        qrOffsetX: Number(qrOffsetX?.value || 0),
        qrOffsetY: Number(qrOffsetY?.value || 0)
      });

      applyCurrentColorsToOutput();

      setDebug("Render complete");
      setMeta("Live preview ready. Export when satisfied.");
      setEngineReady("Render complete");
    } catch (err) {
      console.error(err);
      setDebug(`Generate error: ${getErrorMessage(err)}`);
      setEngineReady("Engine error");
    }
  });
}

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    try {
      if (!outputCanvas) {
        throw new Error("No output canvas available");
      }
      exportPNG(outputCanvas);
      setDebug("Export triggered");
    } catch (err) {
      console.error(err);
      setDebug(`Export error: ${getErrorMessage(err)}`);
    }
  });
}
