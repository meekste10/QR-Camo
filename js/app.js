import { state } from "./state.js";
import { maskPresets } from "./presets.js";
import { loadImage, drawToCanvas } from "./image-utils.js";
import {
  threshold,
  trimWhiteBorder,
  estimateModuleSize,
  imageDataToCanvas
} from "./qr-preprocess.js";
import { extractTiles } from "./tile-engine.js";
import { loadMask } from "./mask-engine.js";
import { render } from "./render-engine.js";
import { exportPNG } from "./export.js";

const debugPanel = document.getElementById("debugPanel");
const setDebug = (msg) => {
  if (debugPanel) debugPanel.textContent = `debug: ${msg}`;
  console.log(msg);
};

setDebug("app.js loaded");

const header = document.querySelector("h1");
if (header) header.textContent = "QR Camo Lab ✅";

const qrUpload = document.getElementById("qrUpload");
const maskSelect = document.getElementById("maskSelect");
const generateBtn = document.getElementById("generateBtn");
const exportBtn = document.getElementById("exportBtn");

const originalCanvas = document.getElementById("originalCanvas");
const thresholdCanvas = document.getElementById("thresholdCanvas");
const cropCanvas = document.getElementById("cropCanvas");
const outputCanvas = document.getElementById("outputCanvas");

setDebug("elements grabbed");

if (maskSelect && maskSelect.options.length === 0) {
  Object.keys(maskPresets).forEach((k) => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    maskSelect.appendChild(o);
  });
  setDebug("mask presets added from js");
} else {
  setDebug("mask options already present");
}

qrUpload.addEventListener("change", async (e) => {
  try {
    setDebug("file selected");

    const file = e.target.files[0];
    if (!file) {
      setDebug("no file selected");
      return;
    }

    const img = await loadImage(file);
    state.qrImage = img;
    state.qrImageData = drawToCanvas(img, originalCanvas);

    setDebug(`image drawn ${state.qrImageData.width}x${state.qrImageData.height}`);
  } catch (err) {
    console.error(err);
    setDebug(`upload error: ${err.message}`);
  }
});

generateBtn.addEventListener("click", async () => {
  try {
    if (!state.qrImageData) {
      setDebug("no image data loaded yet");
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

    setDebug("trimming white border aggressively");

    const trimmed = trimWhiteBorder(thresholded, 1);

    cropCanvas.width = trimmed.width;
    cropCanvas.height = trimmed.height;
    cropCanvas.getContext("2d").putImageData(trimmed, 0, 0);

    const modulePixelSize = estimateModuleSize(trimmed);
    setDebug(`estimated native module size: ${modulePixelSize}px`);

    const tiles = extractTiles(trimmed, modulePixelSize);
    setDebug(`tiles extracted: ${tiles.length}`);

    const selectedMask = maskSelect.value;
    const mask = await loadMask(maskPresets[selectedMask]);
    setDebug(`mask loaded: ${selectedMask}`);

    const sourceQrCanvas = imageDataToCanvas(trimmed);

    render({
      tiles,
      maskImg: mask,
      outputCanvas,
      sourceQrCanvas,
      modulePixelSize
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
