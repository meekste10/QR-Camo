const APP_VERSION = "v0.6.3";

import { state } from "./state.js?v=0.6.3";
import {
  threshold,
  trimWhiteBorder,
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

const debugPanel = document.getElementById("debugPanel");
const qrReadyBadge = document.getElementById("qrReadyBadge");
const shapeReadyBadge = document.getElementById("shapeReadyBadge");
const engineStatus = document.getElementById("engineStatus");
const appVersionBadge = document.getElementById("appVersionBadge");

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
state.sourceQrCanvas = null;
state.overlayQrCanvas = null;
state.textureTiles = [];
state.moduleCount = 21;
state.modulePixelSize = 1;
state.blockModules = 2;

const NUDGE_STEP = 8;
const DEFAULT_BLEND_TIGHTNESS = 50;
const DEFAULT_MASK_SCALE = 100;
const DEFAULT_BLOCK_MODULES = 2;
const DEFAULT_UPLOAD_BLOCK_MODULES = 3;
const DEFAULT_UPLOAD_THRESHOLD = 145;

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
  if (!previewStage) return;

  previewStage.classList.toggle("has-source", !!hasSource);
  previewStage.classList.toggle("has-output", !!hasOutput);

  if (previewEmptyState) {
    previewEmptyState.classList.toggle("hidden", hasSource || hasOutput);
  }
}

function syncOffsetLabels() {
  if (qrOffsetXLabel) qrOffsetXLabel.textContent = String(qrOffsetX.value);
  if (qrOffsetYLabel) qrOffsetYLabel.textContent = String(qrOffsetY.value);
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
  if (!contrastWarning) return;

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
  if (!sourceCanvas || !sourcePreviewCanvas) return;

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

function buildGeneratedQrCanvas(text) {
  const qrModel = window.QRCode.create(text, {
    errorCorrectionLevel: "H"
  });

  const moduleCount = qrModel.modules.size;
  const canvas = createCanvas(moduleCount, moduleCount);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, moduleCount, moduleCount);
  ctx.fillStyle = "#000000";

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qrModel.modules.get(row, col)) {
        ctx.fillRect(col, row, 1, 1);
      }
    }
  }

  return {
    normalizedCanvas: canvas,
    overlayCanvas: canvas,
    moduleCount
  };
}

async function buildQrFromText(text) {
  if (!window.QRCode) {
    throw new Error("QRCode library not loaded");
  }

  const generated = buildGeneratedQrCanvas(text);
  const interiorCanvas = cropQrInterior(generated.normalizedCanvas, 8);

  const tiles = extractTiles(interiorCanvas, DEFAULT_BLOCK_MODULES, {
    stride: Math.max(1, Math.floor(DEFAULT_BLOCK_MODULES / 2)),
    rejectMostlySolid: true,
    minBlackRatio: 0.02,
    maxBlackRatio: 0.98
  });

  if (!tiles.length) {
    throw new Error("No tiles could be extracted from generated QR");
  }

  state.sourceQrCanvas = generated.normalizedCanvas;
  state.overlayQrCanvas = generated.overlayCanvas;
  state.textureTiles = tiles;
  state.moduleCount = generated.moduleCount;
  state.modulePixelSize = 1;
  state.blockModules = DEFAULT_BLOCK_MODULES;

  paintSourcePreview(generated.overlayCanvas);
  setSourceMeta("Generated from link/text");
  setPreviewMeta(`QR ready · ${APP_VERSION} · modules ${generated.moduleCount}`);
  show(qrReadyBadge, true);
}

async function handleQrUpload(file) {
  const img = await loadImageFromFile(file);

  const inputCanvas = createCanvas(1024, 1024);
  const ictx = inputCanvas.getContext("2d");
  drawContain(ictx, img, 1024, 1024, 20, "#ffffff");

  const inputImageData = ictx.getImageData(0, 0, inputCanvas.width, inputCanvas.height);

  const normalized = normalizeQrImageData(inputImageData, DEFAULT_UPLOAD_THRESHOLD);

  const trimmedOnly = normalized.trimmedImageData;
  const modulePixelSize = Math.max(1, trimmedOnly.width / normalized.moduleCount);

  const interiorCanvas = cropQrInteriorFromTrimmed(
    trimmedOnly,
    modulePixelSize,
    8
  );

  const uploadTilePx = Math.max(
    3,
    Math.round(modulePixelSize * DEFAULT_UPLOAD_BLOCK_MODULES)
  );

  const tiles = extractTiles(interiorCanvas, uploadTilePx, {
    stride: Math.max(1, Math.floor(uploadTilePx / 2)),
    rejectMostlySolid: true,
    minBlackRatio: 0.01,
    maxBlackRatio: 0.99
  });

  if (!tiles.length) {
    throw new Error("No tiles could be extracted from uploaded QR");
  }

  const overlayCanvas = imageDataToCanvas(trimmedOnly);

  state.sourceQrCanvas = normalized.canvas;
  state.overlayQrCanvas = overlayCanvas;
  state.textureTiles = tiles;
  state.moduleCount = normalized.moduleCount;
  state.modulePixelSize = modulePixelSize;
  state.blockModules = DEFAULT_UPLOAD_BLOCK_MODULES;

  paintSourcePreview(state.overlayQrCanvas);
  setSourceMeta(file.name || "Uploaded QR");
  setPreviewMeta(
    `QR ready · ${APP_VERSION} · modules ${normalized.moduleCount} · tilePx ${uploadTilePx}`
  );
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
  if (!maskSelect) return;

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
    if (!state.sourceQrCanvas || !state.textureTiles?.length) {
      setDebug("Create or upload a QR first.");
      return;
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

    render({
      tiles: state.textureTiles,
      maskImg: maskSource,
      outputCanvas,
      sourceQrCanvas: state.sourceQrCanvas,
      overlayQrCanvas: state.overlayQrCanvas || state.sourceQrCanvas,
      moduleCount: state.moduleCount,
      qrSize: qrSizeSelect.value,
      qrOffsetX: Number(qrOffsetX.value || 0),
      qrOffsetY: Number(qrOffsetY.value || 0),
      blendTightness: DEFAULT_BLEND_TIGHTNESS,
      maskScale: DEFAULT_MASK_SCALE,
      blockModules: state.blockModules || DEFAULT_BLOCK_MODULES
    });

    applyCurrentColorsToOutput();
    updatePreviewFlags({ hasSource: true, hasOutput: true });

    setPreviewMeta(`QR-Camo ready · ${APP_VERSION} · tiles ${state.textureTiles.length}`);
    setDebug(`Render complete · ${APP_VERSION}`);
  } catch (err) {
    console.error(err);
    setDebug(`Render failed: ${err.message}`);
  }
}

function nudge(dx, dy) {
  qrOffsetX.value = String(clamp(Number(qrOffsetX.value || 0) + dx, -240, 240));
  qrOffsetY.value = String(clamp(Number(qrOffsetY.value || 0) + dy, -240, 240));
  syncOffsetLabels();
  renderOutput();
}

function resetPosition() {
  qrOffsetX.value = "0";
  qrOffsetY.value = "0";
  syncOffsetLabels();
  renderOutput();
}

function init() {
  if (appVersionBadge) {
    appVersionBadge.textContent = APP_VERSION;
  }

  populatePresetSelect();
  syncOffsetLabels();
  updateContrastWarning();
  updatePreviewFlags({ hasSource: false, hasOutput: false });
  setPreviewMeta(`Waiting for QR or shape · ${APP_VERSION}`);
  setSourceMeta("Nothing loaded yet");
  setDebug(`Ready · ${APP_VERSION}`);

  makeQrBtn.addEventListener("click", async () => {
    try {
      const text = (qrTextInput.value || "").trim();
      if (!text) {
        setDebug("Paste a link or text first.");
        return;
      }

      await buildQrFromText(text);
      setDebug(`QR created from text · ${APP_VERSION}`);
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
      setDebug(`QR uploaded · ${APP_VERSION}`);
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
      setDebug(`Custom shape uploaded · ${APP_VERSION}`);
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
      setDebug(`Exported PNG · ${APP_VERSION}`);
    } catch (err) {
      console.error(err);
      setDebug(`Export failed: ${err.message}`);
    }
  });

  qrSizeSelect.addEventListener("change", () => {
    setDebug(`QR size: ${qrSizeSelect.value} · ${APP_VERSION}`);
  });
    qrOffsetX.addEventListener("input", () => {
    syncOffsetLabels();
    renderOutput();
  });

  qrOffsetY.addEventListener("input", () => {
    syncOffsetLabels();
    renderOutput();
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
