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
const maskScale = document.getElementById("maskScale");
const maskScaleLabel = document.getElementById("maskScaleLabel");
const maskPadding = document.getElementById("maskPadding");
const maskPaddingLabel = document.getElementById("maskPaddingLabel");
const invertMask = document.getElementById("invertMask");

const qrOffsetX = document.getElementById("qrOffsetX");
const qrOffsetY = document.getElementById("qrOffsetY");
const qrOffsetXLabel = document.getElementById("qrOffsetXLabel");
const qrOffsetYLabel = document.getElementById("qrOffsetYLabel");

const nudgeUp = document.getElementById("nudgeUp");
const nudgeRight = document.getElementById("nudgeRight");
const nudgeDown = document.getElementById("nudgeDown");
const nudgeLeft = document.getElementById("nudgeLeft");

const nudgeUpMedium = document.getElementById("nudgeUpMedium");
const nudgeRightMedium = document.getElementById("nudgeRightMedium");
const nudgeDownMedium = document.getElementById("nudgeDownMedium");
const nudgeLeftMedium = document.getElementById("nudgeLeftMedium");

const nudgeUpLarge = document.getElementById("nudgeUpLarge");
const nudgeRightLarge = document.getElementById("nudgeRightLarge");
const nudgeDownLarge = document.getElementById("nudgeDownLarge");
const nudgeLeftLarge = document.getElementById("nudgeLeftLarge");

const resetPositionBtn = document.getElementById("resetPositionBtn");

const foregroundColor = document.getElementById("foregroundColor");
const backgroundColor = document.getElementById("backgroundColor");
const transparentBackground = document.getElementById("transparentBackground");
const contrastWarning = document.getElementById("contrastWarning");

const generateBtn = document.getElementById("generateBtn");
const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");

const previewMeta = document.getElementById("previewMeta");
const sourceMeta = document.getElementById("sourceMeta");
const previewStage = document.querySelector(".preview-stage");
const previewEmptyState = document.getElementById("previewEmptyState");
const sourcePreviewCanvas = document.getElementById("sourcePreviewCanvas");
const outputCanvas = document.getElementById("outputCanvas");

const samplesGrid = document.getElementById("samplesGrid");
const presetShapesGrid = document.getElementById("presetShapesGrid");

state.customMaskImage = null;
state.customMaskCanvas = null;
state.sourceQrCanvas = null;
state.overlayQrCanvas = null;
state.textureTiles = [];
state.moduleCount = 21;
state.modulePixelSize = 1;
state.blockModules = 2;
state.hasRenderedOnce = false;

const NUDGE_STEP_SMALL = 8;
const NUDGE_STEP_MEDIUM = 24;
const NUDGE_STEP_LARGE = 56;
const PAN_LIMIT = 360;
const DEFAULT_QR_SIZE = "small";
const DEFAULT_BLEND_TIGHTNESS = 50;
const DEFAULT_MASK_SCALE = 100;
const DEFAULT_MASK_PADDING = 0;
const DEFAULT_BLOCK_MODULES = 2;
const DEFAULT_UPLOAD_BLOCK_MODULES = 3;
const DEFAULT_UPLOAD_THRESHOLD = 145;

const SAMPLE_BASE = "./assets/Samples/";

const samplePreviewCandidates = {
  "Coffee-mug-qr": [
    `${SAMPLE_BASE}Coffee-mug-qr.png`,
    `${SAMPLE_BASE}coffee-mug-qr.png`
  ],
  "Calendar-qr": [
    `${SAMPLE_BASE}Calendar-qr.png`,
    `${SAMPLE_BASE}calendar-qr.png`
  ],
  "Headphones-qr": [
    `${SAMPLE_BASE}Headphones-qr.png`,
    `${SAMPLE_BASE}headphones-qr.png`
  ],
  "repair-wrench-qr": [
    `${SAMPLE_BASE}Repair-wrench-qr.png`,
    `${SAMPLE_BASE}repair-wrench-qr.png`
  ],
  "profile-icon-qr": [
    `${SAMPLE_BASE}Profile-icon-qr.png`,
    `${SAMPLE_BASE}profile-icon-qr.png`
  ],
  "lock-icon-qr": [
    `${SAMPLE_BASE}Lock-icon-qr.png`,
    `${SAMPLE_BASE}lock-icon-qr.png`
  ],
  "shop-bag-qr": [
    `${SAMPLE_BASE}shop-bag-qr.png`,
    `${SAMPLE_BASE}Shop-bag-qr.png`
  ],
  "gift-qr": [
    `${SAMPLE_BASE}Gift-qr.png`,
    `${SAMPLE_BASE}gift-qr.png`
  ],
  "play-button-qr": [
    `${SAMPLE_BASE}Play-button-qr.png`,
    `${SAMPLE_BASE}play-button-qr.png`
  ],
  "map-qr": [
    `${SAMPLE_BASE}Map-qr.png`,
    `${SAMPLE_BASE}map-qr.png`
  ],
  "trophy-qr": [
    `${SAMPLE_BASE}Trophy-qr.png`,
    `${SAMPLE_BASE}trophy-qr.png`
  ],
  "human-head-qr": [
    `${SAMPLE_BASE}Human-head-qr.png`,
    `${SAMPLE_BASE}human-head-qr.png`
  ],
  "door-qr": [
    `${SAMPLE_BASE}Door-qr.png`,
    `${SAMPLE_BASE}door-qr.png`
  ],
  "pharmacy-qr": [
    `${SAMPLE_BASE}Pharmacy-qr.png`,
    `${SAMPLE_BASE}pharmacy-qr.png`
  ],
  "question-icon-qr": [
    `${SAMPLE_BASE}Question-icon-qr.png`,
    `${SAMPLE_BASE}question-icon-qr.png`
  ],
  "info-icon-qr": [
    `${SAMPLE_BASE}Info-icon-qr.png`,
    `${SAMPLE_BASE}info-icon-qr.png`
  ],
  "pizza-greek-qr": [
    `${SAMPLE_BASE}Pizza-greek-qr.png`,
    `${SAMPLE_BASE}pizza-greek-qr.png`
  ],
  "heart-lt-blue-qr": [
    `${SAMPLE_BASE}heart-lt-blue-qr.png`,
    `${SAMPLE_BASE}Heart-lt-blue-qr.png`
  ]
};

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

function syncMaskScaleLabel() {
  if (maskScaleLabel) maskScaleLabel.textContent = String(maskScale.value);
}

function syncMaskPaddingLabel() {
  if (maskPaddingLabel) maskPaddingLabel.textContent = String(maskPadding.value);
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

function paintOutputPreview(sourceCanvas) {
  if (!sourceCanvas || !outputCanvas) return;

  outputCanvas.width = 800;
  outputCanvas.height = 800;

  const ctx = outputCanvas.getContext("2d");
  drawContain(ctx, sourceCanvas, 800, 800, 40, "#0a1020");

  updatePreviewFlags({ hasSource: false, hasOutput: true });
}

function clearCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resetGenerateButton() {
  generateBtn.textContent = "Create QR-Camo";
  generateBtn.classList.remove("btn-secondary");
  generateBtn.classList.add("btn-primary");
  generateBtn.disabled = false;
}

function resetCreateButton() {
  if (!makeQrBtn) return;
  makeQrBtn.textContent = "Create QR";
  makeQrBtn.classList.remove("btn-secondary");
  makeQrBtn.classList.add("btn-primary");
  makeQrBtn.disabled = false;
}

function syncPresetShapeSelectionUI() {
  if (!presetShapesGrid) return;

  const cards = presetShapesGrid.querySelectorAll(".preset-shape-card");
  cards.forEach((card) => {
    const isSelected = card.dataset.mask === maskSelect.value;
    card.classList.toggle("is-selected", isSelected);
  });
}

function resetQrPreparedState() {
  state.sourceQrCanvas = null;
  state.overlayQrCanvas = null;
  state.textureTiles = [];
  state.moduleCount = 21;
  state.modulePixelSize = 1;
  state.blockModules = 2;
  state.hasRenderedOnce = false;

  clearCanvas(sourcePreviewCanvas);
  clearCanvas(outputCanvas);
  show(qrReadyBadge, false);
  show(shapeReadyBadge, false);
  updatePreviewFlags({ hasSource: false, hasOutput: false });
}

function resetAll() {
  if (qrTextInput) qrTextInput.value = "";
  if (qrUpload) qrUpload.value = "";
  if (customMaskUpload) customMaskUpload.value = "";

  if (maskSelect) maskSelect.value = "";
  if (qrSizeSelect) qrSizeSelect.value = DEFAULT_QR_SIZE;
  if (maskScale) maskScale.value = String(DEFAULT_MASK_SCALE);
  if (maskPadding) maskPadding.value = String(DEFAULT_MASK_PADDING);
  if (invertMask) invertMask.checked = false;

  syncPresetShapeSelectionUI();

  if (qrOffsetX) qrOffsetX.value = "0";
  if (qrOffsetY) qrOffsetY.value = "0";

  if (foregroundColor) foregroundColor.value = "#000000";
  if (backgroundColor) backgroundColor.value = "#ffffff";
  if (transparentBackground) transparentBackground.checked = false;

  state.customMaskImage = null;
  state.customMaskCanvas = null;
  state.sourceQrCanvas = null;
  state.overlayQrCanvas = null;
  state.textureTiles = [];
  state.moduleCount = 21;
  state.modulePixelSize = 1;
  state.blockModules = 2;
  state.hasRenderedOnce = false;

  syncOffsetLabels();
  syncMaskScaleLabel();
  syncMaskPaddingLabel();
  updateContrastWarning();

  clearCanvas(sourcePreviewCanvas);
  clearCanvas(outputCanvas);

  show(qrReadyBadge, false);
  show(shapeReadyBadge, false);

  updatePreviewFlags({ hasSource: false, hasOutput: false });
  setPreviewMeta(`Waiting for QR or shape · ${APP_VERSION}`);
  setSourceMeta("Nothing loaded yet");

  resetCreateButton();
  resetGenerateButton();

  setDebug(`Reset complete · ${APP_VERSION}`);
}

async function loadImageFromFile(file) {
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

async function loadImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image source: ${src}`));
    img.src = src;
  });
}

async function resolveFirstWorkingImage(srcList = []) {
  for (const src of srcList) {
    try {
      const img = await loadImageFromSrc(src);
      return { img, src };
    } catch (_) {}
  }
  throw new Error("No working sample image source found");
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

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a shape…";
  maskSelect.appendChild(placeholder);

  Object.keys(maskPresets).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    maskSelect.appendChild(option);
  });
}

async function ensureQrPrepared() {
  if (state.sourceQrCanvas && state.textureTiles?.length) return true;

  const uploadedFile = qrUpload?.files?.[0];
  if (uploadedFile) {
    await handleQrUpload(uploadedFile);
    return true;
  }

  const text = (qrTextInput.value || "").trim();
  if (!text) {
    setDebug("Paste a link or upload a QR first.");
    return false;
  }

  await buildQrFromText(text);
  return true;
}

async function renderOutput() {
  try {
    if (!state.sourceQrCanvas || !state.textureTiles?.length) {
      setDebug("Create or upload a QR first.");
      return false;
    }

    let maskSource = null;

    if (state.customMaskImage) {
      maskSource = buildCurrentMaskFromUploaded();
    } else {
      const selectedMask = maskSelect.value;
      if (!selectedMask || !maskPresets[selectedMask]) {
        throw new Error("No valid preset shape selected");
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
      maskScale: Number(maskScale.value || DEFAULT_MASK_SCALE),
      maskPadding: Number(maskPadding.value || DEFAULT_MASK_PADDING),
      invertMask: !!invertMask?.checked,
      blockModules: state.blockModules || DEFAULT_BLOCK_MODULES
    });

    applyCurrentColorsToOutput();
    updatePreviewFlags({ hasSource: true, hasOutput: true });

    state.hasRenderedOnce = true;

    setPreviewMeta(`QR-Camo ready · ${APP_VERSION} · tiles ${state.textureTiles.length}`);
    setDebug(`Render complete · ${APP_VERSION}`);
    return true;
  } catch (err) {
    console.error(err);
    setDebug(`Render failed: ${err.message}`);
    return false;
  }
}

async function createQrCamo() {
  const okQr = await ensureQrPrepared();
  if (!okQr) return false;

  const okRender = await renderOutput();
  if (!okRender) return false;

  generateBtn.textContent = "Created";
  generateBtn.classList.remove("btn-primary");
  generateBtn.classList.add("btn-secondary");
  generateBtn.disabled = true;

  if (makeQrBtn) {
    makeQrBtn.textContent = "Created";
    makeQrBtn.classList.remove("btn-primary");
    makeQrBtn.classList.add("btn-secondary");
    makeQrBtn.disabled = true;
  }

  return true;
}

async function autoRenderIfReady() {
  if (!state.hasRenderedOnce) return;
  if (!state.sourceQrCanvas || !state.textureTiles?.length) return;

  resetGenerateButton();
  const ok = await renderOutput();
  if (!ok) return;

  generateBtn.textContent = "Created";
  generateBtn.classList.remove("btn-primary");
  generateBtn.classList.add("btn-secondary");
  generateBtn.disabled = true;
}

function nudge(dx, dy) {
  qrOffsetX.value = String(clamp(Number(qrOffsetX.value || 0) + dx, -PAN_LIMIT, PAN_LIMIT));
  qrOffsetY.value = String(clamp(Number(qrOffsetY.value || 0) + dy, -PAN_LIMIT, PAN_LIMIT));
  syncOffsetLabels();
  renderOutput();
}

function resetPosition() {
  qrOffsetX.value = "0";
  qrOffsetY.value = "0";
  syncOffsetLabels();
  renderOutput();
}

async function handlePresetShapeSelection(maskKey) {
  if (!maskKey || !maskPresets[maskKey]) return;

  if (maskSelect) {
    maskSelect.value = maskKey;
  }

  state.customMaskImage = null;
  state.customMaskCanvas = null;

  if (customMaskUpload) {
    customMaskUpload.value = "";
  }

  show(shapeReadyBadge, true);
  syncPresetShapeSelectionUI();
  resetGenerateButton();

  if (state.hasRenderedOnce) {
    await autoRenderIfReady();
  } else {
    setDebug(`Preset shape selected · ${APP_VERSION}`);
  }
}

async function showSamplePreview(sampleKey) {
  const candidates = samplePreviewCandidates[sampleKey];
  if (!candidates?.length) {
    setDebug(`Sample not found: ${sampleKey}`);
    return;
  }

  try {
    const { img, src } = await resolveFirstWorkingImage(candidates);

    clearCanvas(sourcePreviewCanvas);
    paintOutputPreview(img);

    setPreviewMeta(`Sample preview · ${APP_VERSION}`);
    setSourceMeta(src.split("/").pop());

    show(qrReadyBadge, false);
    show(shapeReadyBadge, false);

    setDebug(`Loaded sample preview · ${APP_VERSION}`);
  } catch (err) {
    console.error(err);
    setDebug(`Sample load failed: ${err.message}`);
  }
}

function initSampleCardImages() {
  if (!samplesGrid) return;

  const cards = samplesGrid.querySelectorAll(".sample-card");
  cards.forEach((card) => {
    const key = card.dataset.sample;
    const img = card.querySelector("img");
    const candidates = samplePreviewCandidates[key];

    if (!img || !candidates?.length) return;

    let idx = 0;
    img.src = candidates[idx];

    img.onerror = () => {
      idx += 1;
      if (idx < candidates.length) {
        img.src = candidates[idx];
      }
    };
  });
}

function init() {
  if (appVersionBadge) {
    appVersionBadge.textContent = APP_VERSION;
  }

  populatePresetSelect();
  initSampleCardImages();

  syncOffsetLabels();
  syncMaskScaleLabel();
  syncMaskPaddingLabel();
  syncPresetShapeSelectionUI();
  updateContrastWarning();
  updatePreviewFlags({ hasSource: false, hasOutput: false });
  setPreviewMeta(`Waiting for QR or shape · ${APP_VERSION}`);
  setSourceMeta("Nothing loaded yet");
  setDebug(`Ready · ${APP_VERSION}`);

  if (makeQrBtn) {
    makeQrBtn.addEventListener("click", async () => {
      await createQrCamo();
    });
  }

  qrTextInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await createQrCamo();
  });

  qrTextInput.addEventListener("input", () => {
    resetCreateButton();
    resetGenerateButton();
    resetQrPreparedState();
  });

  qrUpload.addEventListener("change", async () => {
    resetCreateButton();
    resetGenerateButton();
    resetQrPreparedState();
  });

  customMaskUpload.addEventListener("change", async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      state.customMaskImage = await loadImageFromFile(file);
      state.customMaskCanvas = null;
      if (maskSelect) maskSelect.value = "";
      syncPresetShapeSelectionUI();

      show(shapeReadyBadge, true);
      resetGenerateButton();
      setDebug(`Custom shape uploaded · ${APP_VERSION}`);
      await autoRenderIfReady();
    } catch (err) {
      console.error(err);
      setDebug(`Shape upload failed: ${err.message}`);
    }
  });

  maskSelect.addEventListener("change", async () => {
    syncPresetShapeSelectionUI();
    resetGenerateButton();
    await autoRenderIfReady();
  });

  generateBtn.addEventListener("click", async () => {
    await createQrCamo();
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", resetAll);
  }

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

  qrSizeSelect.addEventListener("change", async () => {
    setDebug(`QR size: ${qrSizeSelect.value} · ${APP_VERSION}`);
    resetGenerateButton();
    await autoRenderIfReady();
  });

  qrOffsetX.addEventListener("input", async () => {
    syncOffsetLabels();
    resetGenerateButton();
    await autoRenderIfReady();
  });

  qrOffsetY.addEventListener("input", async () => {
    syncOffsetLabels();
    resetGenerateButton();
    await autoRenderIfReady();
  });

  maskScale.addEventListener("input", async () => {
    syncMaskScaleLabel();
    resetGenerateButton();
    await autoRenderIfReady();
  });

  maskPadding.addEventListener("input", async () => {
    syncMaskPaddingLabel();
    resetGenerateButton();
    await autoRenderIfReady();
  });

  if (invertMask) {
    invertMask.addEventListener("change", async () => {
      resetGenerateButton();
      await autoRenderIfReady();
    });
  }

  nudgeUp.addEventListener("click", () => nudge(0, -NUDGE_STEP_SMALL));
  nudgeRight.addEventListener("click", () => nudge(NUDGE_STEP_SMALL, 0));
  nudgeDown.addEventListener("click", () => nudge(0, NUDGE_STEP_SMALL));
  nudgeLeft.addEventListener("click", () => nudge(-NUDGE_STEP_SMALL, 0));

  if (nudgeUpMedium) nudgeUpMedium.addEventListener("click", () => nudge(0, -NUDGE_STEP_MEDIUM));
  if (nudgeRightMedium) nudgeRightMedium.addEventListener("click", () => nudge(NUDGE_STEP_MEDIUM, 0));
  if (nudgeDownMedium) nudgeDownMedium.addEventListener("click", () => nudge(0, NUDGE_STEP_MEDIUM));
  if (nudgeLeftMedium) nudgeLeftMedium.addEventListener("click", () => nudge(-NUDGE_STEP_MEDIUM, 0));

  if (nudgeUpLarge) nudgeUpLarge.addEventListener("click", () => nudge(0, -NUDGE_STEP_LARGE));
  if (nudgeRightLarge) nudgeRightLarge.addEventListener("click", () => nudge(NUDGE_STEP_LARGE, 0));
  if (nudgeDownLarge) nudgeDownLarge.addEventListener("click", () => nudge(0, NUDGE_STEP_LARGE));
  if (nudgeLeftLarge) nudgeLeftLarge.addEventListener("click", () => nudge(-NUDGE_STEP_LARGE, 0));

  resetPositionBtn.addEventListener("click", resetPosition);

  foregroundColor.addEventListener("input", async () => {
    updateContrastWarning();
    resetGenerateButton();
    if (state.hasRenderedOnce && outputCanvas.width) {
      applyCurrentColorsToOutput();
      await autoRenderIfReady();
    }
  });

  backgroundColor.addEventListener("input", async () => {
    updateContrastWarning();
    resetGenerateButton();
    if (state.hasRenderedOnce && outputCanvas.width) {
      applyCurrentColorsToOutput();
      await autoRenderIfReady();
    }
  });

  transparentBackground.addEventListener("change", async () => {
    updateContrastWarning();
    resetGenerateButton();
    if (state.hasRenderedOnce && outputCanvas.width) {
      applyCurrentColorsToOutput();
      await autoRenderIfReady();
    }
  });

  if (samplesGrid) {
    samplesGrid.addEventListener("click", async (e) => {
      const card = e.target.closest(".sample-card");
      if (!card) return;

      const sampleKey = card.dataset.sample;
      if (!sampleKey) return;

      await showSamplePreview(sampleKey);
    });
  }

  if (presetShapesGrid) {
    presetShapesGrid.addEventListener("click", async (e) => {
      const card = e.target.closest(".preset-shape-card");
      if (!card) return;

      const maskKey = card.dataset.mask;
      if (!maskKey) return;

      await handlePresetShapeSelection(maskKey);
    });
  }

  syncPresetShapeSelectionUI();
}

init();
