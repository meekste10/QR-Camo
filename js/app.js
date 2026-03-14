import { state } from "./state.js";
import { maskPresets } from "./presets.js";
import { loadImage, drawToCanvas } from "./image-utils.js";
import { threshold, cropInterior } from "./qr-preprocess.js";
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
const cropSlider = document.getElementById("cropSlider");
const tileSlider = document.getElementById("tileSlider");
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
    setDebug(`image loaded ${img.width}x${img.height}`);

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

    const cropPercent = Number(cropSlider.value || 22);
    const tileSize = Number(tileSlider.value || 14);

    setDebug("thresholding");

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

    setDebug("cropping");

    const cropped = cropInterior(thresholded, cropPercent);

    cropCanvas.width = cropped.width;
    cropCanvas.height = cropped.height;
    cropCanvas.getContext("2d").putImageData(cropped, 0, 0);

    setDebug("extracting tiles");

    const tiles = extractTiles(cropped, tileSize);
    setDebug(`tiles extracted: ${tiles.length}`);

    const selectedMask = maskSelect.value;
    setDebug(`loading mask: ${selectedMask}`);

    const mask = await loadMask(maskPresets[selectedMask]);

    setDebug("rendering");

    render({
      tiles,
      maskImg: mask,
      outputCanvas,
      tileSize,
      sourceQrCanvas: originalCanvas
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
