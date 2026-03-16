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

const maskModeSelect = document.getElementById("maskModeSelect");
const maskSelect = document.getElementById("maskSelect");
const customMaskUpload = document.getElementById("customMaskUpload");
const customMaskThreshold = document.getElementById("customMaskThreshold");
const customMaskInvert = document.getElementById("customMaskInvert");
const buildMaskBtn = document.getElementById("buildMaskBtn");
const generateBtn = document.getElementById("generateBtn");
const exportBtn = document.getElementById("exportBtn");

const workspaceMode = document.getElementById("workspaceMode");
const labPanels = document.getElementById("labPanels");

const qrSizeSelect = document.getElementById("qrSizeSelect");
const qrOffsetX = document.getElementById("qrOffsetX");
const qrOffsetY = document.getElementById("qrOffsetY");
const qrOffsetXLabel = document.getElementById("qrOffsetXLabel");
const qrOffsetYLabel = document.getElementById("qrOffsetYLabel");

const foregroundColor = document.getElementById("foregroundColor");
const backgroundColor = document.getElementById("backgroundColor");
const transparentBackground = document.getElementById("transparentBackground");

const presetMaskSection = document.getElementById("presetMaskSection");
const customMaskSection = document.getElementById("customMaskSection");

const sourcePreviewCanvas = document.getElementById("sourcePreviewCanvas");
const originalCanvas = document.getElementById("originalCanvas");
const thresholdCanvas = document.getElementById("thresholdCanvas");
const cropCanvas = document.getElementById("cropCanvas");
const customMaskCanvas = document.getElementById("customMaskCanvas");
const outputCanvas = document.getElementById("outputCanvas");

state.customMaskImage = null;
state.customMaskCanvas = null;

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
  debugPanel.textContent = msg;
  console.log(msg);
}

function setMeta(msg) {
  previewMeta.textContent = msg;
}

function setSourceMeta(msg) {
  sourceMeta.textContent = msg;
}

function setEngineReady(msg = "Engine ready") {
  engineStatus.textContent = msg;
}

function syncMaskModeUI() {
  const mode = maskModeSelect.value;
  presetMaskSection.classList.toggle("hidden", mode !== "preset");
  customMaskSection.classList.toggle("hidden", mode !== "custom");
  setDebug(`Mask mode: ${mode}`);
}

function syncOffsetLabels() {
  qrOffsetXLabel.textContent = qrOffsetX.value;
  qrOffsetYLabel.textContent = qrOffsetY.value;
}

function syncWorkspace() {
  labPanels.classList.toggle("hidden", workspaceMode.value !== "lab");
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
  if (!outputCanvas.width || !outputCanvas.height) return;

  recolorOutputCanvas(
    outputCanvas,
    foregroundColor.value,
    backgroundColor.value,
    transparentBackground.checked
  );

  updateContrastWarning();
  setDebug("Colors applied");
}

function populatePresetMasks() {
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
    margin: 2,
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

setDebug("Creator UI loaded");
setMeta("Waiting for QR upload or generation");
setSourceMeta("Nothing loaded yet");
populatePresetMasks();
syncMaskModeUI();
syncOffsetLabels();
syncWorkspace();
updateContrastWarning();

workspaceMode.addEventListener("change", syncWorkspace);
maskModeSelect.addEventListener("change", syncMaskModeUI);
qrOffsetX.addEventListener("input", syncOffsetLabels);
qrOffsetY.addEventListener("input", syncOffsetLabels);
foregroundColor.addEventListener("input", applyCurrentColorsToOutput);
backgroundColor.addEventListener("input", applyCurrentColorsToOutput);
transparentBackground.addEventListener("change", applyCurrentColorsToOutput);

makeQrBtn.addEventListener("click", async () => {
  try {
    const text = qrTextInput.value.trim();
    if (!text) {
      setDebug("Enter a link or text first");
      return;
    }

    await buildQrFromText(text);
    setSourceMeta("Generated from link/text");
    setMeta("QR generated. Pick a shape and generate QR-Camo.");
    setEngineReady("QR generated");
    setDebug("QR generated from text/link");
  } catch (err) {
    console.error(err);
    setDebug(`QR generation error: ${getErrorMessage(err)}`);
    setEngineReady("Engine error");
  }
});

qrUpload.addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) {
      setDebug("No QR file selected");
      return;
    }

    const img = await loadImageFromFile(file);
    state.qrImage = img;
    state.qrImageData = drawImageToCanvas(img, originalCanvas);

    syncSourcePreviewFromOriginal();

    setSourceMeta(`Uploaded QR: ${file.name}`);
    setMeta("QR uploaded. Pick a shape and generate.");
    setEngineReady("QR loaded");
    setDebug(`QR loaded: ${state.qrImageData.width}×${state.qrImageData.height}`);
  } catch (err) {
    console.error(err);
    setDebug(`QR upload error: ${getErrorMessage(err)}`);
    setEngineReady("Engine error");
  }
});

customMaskUpload.addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) {
      setDebug("No custom mask file selected");
      return;
    }

    const img = await loadImageFromFile(file);
    state.customMaskImage = img;
    setDebug(`Custom mask source loaded: ${img.width}×${img.height}`);
    setMeta("Custom silhouette source loaded.");
  } catch (err) {
    console.error(err);
    setDebug(`Custom mask upload error: ${getErrorMessage(err)}`);
  }
});

buildMaskBtn.addEventListener("click", () => {
  try {
    if (!state.customMaskImage) {
      setDebug("Load a custom mask image first");
      return;
    }

    const builtMaskCanvas = buildMaskFromImage(state.customMaskImage, {
      size: 800,
      threshold: Number(customMaskThreshold.value || 180),
      invert: customMaskInvert.checked
    });

    state.customMaskCanvas = builtMaskCanvas;

    customMaskCanvas.width = builtMaskCanvas.width;
    customMaskCanvas.height = builtMaskCanvas.height;

    const ctx = customMaskCanvas.getContext("2d");
    ctx.clearRect(0, 0, customMaskCanvas.width, customMaskCanvas.height);
    ctx.drawImage(builtMaskCanvas, 0, 0);

    setDebug("Custom mask built");
    setMeta("Custom mask ready. Generate when ready.");
  } catch (err) {
    console.error(err);
    setDebug(`Build mask error: ${getErrorMessage(err)}`);
  }
});

generateBtn.addEventListener("click", async () => {
  try {
    if (!state.qrImageData) {
      throw new Error("Upload or generate a QR first");
    }

    const thresholded = threshold(
      new ImageData(
        new Uint8ClampedArray(state.qrImageData.data),
        state.qrImageData.width,
        state.qrImageData.height
      )
    );

    thresholdCanvas.width = thresholded.width;
    thresholdCanvas.height = thresholded.height;
    thresholdCanvas.getContext("2d").putImageData(thresholded, 0, 0);

    const trimmed = trimWhiteBorder(thresholded, 1);
    const inner = innerCrop(trimmed, 24);

    cropCanvas.width = inner.width;
    cropCanvas.height = inner.height;
    cropCanvas.getContext("2d").putImageData(inner, 0, 0);

    let modulePixelSize = estimateModuleSize(trimmed);
    if (!modulePixelSize || modulePixelSize < 1) {
      modulePixelSize = 4;
    }

    const tiles = extractTiles(inner, modulePixelSize);
    if (!tiles || !tiles.length) {
      throw new Error("No tiles could be extracted from this QR");
    }

    let maskSource = null;

    if (maskModeSelect.value === "custom") {
      if (!state.customMaskCanvas) {
        throw new Error("Build a custom mask first");
      }
      maskSource = state.customMaskCanvas;
    } else {
      const selectedMask = maskSelect.value;
      if (!selectedMask || !maskPresets[selectedMask]) {
        throw new Error("No valid preset mask selected");
      }
      maskSource = await loadMask(maskPresets[selectedMask]);
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
      qrOffsetY: Number(qrOffsetY.value || 0)
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

exportBtn.addEventListener("click", () => {
  try {
    exportPNG(outputCanvas);
    setDebug("Export triggered");
  } catch (err) {
    console.error(err);
    setDebug(`Export error: ${getErrorMessage(err)}`);
  }
});
