import { state } from "./state.js";
import { maskPresets } from "./presets.js";
import { loadImage } from "./image-utils.js";
import {
  threshold,
  trimWhiteBorder,
  innerCrop,
  estimateModuleSize,
  estimateTextureTileSize,
  imageDataToCanvas
} from "./qr-preprocess.js";
import { extractTiles } from "./tile-engine.js";
import { loadMask } from "./mask-engine.js";
import { buildMaskFromImage } from "./mask-builder.js";
import { render } from "./render-engine.js";
import { exportPNG } from "./export.js";

const debugPanel = document.getElementById("debugPanel");
const qrReadyBadge = document.getElementById("qrReadyBadge");
const shapeReadyBadge = document.getElementById("shapeReadyBadge");
const engineStatus = document.getElementById("engineStatus");

const qrTextInput = document.getElementById("qrTextInput");
const makeQrBtn = document.getElementById("makeQrBtn");
const qrUpload = document.getElementById("qrUpload");

const maskSelect = document.getElementById("maskSelect");
const customMaskUpload = document.getElementById("customMaskUpload");

const qrSizeSelect = document.getElementById("qrSizeSelect");
const qrOffsetX = document.getElementById("qrOffsetX");
const qrOffsetY = document.getElementById("qrOffsetY");
const qrOffsetXLabel = document.getElementById("qrOffsetXLabel");
const qrOffsetYLabel = document.getElementById("qrOffsetYLabel");

const nudgeUp = document.getElementById("nudgeUp");
const nudgeRight = document.getElementById("nudgeRight");
const nudgeDown = document.getElementById("nudgeDown");
const nudgeLeft = document.getElementById("nudgeLeft");
const resetPositionBtn = document.getElementById("resetPositionBtn");

const foregroundColor = document.getElementById("foregroundColor");
const backgroundColor = document.getElementById("backgroundColor");
const transparentBackground = document.getElementById("transparentBackground");
const contrastWarning = document.getElementById("contrastWarning");

const generateBtn = document.getElementById("generateBtn");
const exportBtn = document.getElementById("exportBtn");

const previewMeta = document.getElementById("previewMeta");
const sourceMeta = document.getElementById("sourceMeta");
const previewStage = document.querySelector(".preview-stage");
const previewEmptyState = document.getElementById("previewEmptyState");
const sourcePreviewCanvas = document.getElementById("sourcePreviewCanvas");
const outputCanvas = document.getElementById("outputCanvas");

state.customMaskImage = null;
state.customMaskCanvas = null;

const NUDGE_STEP = 8;

function setDebug(msg) {
  if (debugPanel) debugPanel.textContent = msg;
  if (engineStatus) engineStatus.textContent = msg;
  console.log(msg);
}

function setPreviewMeta(msg) {
  if (previewMeta) previewMeta.textContent = msg;
}

function setSourceMeta(msg) {
  if (sourceMeta) sourceMeta.textContent = msg;
}

function show(el, on) {
  if (!el) return;
  el.classList.toggle("hidden", !on);
}

function updatePreviewFlags({ hasSource = false, hasOutput = false } = {}) {
  previewStage.classList.toggle("has-source", !!hasSource);
  previewStage.classList.toggle("has-output", !!hasOutput);

  if (previewEmptyState) {
    previewEmptyState.classList.toggle("hidden", hasSource || hasOutput);
  }
}

function syncOffsetLabels() {
  qrOffsetXLabel.textContent = String(qrOffsetX.value);
  qrOffsetYLabel.textContent = String(qrOffsetY.value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "").trim();
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;

  const int = parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  };
}

function relativeLuminance({ r, g, b }) {
  const toLinear = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function updateContrastWarning() {
  if (transparentBackground.checked) {
    contrastWarning.classList.add("hidden");
    return;
  }

  const fg = hexToRgb(foregroundColor.value);
  const bg = hexToRgb(backgroundColor.value);
  const ratio = contrastRatio(fg, bg);

  contrastWarning.classList.toggle("hidden", ratio >= 2.5);
}

function recolorOutputCanvas(canvas, fgHex, bgHex, useTransparentBackground) {
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
    } else if (useTransparentBackground) {
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
}

function createCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function drawContain(ctx, source, width, height, padding = 0, background = null) {
  ctx.clearRect(0, 0, width, height);

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);

  const sw = source.width || 1;
  const sh = source.height || 1;
  const scale = Math.min(availW / sw, availH / sh);

  const drawW = Math.max(1, Math.round(sw * scale));
  const drawH = Math.max(1, Math.round(sh * scale));
  const dx = Math.round((width - drawW) / 2);
  const dy = Math.round((height - drawH) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, dx, dy, drawW, drawH);
}

function paintSourcePreview(sourceCanvas) {
  if (!sourceCanvas) return;

  sourcePreviewCanvas.width = 800;
  sourcePreviewCanvas.height = 800;

  const ctx = sourcePreviewCanvas.getContext("2d");
  drawContain(ctx, sourceCanvas, 800, 800, 40, "#0a1020");

  updatePreviewFlags({ hasSource: true, hasOutput: false });
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

  const qrModel = window.QRCode.create(text, {
    errorCorrectionLevel: "H"
  });

  const moduleCount = qrModel.modules.size;
  const pixelsPerModule = 12;
  const qrPixelSize = moduleCount * pixelsPerModule;

  const tempCanvas = createCanvas(qrPixelSize, qrPixelSize);
  const ctx = tempCanvas.getContext("2d");

  ctx.clearRect(0, 0, qrPixelSize, qrPixelSize);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, qrPixelSize, qrPixelSize);

  ctx.fillStyle = "#000000";
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qrModel.modules.get(row, col)) {
        ctx.fillRect(
          col * pixelsPerModule,
          row * pixelsPerModule,
          pixelsPerModule,
          pixelsPerModule
        );
      }
    }
  }

  state.qrImage = null;
  state.qrImageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

  paintSourcePreview(tempCanvas);
  setSourceMeta("Generated from link/text");
  setPreviewMeta("QR ready");
  show(qrReadyBadge, true);
}

async function handleQrUpload(file) {
  const img = await loadImageFromFile(file);

  const qrCanvas = createCanvas(900, 900);
  const ctx = qrCanvas.getContext("2d");
  drawContain(ctx, img, 900, 900, 10, "#ffffff");

  state.qrImage = img;
  state.qrImageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);

  paintSourcePreview(qrCanvas);
  setSourceMeta(file.name || "Uploaded QR");
  setPreviewMeta("QR ready");
  show(qrReadyBadge, true);
}

function buildCurrentMaskFromUploaded() {
  if (!state.customMaskImage) return null;

  const maskCanvas = buildMaskFromImage(state.customMaskImage, {
    size: 800
  });

  state.customMaskCanvas = maskCanvas;
  show(shapeReadyBadge, true);
  return maskCanvas;
}

function populatePresetSelect() {
  maskSelect.innerHTML = "";

  Object.keys(maskPresets).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    maskSelect.appendChild(option);
  });
}

async function renderOutput() {
  try {
    if (!state.qrImageData) {
      setDebug("Create or upload a QR first.");
      return;
    }

    const thresholded = threshold(
      new ImageData(
        new Uint8ClampedArray(state.qrImageData.data),
        state.qrImageData.width,
        state.qrImageData.height
      )
    );

    const trimmed = trimWhiteBorder(thresholded, 0);
    const inner = innerCrop(trimmed, 24);

    let modulePixelSize = estimateModuleSize(trimmed);
    if (!modulePixelSize || modulePixelSize < 1) {
      modulePixelSize = 4;
    }

    const textureTileSize = estimateTextureTileSize(inner, modulePixelSize);

    const tiles = extractTiles(inner, textureTileSize, {
      stride: Math.max(1, Math.floor(textureTileSize * 0.75)),
      rejectMostlySolid: true
    });

    if (!tiles || !tiles.length) {
      throw new Error("No tiles could be extracted from this QR");
    }

    let maskSource = null;

    if (state.customMaskImage) {
      maskSource = buildCurrentMaskFromUploaded();
    } else {
      const selectedMask = maskSelect.value;
      if (!selectedMask || !maskPresets[selectedMask]) {
        throw new Error("No valid preset mask selected");
      }
      maskSource = await loadMask(maskPresets[selectedMask]);
      show(shapeReadyBadge, true);
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
    updatePreviewFlags({ hasSource: true, hasOutput: true });
    setPreviewMeta(`QR-Camo ready · core ${modulePixelSize}px · texture ${textureTileSize}px`);
    setDebug("Render complete");
  } catch (err) {
    console.error(err);
    setDebug(`Render failed: ${err.message}`);
  }
}

function nudge(dx, dy) {
  qrOffsetX.value = String(clamp(Number(qrOffsetX.value || 0) + dx, -240, 240));
  qrOffsetY.value = String(clamp(Number(qrOffsetY.value || 0) + dy, -240, 240));
  syncOffsetLabels();
}

function resetPosition() {
  qrOffsetX.value = "0";
  qrOffsetY.value = "0";
  syncOffsetLabels();
}

function init() {
  populatePresetSelect();
  syncOffsetLabels();
  updateContrastWarning();
  updatePreviewFlags({ hasSource: false, hasOutput: false });
  setPreviewMeta("Waiting for QR or shape");
  setSourceMeta("Nothing loaded yet");
  setDebug("Ready");

  makeQrBtn.addEventListener("click", async () => {
    try {
      const text = (qrTextInput.value || "").trim();
      if (!text) {
        setDebug("Paste a link or text first.");
        return;
      }

      await buildQrFromText(text);
      setDebug("QR created from text.");
    } catch (err) {
      console.error(err);
      setDebug(`QR generation failed: ${err.message}`);
    }
  });

  qrTextInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    makeQrBtn.click();
  });

  qrUpload.addEventListener("change", async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      await handleQrUpload(file);
      setDebug("QR uploaded.");
    } catch (err) {
      console.error(err);
      setDebug(`QR upload failed: ${err.message}`);
    }
  });

  customMaskUpload.addEventListener("change", async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      state.customMaskImage = await loadImageFromFile(file);
      state.customMaskCanvas = null;
      show(shapeReadyBadge, true);
      setDebug("Custom shape uploaded.");
    } catch (err) {
      console.error(err);
      setDebug(`Shape upload failed: ${err.message}`);
    }
  });

  generateBtn.addEventListener("click", renderOutput);

  exportBtn.addEventListener("click", () => {
    try {
      if (!outputCanvas.width || !outputCanvas.height) {
        setDebug("Generate a QR-Camo first.");
        return;
      }
      exportPNG(outputCanvas);
      setDebug("Exported PNG.");
    } catch (err) {
      console.error(err);
      setDebug(`Export failed: ${err.message}`);
    }
  });

  qrSizeSelect.addEventListener("change", () => {
    setDebug(`QR size: ${qrSizeSelect.value}`);
  });

  nudgeUp.addEventListener("click", () => nudge(0, -NUDGE_STEP));
  nudgeRight.addEventListener("click", () => nudge(NUDGE_STEP, 0));
  nudgeDown.addEventListener("click", () => nudge(0, NUDGE_STEP));
  nudgeLeft.addEventListener("click", () => nudge(-NUDGE_STEP, 0));
  resetPositionBtn.addEventListener("click", resetPosition);

  foregroundColor.addEventListener("input", () => {
    updateContrastWarning();
    if (outputCanvas.width) applyCurrentColorsToOutput();
  });

  backgroundColor.addEventListener("input", () => {
    updateContrastWarning();
    if (outputCanvas.width) applyCurrentColorsToOutput();
  });

  transparentBackground.addEventListener("change", () => {
    updateContrastWarning();
    if (outputCanvas.width) applyCurrentColorsToOutput();
  });
}

init();
