import { state } from "./state.js";
import { maskPresets } from "./presets.js";
import { loadImage, drawToCanvas } from "./image-utils.js";
import {
  threshold,
  trimWhiteBorder,
  innerCrop,
  estimateModuleSize,
  imageDataToCanvas
} from "./qr-preprocess.js";
import { extractTiles } from "./tile-engine.js";
import { loadMask } from "./mask-engine.js";
import { buildMaskFromImage } from "./mask-builder.js";
import { render } from "./render-engine.js";
import { exportPNG } from "./export.js";

const debugPanel = document.getElementById("debugPanel");
const setDebug = (msg) => {
  if (debugPanel) debugPanel.textContent = msg;
  console.log(msg);
};

const qrUpload = document.getElementById("qrUpload");
const maskModeSelect = document.getElementById("maskModeSelect");
const maskSelect = document.getElementById("maskSelect");
const customMaskUpload = document.getElementById("customMaskUpload");
const customMaskThreshold = document.getElementById("customMaskThreshold");
const customMaskInvert = document.getElementById("customMaskInvert");
const buildMaskBtn = document.getElementById("buildMaskBtn");
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

const presetMaskSection = document.getElementById("presetMaskSection");
const customMaskSection = document.getElementById("customMaskSection");

const originalCanvas = document.getElementById("originalCanvas");
const thresholdCanvas = document.getElementById("thresholdCanvas");
const cropCanvas = document.getElementById("cropCanvas");
const customMaskCanvas = document.getElementById("customMaskCanvas");
const outputCanvas = document.getElementById("outputCanvas");

state.customMaskImage = null;
state.customMaskCanvas = null;

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

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;

  const int = parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  };
}

function recolorOutputCanvas(canvas, fgHex, bgHex, useTransparentBackground) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);

  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];

    if (alpha === 0) {
      continue;
    }

    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const isDark = avg < 128;

    if (isDark) {
      d[i] = fg.r;
      d[i + 1] = fg.g;
      d[i + 2] = fg.b;
      d[i + 3] = 255;
    } else {
      if (useTransparentBackground) {
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

  setDebug("Colors applied");
}

setDebug("Root lab loaded");

if (maskSelect && maskSelect.options.length === 0) {
  Object.keys(maskPresets).forEach((k) => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    maskSelect.appendChild(o);
  });
}

syncMaskModeUI();
syncOffsetLabels();

maskModeSelect.addEventListener("change", syncMaskModeUI);
qrOffsetX.addEventListener("input", syncOffsetLabels);
qrOffsetY.addEventListener("input", syncOffsetLabels);

foregroundColor.addEventListener("input", applyCurrentColorsToOutput);
backgroundColor.addEventListener("input", applyCurrentColorsToOutput);
transparentBackground.addEventListener("change", applyCurrentColorsToOutput);

qrUpload.addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) {
      setDebug("No QR file selected");
      return;
    }

    const img = await loadImage(file);
    state.qrImage = img;
    state.qrImageData = drawToCanvas(img, originalCanvas);

    setDebug(`QR image drawn ${state.qrImageData.width}x${state.qrImageData.height}`);
  } catch (err) {
    console.error(err);
    setDebug(`QR upload error: ${err.message}`);
  }
});

customMaskUpload.addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) {
      setDebug("No custom mask file selected");
      return;
    }

    const img = await loadImage(file);
    state.customMaskImage = img;
    setDebug(`Custom mask source loaded ${img.width}x${img.height}`);
  } catch (err) {
    console.error(err);
    setDebug(`Custom mask upload error: ${err.message}`);
  }
});

buildMaskBtn.addEventListener("click", () => {
  try {
    if (!state.customMaskImage) {
      setDebug("No custom mask image loaded yet");
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
  } catch (err) {
    console.error(err);
    setDebug(`Build mask error: ${err.message}`);
  }
});

generateBtn.addEventListener("click", async () => {
  try {
    if (!state.qrImageData) {
      setDebug("No QR image data loaded yet");
      return;
    }

    setDebug("Thresholding uploaded QR");

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

    setDebug("Trimming outer white border");

    const trimmed = trimWhiteBorder(thresholded, 1);

    setDebug("Making inner crop for tile source");

    const inner = innerCrop(trimmed, 24);

    cropCanvas.width = inner.width;
    cropCanvas.height = inner.height;
    cropCanvas.getContext("2d").putImageData(inner, 0, 0);

    let modulePixelSize = estimateModuleSize(trimmed);
    if (!modulePixelSize || modulePixelSize < 1) {
      modulePixelSize = 4;
    }

    const tiles = extractTiles(inner, modulePixelSize);
    setDebug(`Tiles extracted: ${tiles.length}`);

    let maskSource = null;

    if (maskModeSelect.value === "custom") {
      if (!state.customMaskCanvas) {
        setDebug("Build a custom mask first");
        return;
      }
      maskSource = state.customMaskCanvas;
      setDebug("Using custom mask");
    } else {
      const selectedMask = maskSelect.value;
      maskSource = await loadMask(maskPresets[selectedMask]);
      setDebug(`Using preset mask: ${selectedMask}`);
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
  } catch (err) {
    console.error(err);
    setDebug(`Generate error: ${err.message}`);
  }
});

exportBtn.addEventListener("click", () => {
  try {
    exportPNG(outputCanvas);
    setDebug("Export triggered");
  } catch (err) {
    console.error(err);
    setDebug(`Export error: ${err.message}`);
  }
});
