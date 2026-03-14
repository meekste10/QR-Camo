import { state } from "./state.js";
import { maskPresets } from "./presets.js";
import { loadImage, drawToCanvas } from "./image-utils.js";
import { threshold, cropInterior } from "./qr-preprocess.js";
import { extractTiles } from "./tile-engine.js";
import { loadMask } from "./mask-engine.js";
import { render } from "./render-engine.js";
import { exportPNG } from "./export.js";

const debug = document.createElement("div");
debug.style.position = "fixed";
debug.style.bottom = "10px";
debug.style.left = "10px";
debug.style.background = "rgba(0,0,0,0.8)";
debug.style.color = "#00ff88";
debug.style.padding = "8px 10px";
debug.style.fontSize = "12px";
debug.style.zIndex = "9999";
debug.textContent = "app.js loaded";
document.body.appendChild(debug);

console.log("QR Camo app.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector("h1");
  if (header) header.textContent = "QR Camo Lab ✅";
});

const qrUpload = document.getElementById("qrUpload");
const maskSelect = document.getElementById("maskSelect");
const generateBtn = document.getElementById("generateBtn");
const exportBtn = document.getElementById("exportBtn");

const originalCanvas = document.getElementById("originalCanvas");
const thresholdCanvas = document.getElementById("thresholdCanvas");
const cropCanvas = document.getElementById("cropCanvas");
const outputCanvas = document.getElementById("outputCanvas");

Object.keys(maskPresets).forEach((k) => {
  const o = document.createElement("option");
  o.value = k;
  o.textContent = k;
  maskSelect.appendChild(o);
});

qrUpload.onchange = async (e) => {
  debug.textContent = "file selected";

  const file = e.target.files[0];
  if (!file) {
    debug.textContent = "no file selected";
    return;
  }

  const img = await loadImage(file);
  state.qrImage = img;
  state.qrImageData = drawToCanvas(img, originalCanvas);

  debug.textContent = "image drawn to original canvas";
};

generateBtn.onclick = async () => {
  if (!state.qrImageData) {
    debug.textContent = "no image data loaded yet";
    return;
  }

  debug.textContent = "thresholding image";

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

  debug.textContent = "cropping image";

  const cropped = cropInterior(thresholded, 22);

  cropCanvas.width = cropped.width;
  cropCanvas.height = cropped.height;
  cropCanvas.getContext("2d").putImageData(cropped, 0, 0);

  debug.textContent = "extracting tiles";

  const tiles = extractTiles(cropped, 14);

  debug.textContent = "loading mask";

  const mask = await loadMask(maskPresets[maskSelect.value]);

  debug.textContent = "rendering output";

  render({
    tiles,
    maskImg: mask,
    outputCanvas,
    tileSize: 14,
  });

  debug.textContent = "render complete";
};

exportBtn.onclick = () => exportPNG(outputCanvas);
