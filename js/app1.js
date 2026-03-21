const APP_VERSION = "v0.6.3";

import { state } from "./state.js?v=0.6.3";
import {
  imageDataToCanvas,
  normalizeQrImageData,
  cropQrInterior,
  cropQrInteriorFromTrimmed
} from "./qr-preprocess.js?v=0.6.3";
import { extractTiles } from "./tile-engine.js?v=0.6.3";
import { maskPresets } from "./presets.js?v=0.6.3";
import { loadMask } from "./mask-engine.js?v=0.6.3";
import { buildMaskFromImage } from "./mask-builder.js?v=0.6.3";
import { render } from "./render-engine.js?v=0.6.3";
import { exportPNG } from "./export.js?v=0.6.3";

console.log("QR CAMO BUILD:", APP_VERSION);

const outputCanvas = document.getElementById("outputCanvas");

// ------------------------
// 🧊 LIVE COMPOSITOR
// ------------------------

function drawLiveComposite() {
  if (!state.baseCanvas) return;

  const ctx = outputCanvas.getContext("2d");

  ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  ctx.drawImage(state.baseCanvas, 0, 0);

  if (!state.overlayQrCanvas) return;

  const { x, y, scale } = state.liveTransform;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(state.overlayQrCanvas, 0, 0);

  ctx.restore();
}

// ------------------------
// 🧱 RENDER OUTPUT (MODIFIED)
// ------------------------

async function renderOutput() {
  if (!state.sourceQrCanvas || !state.textureTiles?.length) return;

  let maskSource = null;

  if (state.customMaskImage) {
    maskSource = buildMaskFromImage(state.customMaskImage, { size: 800 });
  } else {
    const selectedMask = document.getElementById("maskSelect").value;
    maskSource = await loadMask(maskPresets[selectedMask]);
  }

  render({
    tiles: state.textureTiles,
    maskImg: maskSource,
    outputCanvas,
    sourceQrCanvas: state.sourceQrCanvas,
    overlayQrCanvas: state.overlayQrCanvas,
    moduleCount: state.moduleCount,
    qrSize: "medium",

    // 🚨 IMPORTANT: freeze engine position
    qrOffsetX: 0,
    qrOffsetY: 0,

    blendTightness: 50,
    maskScale: 100,
    blockModules: state.blockModules || 2
  });

  // 🧊 CACHE BASE
  state.baseCanvas = document.createElement("canvas");
  state.baseCanvas.width = outputCanvas.width;
  state.baseCanvas.height = outputCanvas.height;

  state.baseCtx = state.baseCanvas.getContext("2d");
  state.baseCtx.drawImage(outputCanvas, 0, 0);

  // ⚡ INIT LIVE STATE
  state.liveTransform.x = 0;
  state.liveTransform.y = 0;
  state.liveTransform.scale = 1;

  drawLiveComposite();
}

// ------------------------
// ⚡ INTERACTION (UPDATED)
// ------------------------

function nudge(dx, dy) {
  state.liveTransform.x += dx;
  state.liveTransform.y += dy;
  drawLiveComposite();
}

function resetPosition() {
  state.liveTransform.x = 0;
  state.liveTransform.y = 0;
  state.liveTransform.scale = 1;
  drawLiveComposite();
}

// ------------------------
// 🖱️ DRAG SUPPORT
// ------------------------

outputCanvas.addEventListener("mousedown", () => {
  state.liveTransform.isDragging = true;
});

outputCanvas.addEventListener("mouseup", () => {
  state.liveTransform.isDragging = false;
});

outputCanvas.addEventListener("mousemove", (e) => {
  if (!state.liveTransform.isDragging) return;

  const rect = outputCanvas.getBoundingClientRect();

  state.liveTransform.x = e.clientX - rect.left;
  state.liveTransform.y = e.clientY - rect.top;

  drawLiveComposite();
});

// ------------------------
// 🧩 BUTTON HOOKS
// ------------------------

document.getElementById("generateBtn").addEventListener("click", renderOutput);

document.getElementById("exportBtn").addEventListener("click", () => {
  exportPNG(outputCanvas);
});

document.getElementById("nudgeUp").addEventListener("click", () => nudge(0, -8));
document.getElementById("nudgeDown").addEventListener("click", () => nudge(0, 8));
document.getElementById("nudgeLeft").addEventListener("click", () => nudge(-8, 0));
document.getElementById("nudgeRight").addEventListener("click", () => nudge(8, 0));

document.getElementById("resetPositionBtn").addEventListener("click", resetPosition);
