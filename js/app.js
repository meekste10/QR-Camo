const APP_VERSION = "v0.6.3";

import { state } from "./state.js?v=0.6.3";
import {
  imageDataToCanvas,
  normalizeQrImageData,
  cropQrInterior,
  cropQrInteriorFromTrimmed
} from "./qr-preprocess.js?v=0.6.3";
import { extractTiles } from "./tile-engine.js?v=0.6.3";
import {
  maskPresets,
  presetShapeCategories
} from "./presets.js?v=0.6.3";
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
const loadingOverlay = document.getElementById("loadingOverlay");

const qrTextInput = document.getElementById("qrTextInput");
const makeQrBtn = document.getElementById("makeQrBtn");
const qrUpload = document.getElementById("qrUpload");

const maskSelect = document.getElementById("maskSelect");
const customMaskUpload = document.getElementById("customMaskUpload");

const qrSizeSelect = document.getElementById("qrSizeSelect");
const maskScale = document.getElementById("maskScale");
const maskScaleText = document.getElementById("maskScaleText");
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
const previewStepSection = document.getElementById("previewStepSection");
const samplesStepSection = document.getElementById("samplesStepSection");

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

const DEFAULT_QR_SIZE = "xxsmall";
const DEFAULT_QR_TEXT = "https://example.com";
const DEFAULT_BLEND_TIGHTNESS = 50;
const DEFAULT_MASK_SCALE = 100;
const DEFAULT_MASK_PADDING = 0;
const DEFAULT_BLOCK_MODULES = 2;
const DEFAULT_UPLOAD_BLOCK_MODULES = 3;
const DEFAULT_UPLOAD_THRESHOLD = 145;

const SAMPLE_BASE = "./assets/Samples/";

let nudgeCount = 0;
let renderCount = 0;
let renderTimer = null;
let isRendering = false;

function track(eventName, props = {}) {
  const payload = {
    event: eventName,
    ts: new Date().toISOString(),
    appVersion: APP_VERSION,
    ...props
  };

  console.log("[QR CAMO TRACK]", payload);
}

function setLoading(on) {
  if (loadingOverlay) {
    loadingOverlay.classList.toggle("hidden", !on);
  }
  document.body.style.overflow = on ? "hidden" : "";
}

function scheduleAutoRender(delay = 90) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(async () => {
    renderTimer = null;
    await autoRenderIfReady();
  }, delay);
}

function currentTrackingProps() {
  return {
    qrSize: qrSizeSelect?.value || null,
    moduleCount: state.moduleCount || null,
    tileCount: state.textureTiles?.length || 0,
    hasCustomMask: !!state.customMaskImage,
    selectedMask: maskSelect?.value || null,
    invertMask: !!invertMask?.checked,
    maskScale: Number(maskScale?.value || 0),
    maskPadding: Number(maskPadding?.value || 0),
    offsetX: Number(qrOffsetX?.value || 0),
    offsetY: Number(qrOffsetY?.value || 0),
    nudgeCount,
    renderCount,
    foregroundColor: foregroundColor?.value || null,
    backgroundColor: backgroundColor?.value || null,
    transparentBackground: !!transparentBackground?.checked,
    hasQrText: !!(qrTextInput?.value || "").trim(),
    hasQrUpload: !!qrUpload?.files?.[0]
  };
}

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

function setStepVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
  el.classList.toggle("is-locked", !visible);
}

function unlockWorkflowAfterShape() {
  setStepVisible(previewStepSection, true);
  setStepVisible(samplesStepSection, true);
}

function lockWorkflowUntilShape() {
  setStepVisible(previewStepSection, false);
  setStepVisible(samplesStepSection, false);
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
  if (qrOffsetXLabel && qrOffsetX) qrOffsetXLabel.textContent = String(qrOffsetX.value);
  if (qrOffsetYLabel && qrOffsetY) qrOffsetYLabel.textContent = String(qrOffsetY.value);
}

function syncMaskScaleLabel() {
  if (maskScaleLabel && maskScale) maskScaleLabel.textContent = String(maskScale.value);
  if (maskScaleText && maskScale) maskScaleText.value = String(maskScale.value);
}

function syncMaskPaddingLabel() {
  if (maskPaddingLabel && maskPadding) {
    maskPaddingLabel.textContent = String(maskPadding.value);
  }
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
  if (!contrastWarning || !foregroundColor || !backgroundColor || !transparentBackground) return;

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
  if (!outputCanvas || !foregroundColor || !backgroundColor || !transparentBackground) return;
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
  if (!generateBtn) return;
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

function setCreatedState() {
  if (generateBtn) {
    generateBtn.textContent = "Created";
    generateBtn.classList.remove("btn-primary");
    generateBtn.classList.add("btn-secondary");
    generateBtn.disabled = true;
  }

  if (makeQrBtn) {
    makeQrBtn.textContent = "Created";
    makeQrBtn.classList.remove("btn-primary");
    makeQrBtn.classList.add("btn-secondary");
    makeQrBtn.disabled = true;
  }
}

function syncPresetShapeSelectionUI() {
  if (!presetShapesGrid || !maskSelect) return;

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

  updatePreviewFlags({
    hasSource: false,
    hasOutput: false
  });
}

function resetAll() {
  if (qrTextInput) qrTextInput.value = DEFAULT_QR_TEXT;
  if (qrUpload) qrUpload.value = "";
  if (customMaskUpload) customMaskUpload.value = "";

  if (maskSelect) maskSelect.value = "";
  if (qrSizeSelect) qrSizeSelect.value = DEFAULT_QR_SIZE;
  if (maskScale) maskScale.value = String(DEFAULT_MASK_SCALE);
  if (maskScaleText) maskScaleText.value = String(DEFAULT_MASK_SCALE);
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

  nudgeCount = 0;
  renderCount = 0;
  clearTimeout(renderTimer);
  renderTimer = null;
  isRendering = false;

  syncOffsetLabels();
  syncMaskScaleLabel();
  syncMaskPaddingLabel();
  updateContrastWarning();

  clearCanvas(sourcePreviewCanvas);
  clearCanvas(outputCanvas);

  show(qrReadyBadge, false);
  show(shapeReadyBadge, false);

  updatePreviewFlags({ hasSource: false, hasOutput: false });
  lockWorkflowUntilShape();

  setPreviewMeta(`Choose a shape to begin · ${APP_VERSION}`);
  setSourceMeta("waiting for shape");

  resetCreateButton();
  resetGenerateButton();
  setLoading(false);

  track("reset_all");
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

  track("qr_generated_from_text", {
    textLength: text?.length || 0,
    moduleCount: generated.moduleCount,
    tileCount: tiles.length
  });
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

  track("qr_upload_processed", {
    fileName: file?.name || null,
    moduleCount: normalized.moduleCount,
    tileCount: tiles.length,
    uploadTilePx
  });
}

function buildCurrentMaskFromUploaded() {
  if (!state.customMaskImage) return null;

  const maskCanvas = buildMaskFromImage(state.customMaskImage, {
    size: 800,
    targetFill: 0.9,
    threshold: 180,
    removeDetectedBackground: true,
    backgroundTolerance: 52,
    forceBackgroundToWhite: true
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

  presetShapeCategories.forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.category;

    group.shapes.forEach((shape) => {
      const option = document.createElement("option");
      option.value = shape.key;
      option.textContent = shape.label;
      optgroup.appendChild(option);
    });

    maskSelect.appendChild(optgroup);
  });
}

function populatePresetShapeCards() {
  if (!presetShapesGrid) return;

  presetShapesGrid.innerHTML = "";

  presetShapeCategories.forEach((group) => {
    const section = document.createElement("section");
    section.className = "preset-category-section";

    const heading = document.createElement("div");
    heading.className = "preset-category-title";
    heading.textContent = group.category;

    const row = document.createElement("div");
    row.className = "preset-category-row";

    group.shapes.forEach((shape) => {
      const button = document.createElement("button");
      button.className = "sample-card preset-shape-card";
      button.type = "button";
      button.dataset.mask = shape.key;

      button.innerHTML = `
        <img src="${shape.src}" alt="${shape.label} shape" />
        <span>${shape.label}</span>
      `;

      row.appendChild(button);
    });

    section.appendChild(heading);
    section.appendChild(row);
    presetShapesGrid.appendChild(section);
  });
}

async function ensureQrPrepared() {
  if (state.sourceQrCanvas && state.textureTiles?.length) return true;

  const uploadedFile = qrUpload?.files?.[0];
  if (uploadedFile) {
    await handleQrUpload(uploadedFile);
    return true;
  }

  let text = (qrTextInput?.value || "").trim();
  if (!text) {
    text = DEFAULT_QR_TEXT;
    if (qrTextInput) qrTextInput.value = text;
  }

  await buildQrFromText(text);
  return true;
}

async function renderOutput() {
  setLoading(true);

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    if (!state.sourceQrCanvas || !state.textureTiles?.length) {
      setDebug("Create or upload a QR first.");
      return false;
    }

    let maskSource = null;

    if (state.customMaskImage) {
      maskSource = buildCurrentMaskFromUploaded();
    } else {
      const selectedMask = maskSelect?.value;
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
      qrSize: qrSizeSelect?.value || DEFAULT_QR_SIZE,
      qrOffsetX: Number(qrOffsetX?.value || 0),
      qrOffsetY: Number(qrOffsetY?.value || 0),
      blendTightness: DEFAULT_BLEND_TIGHTNESS,
      maskScale: Number(maskScale?.value || DEFAULT_MASK_SCALE),
      maskPadding: Number(maskPadding?.value || DEFAULT_MASK_PADDING),
      invertMask: !!invertMask?.checked,
      blockModules: state.blockModules || DEFAULT_BLOCK_MODULES
    });

    applyCurrentColorsToOutput();
    clearCanvas(sourcePreviewCanvas);
    updatePreviewFlags({ hasSource: false, hasOutput: true });

    state.hasRenderedOnce = true;
    renderCount += 1;

    setPreviewMeta(`QR-Camo ready · ${APP_VERSION} · tiles ${state.textureTiles.length}`);
    track("render_success", currentTrackingProps());
    setDebug(`Render complete · ${APP_VERSION}`);
    return true;
  } catch (err) {
    console.error(err);
    track("render_failed", {
      ...currentTrackingProps(),
      message: err.message
    });
    setDebug(`Render failed: ${err.message}`);
    return false;
  } finally {
    setLoading(false);
  }
}

async function createQrCamo() {
  if (isRendering) return false;

  track("generate_clicked", currentTrackingProps());

  const okQr = await ensureQrPrepared();
  if (!okQr) return false;

  isRendering = true;
  try {
    const okRender = await renderOutput();
    if (!okRender) return false;
    setCreatedState();
    return true;
  } finally {
    isRendering = false;
  }
}

async function autoRenderIfReady() {
  if (!state.hasRenderedOnce) return;
  if (!state.sourceQrCanvas || !state.textureTiles?.length) return;
  if (isRendering) return;

  resetGenerateButton();

  isRendering = true;
  try {
    const ok = await renderOutput();
    if (!ok) return;
    setCreatedState();
  } finally {
    isRendering = false;
  }
}

async function ensurePreviewFlowAfterShapeSelection() {
  unlockWorkflowAfterShape();
  await ensureQrPrepared();
  await createQrCamo();
}

function nudge(dx, dy) {
  nudgeCount += 1;

  if (qrOffsetX) {
    qrOffsetX.value = String(clamp(Number(qrOffsetX.value || 0) + dx, -PAN_LIMIT, PAN_LIMIT));
  }
  if (qrOffsetY) {
    qrOffsetY.value = String(clamp(Number(qrOffsetY.value || 0) + dy, -PAN_LIMIT, PAN_LIMIT));
  }

  syncOffsetLabels();

  track("nudge_applied", {
    dx,
    dy,
    offsetX: Number(qrOffsetX?.value || 0),
    offsetY: Number(qrOffsetY?.value || 0),
    nudgeCount
  });

  scheduleAutoRender(30);
}

function resetPosition() {
  if (qrOffsetX) qrOffsetX.value = "0";
  if (qrOffsetY) qrOffsetY.value = "0";
  syncOffsetLabels();

  track("position_reset");
  scheduleAutoRender(30);
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
  track("preset_shape_selected", { shape: maskKey });
  setDebug(`Preset shape selected · ${APP_VERSION}`);

  await ensurePreviewFlowAfterShapeSelection();
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

    track("sample_preview_loaded", {
      sample: sampleKey,
      src
    });

    setDebug(`Loaded sample preview · ${APP_VERSION}`);
  } catch (err) {
    console.error(err);
    track("sample_load_failed", {
      sample: sampleKey,
      message: err.message
    });
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
  populatePresetShapeCards();
  initSampleCardImages();

  if (qrTextInput && !qrTextInput.value.trim()) {
    qrTextInput.value = DEFAULT_QR_TEXT;
  }

  if (qrSizeSelect) {
    qrSizeSelect.value = DEFAULT_QR_SIZE;
  }

  if (maskScale) {
    maskScale.value = String(DEFAULT_MASK_SCALE);
  }

  if (maskScaleText) {
    maskScaleText.value = String(DEFAULT_MASK_SCALE);
  }

  syncOffsetLabels();
  syncMaskScaleLabel();
  syncMaskPaddingLabel();
  syncPresetShapeSelectionUI();
  updateContrastWarning();
  updatePreviewFlags({ hasSource: false, hasOutput: false });
  lockWorkflowUntilShape();

  setPreviewMeta(`Choose a shape to begin · ${APP_VERSION}`);
  setSourceMeta("waiting for shape");
  setDebug(`Ready · ${APP_VERSION}`);

  track("app_loaded", {
    userAgent: navigator.userAgent
  });

  if (makeQrBtn) {
    makeQrBtn.addEventListener("click", async () => {
      await createQrCamo();
    });
  }

  if (qrTextInput) {
  qrTextInput.addEventListener("focus", () => {
    if (qrTextInput.value.trim() === DEFAULT_QR_TEXT) {
      qrTextInput.select();
    }
  });

  qrTextInput.addEventListener("input", () => {
    if (qrUpload) qrUpload.value = "";

    resetCreateButton();
    resetGenerateButton();

    state.sourceQrCanvas = null;
    state.overlayQrCanvas = null;
    state.textureTiles = [];
    state.moduleCount = 21;
    state.modulePixelSize = 1;
    state.blockModules = 2;
    state.hasRenderedOnce = false;

    clearCanvas(sourcePreviewCanvas);
    clearCanvas(outputCanvas);
    updatePreviewFlags({ hasSource: false, hasOutput: false });

    track("qr_text_changed", {
      textLength: (qrTextInput.value || "").trim().length
    });

    setPreviewMeta(`Link updated · regenerating… · ${APP_VERSION}`);

    if (maskSelect?.value || state.customMaskImage) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(async () => {
        await createQrCamo();
      }, 350);
    }
  });

  qrTextInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    clearTimeout(renderTimer);
    await createQrCamo();
  });

  qrTextInput.addEventListener("blur", () => {
    const value = qrTextInput.value.trim();
    if (!value) {
      qrTextInput.value = DEFAULT_QR_TEXT;
    }
  });
}

  if (qrUpload) {
    qrUpload.addEventListener("change", async () => {
      const file = qrUpload?.files?.[0] || null;

      track("qr_upload_selected", {
        fileName: file?.name || null
      });

      resetCreateButton();
      resetGenerateButton();
      resetQrPreparedState();

      if (maskSelect?.value || state.customMaskImage) {
        unlockWorkflowAfterShape();
        await ensurePreviewFlowAfterShapeSelection();
      }
    });
  }

  if (customMaskUpload) {
    customMaskUpload.addEventListener("change", async (e) => {
      try {
        const file = e.target.files?.[0];
        if (!file) return;

        track("custom_shape_upload_started", {
          fileName: file.name
        });

        state.customMaskImage = await loadImageFromFile(file);
        state.customMaskCanvas = null;

        if (maskSelect) maskSelect.value = "";
        syncPresetShapeSelectionUI();

        show(shapeReadyBadge, true);
        resetGenerateButton();

        track("custom_shape_upload_success", {
          fileName: file.name
        });

        setDebug(`Custom shape uploaded · ${APP_VERSION}`);

        await ensurePreviewFlowAfterShapeSelection();
      } catch (err) {
        console.error(err);
        track("custom_shape_upload_failed", {
          message: err.message
        });
        setDebug(`Shape upload failed: ${err.message}`);
      }
    });
  }

  if (maskSelect) {
    maskSelect.addEventListener("change", async () => {
      syncPresetShapeSelectionUI();
      resetGenerateButton();

      if (maskSelect.value) {
        await handlePresetShapeSelection(maskSelect.value);
      }
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener("click", async () => {
      await createQrCamo();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", resetAll);
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      try {
        if (!outputCanvas || !outputCanvas.width || !outputCanvas.height) {
          track("export_blocked_no_output");
          setDebug("Generate a QR-Camo first.");
          return;
        }

        exportPNG(outputCanvas);

        track("export_success", currentTrackingProps());
        setDebug(`Exported PNG · ${APP_VERSION}`);
      } catch (err) {
        console.error(err);
        track("export_failed", {
          ...currentTrackingProps(),
          message: err.message
        });
        setDebug(`Export failed: ${err.message}`);
      }
    });
  }

  if (qrSizeSelect) {
    qrSizeSelect.addEventListener("change", () => {
      track("qr_size_changed", {
        qrSize: qrSizeSelect.value
      });
      setDebug(`QR size: ${qrSizeSelect.value} · ${APP_VERSION}`);
      resetGenerateButton();
      scheduleAutoRender();
    });
  }

  if (qrOffsetX) {
    qrOffsetX.addEventListener("input", () => {
      syncOffsetLabels();
      resetGenerateButton();
      scheduleAutoRender(30);
    });
  }

  if (qrOffsetY) {
    qrOffsetY.addEventListener("input", () => {
      syncOffsetLabels();
      resetGenerateButton();
      scheduleAutoRender(30);
    });
  }

  if (maskScale) {
    maskScale.addEventListener("input", () => {
      syncMaskScaleLabel();
      track("mask_scale_changed", {
        value: Number(maskScale.value || 0)
      });
      resetGenerateButton();
      scheduleAutoRender();
    });
  }

  if (maskScaleText) {
    maskScaleText.addEventListener("input", () => {
      let next = Number(maskScaleText.value || DEFAULT_MASK_SCALE);
      if (!Number.isFinite(next)) return;

      next = Math.max(100, Math.min(250, next));

      if (maskScale) {
        maskScale.value = String(next);
      }

      syncMaskScaleLabel();
      track("mask_scale_changed", {
        value: next
      });
      resetGenerateButton();
      scheduleAutoRender();
    });
  }

  if (maskPadding) {
    maskPadding.addEventListener("input", () => {
      syncMaskPaddingLabel();
      track("mask_padding_changed", {
        value: Number(maskPadding.value || 0)
      });
      resetGenerateButton();
      scheduleAutoRender();
    });
  }

  if (invertMask) {
    invertMask.addEventListener("change", () => {
      track("invert_mask_toggled", {
        value: !!invertMask.checked
      });
      resetGenerateButton();
      scheduleAutoRender();
    });
  }

  if (nudgeUp) nudgeUp.addEventListener("click", () => nudge(0, -NUDGE_STEP_SMALL));
  if (nudgeRight) nudgeRight.addEventListener("click", () => nudge(NUDGE_STEP_SMALL, 0));
  if (nudgeDown) nudgeDown.addEventListener("click", () => nudge(0, NUDGE_STEP_SMALL));
  if (nudgeLeft) nudgeLeft.addEventListener("click", () => nudge(-NUDGE_STEP_SMALL, 0));

  if (nudgeUpMedium) nudgeUpMedium.addEventListener("click", () => nudge(0, -NUDGE_STEP_MEDIUM));
  if (nudgeRightMedium) nudgeRightMedium.addEventListener("click", () => nudge(NUDGE_STEP_MEDIUM, 0));
  if (nudgeDownMedium) nudgeDownMedium.addEventListener("click", () => nudge(0, NUDGE_STEP_MEDIUM));
  if (nudgeLeftMedium) nudgeLeftMedium.addEventListener("click", () => nudge(-NUDGE_STEP_MEDIUM, 0));

  if (nudgeUpLarge) nudgeUpLarge.addEventListener("click", () => nudge(0, -NUDGE_STEP_LARGE));
  if (nudgeRightLarge) nudgeRightLarge.addEventListener("click", () => nudge(NUDGE_STEP_LARGE, 0));
  if (nudgeDownLarge) nudgeDownLarge.addEventListener("click", () => nudge(0, NUDGE_STEP_LARGE));
  if (nudgeLeftLarge) nudgeLeftLarge.addEventListener("click", () => nudge(-NUDGE_STEP_LARGE, 0));

  if (resetPositionBtn) {
    resetPositionBtn.addEventListener("click", resetPosition);
  }

  if (foregroundColor) {
    foregroundColor.addEventListener("input", () => {
      track("foreground_color_changed", {
        value: foregroundColor.value
      });
      updateContrastWarning();
      resetGenerateButton();
      if (state.hasRenderedOnce && outputCanvas?.width) {
        applyCurrentColorsToOutput();
      }
    });
  }

  if (backgroundColor) {
    backgroundColor.addEventListener("input", () => {
      track("background_color_changed", {
        value: backgroundColor.value
      });
      updateContrastWarning();
      resetGenerateButton();
      if (state.hasRenderedOnce && outputCanvas?.width) {
        applyCurrentColorsToOutput();
      }
    });
  }

  if (transparentBackground) {
    transparentBackground.addEventListener("change", () => {
      track("transparent_background_toggled", {
        value: !!transparentBackground.checked
      });
      updateContrastWarning();
      resetGenerateButton();
      if (state.hasRenderedOnce && outputCanvas?.width) {
        applyCurrentColorsToOutput();
      }
    });
  }

  if (samplesGrid) {
    samplesGrid.addEventListener("click", async (e) => {
      const card = e.target.closest(".sample-card");
      if (!card) return;

      const sampleKey = card.dataset.sample;
      if (!sampleKey) return;

      track("sample_clicked", {
        sample: sampleKey
      });

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
