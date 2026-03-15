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
  if (debugPanel) debugPanel.textContent = `debug: ${msg}`;
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
  presetMaskSection.style.display = mode === "preset" ? "block" : "none";
  customMaskSection.style.display = mode === "custom" ? "block" : "none";
  setDebug(`mask mode: ${mode}`);
}

function syncOffsetLabels() {
  qrOffsetXLabel.textContent = qrOffsetX.value;
  qrOffsetYLabel.textContent = qrOffsetY.value;
}

setDebug("app.js loaded");

const header = document.querySelector("h1");
if (header) header.textContent = "QR Camo Lab ✅";

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

qrUpload.addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) {
      setDebug("no QR file selected");
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
      setDebug("no custom mask file selected");
      return;
    }

    const img = await loadImage(file);
    state.customMaskImage = img;
    setDebug(`custom mask source loaded ${img.width}x${img.height}`);
  } catch (err) {
    console.error(err);
    setDebug(`custom mask upload error: ${err.message}`);
  }
});

buildMaskBtn.addEventListener("click", () => {
  try {
    if (!state.customMaskImage) {
      setDebug("no custom mask image loaded yet");
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

    setDebug("custom mask built");
  } catch (err) {
    console.error(err);
    setDebug(`build mask error: ${err.message}`);
  }
});

generateBtn.addEventListener("click", async () => {
  try {
    if (!state.qrImageData) {
      setDebug("no QR image data loaded yet");
      return;
    }

    setDebug("thresholding uploaded QR");

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

    setDebug("trimming outer white border");

    const trimmed = trimWhiteBorder(thresholded, 1);

    setDebug("making inner crop for tile source");

    const inner = innerCrop(trimmed, 24);

    cropCanvas.width = inner.width;
    cropCanvas.height = inner.height;
    cropCanvas.getContext("2d").putImageData(inner, 0, 0);

    let modulePixelSize = estimateModuleSize(trimmed);
    if (!modulePixelSize || modulePixelSize < 1) {
      modulePixelSize = 4;
    }

    const tiles = extractTiles(inner, modulePixelSize);
    setDebug(`tiles extracted: ${tiles.length}`);

    let maskSource = null;

    if (maskModeSelect.value === "custom") {
      if (!state.customMaskCanvas) {
        setDebug("build a custom mask first");
        return;
      }
      maskSource = state.customMaskCanvas;
      setDebug("using custom mask");
    } else {
      const selectedMask = maskSelect.value;
      maskSource = await loadMask(maskPresets[selectedMask]);
      setDebug(`using preset mask: ${selectedMask}`);
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

    setDebug("render complete");
  } catch (err) {
    console.error(err);
    setDebug(`generate error: ${err.message}`);
  }
});

exportBtn.addEventListener("click", () => {
  try {
    exportPNG(outputCanvas);
    setDebug("export triggered");
  } catch (err) {
    console.error(err);
    setDebug(`export error: ${err.message}`);
  }
});
