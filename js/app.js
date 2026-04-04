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
import {
  buildMaskCanvas,
  renderStapledBase,
  drawMultipleQrOverlays,
  createAutoQrChannels
} from "./render-engine.js?v=0.6.3";
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
const invertMask = document.getElementById("invertMask");

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

/* Optional future UI hooks */
const selectedChannelSelect = document.getElementById("selectedChannelSelect");
const channelControlsWrap = document.getElementById("channelControls");

/* -----------------------------
   STATE BOOTSTRAP
----------------------------- */

state.customMaskImage = null;
state.customMaskCanvas = null;

state.sourceQrCanvas = null;
state.overlayQrCanvas = null;
state.normalizedQrCanvas = null;
state.interiorCanvas = null;

state.textureTiles = [];
state.moduleCount = 21;
state.modulePixelSize = 1;
state.blockModules = 2;
state.hasRenderedOnce = false;

state.stapledBaseCanvas = null;
state.currentMaskCanvas = null;
state.lastBaseSignature = null;

state.selectedChannelId = 1;
state.defaultChannelSize = "xxsmall";
state.qrChannels = [
  { id: 1, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0, qrDisplaySize: 0, moduleDisplaySize: 0 },
  { id: 2, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0, qrDisplaySize: 0, moduleDisplaySize: 0 },
  { id: 3, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0, qrDisplaySize: 0, moduleDisplaySize: 0 },
  { id: 4, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0, qrDisplaySize: 0, moduleDisplaySize: 0 },
  { id: 5, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0, qrDisplaySize: 0, moduleDisplaySize: 0 }
];

const NUDGE_STEP = 8;
const PAN_LIMIT = 360;

const DEFAULT_QR_SIZE = "xxsmall";
const DEFAULT_QR_TEXT = "";
const DEFAULT_BLEND_TIGHTNESS = 50;
const DEFAULT_MASK_SCALE = 100;
const DEFAULT_BLOCK_MODULES = 2;
const DEFAULT_UPLOAD_BLOCK_MODULES = 3;
const DEFAULT_UPLOAD_THRESHOLD = 145;
const DEFAULT_CHANNEL_COUNT = 5;
const DEFAULT_CHANNEL_SPACING = 24;

const SAMPLE_BASE = "./assets/Samples/";

let nudgeCount = 0;
let renderCount = 0;
let renderTimer = null;
let isRendering = false;

/* -----------------------------
   TRACKING / UI HELPERS
----------------------------- */

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

function hasRealQrInput() {
  return !!(state.sourceQrCanvas && state.textureTiles?.length);
}

function hasRealShapeInput() {
  return !!(state.customMaskImage || (maskSelect?.value && maskPresets[maskSelect.value]));
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
    selectedChannelId: state.selectedChannelId,
    enabledChannels: state.qrChannels.filter((c) => c.enabled).length,
    channels: state.qrChannels.map((c) => ({
      id: c.id,
      enabled: c.enabled,
      size: c.size,
      x: c.x,
      y: c.y
    })),
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

function unlockWorkflowAfterBothReady() {
  const ready = hasRealQrInput() && hasRealShapeInput();
  setStepVisible(previewStepSection, ready);
  setStepVisible(samplesStepSection, ready);
}

function lockWorkflowUntilReady() {
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
  const selected = getSelectedChannel();
  const x = selected ? selected.x : 0;
  const y = selected ? selected.y : 0;

  if (qrOffsetXLabel) qrOffsetXLabel.textContent = String(x);
  if (qrOffsetYLabel) qrOffsetYLabel.textContent = String(y);
  if (qrOffsetX) qrOffsetX.value = String(x);
  if (qrOffsetY) qrOffsetY.value = String(y);
}

function syncMaskScaleLabel() {
  if (maskScaleLabel && maskScale) maskScaleLabel.textContent = String(maskScale.value);
  if (maskScaleText && maskScale) maskScaleText.value = String(maskScale.value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* -----------------------------
   COLOR / CONTRAST
----------------------------- */

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

/* -----------------------------
   GENERAL CANVAS HELPERS
----------------------------- */

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

function clearCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* -----------------------------
   BUTTON / UI STATE
----------------------------- */

function resetGenerateButton() {
  if (!generateBtn) return;
  generateBtn.textContent = "Create QR-Camo";
  generateBtn.classList.remove("btn-secondary");
  generateBtn.classList.add("btn-primary");
  generateBtn.disabled = false;
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

/* -----------------------------
   CHANNEL HELPERS
----------------------------- */

function resetQrChannels(size = DEFAULT_QR_SIZE) {
  state.defaultChannelSize = size;
  state.selectedChannelId = 1;
  state.qrChannels = Array.from({ length: DEFAULT_CHANNEL_COUNT }, (_, index) => ({
    id: index + 1,
    enabled: true,
    size,
    x: 0,
    y: 0,
    autoX: 0,
    autoY: 0,
    fitScore: 0,
    cornersFit: 0,
    overlapRisk: 0,
    qrDisplaySize: 0,
    moduleDisplaySize: 0
  }));
  syncSelectedChannelUI();
}

function getSelectedChannel() {
  return state.qrChannels.find((c) => c.id === state.selectedChannelId) || state.qrChannels[0] || null;
}

function setSelectedChannel(channelId) {
  const id = Number(channelId);
  if (!Number.isFinite(id)) return;
  state.selectedChannelId = id;
  syncSelectedChannelUI();
}

function updateChannelById(channelId, patch = {}) {
  const idx = state.qrChannels.findIndex((c) => c.id === channelId);
  if (idx === -1) return;
  state.qrChannels[idx] = {
    ...state.qrChannels[idx],
    ...patch
  };
  syncSelectedChannelUI();
}

function syncSelectedChannelUI() {
  syncOffsetLabels();

  if (selectedChannelSelect) {
    selectedChannelSelect.value = String(state.selectedChannelId);
  }

  if (!channelControlsWrap) return;

  const rows = channelControlsWrap.querySelectorAll("[data-channel-id]");
  rows.forEach((row) => {
    const id = Number(row.dataset.channelId);
    const channel = state.qrChannels.find((c) => c.id === id);
    if (!channel) return;

    row.classList.toggle("is-selected", id === state.selectedChannelId);

    const toggle = row.querySelector("[data-role='toggle']");
    const size = row.querySelector("[data-role='size']");
    const meta = row.querySelector("[data-role='meta']");

    if (toggle) toggle.checked = !!channel.enabled;
    if (size) size.value = channel.size || DEFAULT_QR_SIZE;
    if (meta) {
      meta.textContent = `Fit ${Math.round(channel.fitScore || 0)} · corners ${channel.cornersFit || 0}`;
    }
  });
}

function buildChannelControlsUI() {
  if (!channelControlsWrap) return;

  channelControlsWrap.innerHTML = "";

  state.qrChannels.forEach((channel) => {
    const row = document.createElement("div");
    row.className = "channel-row";
    row.dataset.channelId = String(channel.id);

    row.innerHTML = `
      <div class="channel-row-top">
        <button type="button" class="channel-select-btn" data-role="select">QR ${channel.id}</button>
        <label class="checkbox-row">
          <input type="checkbox" data-role="toggle" ${channel.enabled ? "checked" : ""} />
          <span>On</span>
        </label>
      </div>
      <select class="select-input" data-role="size">
        <option value="xxxxsmall"${channel.size === "xxxxsmall" ? " selected" : ""}>XXXXS</option>
        <option value="xxxsmall"${channel.size === "xxxsmall" ? " selected" : ""}>XXXS</option>
        <option value="xxsmall"${channel.size === "xxsmall" ? " selected" : ""}>XXS</option>
        <option value="xsmall"${channel.size === "xsmall" ? " selected" : ""}>XS</option>
        <option value="small"${channel.size === "small" ? " selected" : ""}>S</option>
        <option value="medium"${channel.size === "medium" ? " selected" : ""}>M</option>
        <option value="large"${channel.size === "large" ? " selected" : ""}>L</option>
      </select>
      <div class="helper" data-role="meta"></div>
    `;

    channelControlsWrap.appendChild(row);
  });

  channelControlsWrap.addEventListener("click", (e) => {
    const row = e.target.closest("[data-channel-id]");
    if (!row) return;

    const id = Number(row.dataset.channelId);
    const selectBtn = e.target.closest("[data-role='select']");
    if (!selectBtn) return;

    setSelectedChannel(id);
  });

  channelControlsWrap.addEventListener("change", async (e) => {
    const row = e.target.closest("[data-channel-id]");
    if (!row) return;

    const id = Number(row.dataset.channelId);
    const toggle = e.target.closest("[data-role='toggle']");
    const size = e.target.closest("[data-role='size']");

    if (toggle) {
      updateChannelById(id, { enabled: !!toggle.checked });
      track("channel_toggled", { channelId: id, enabled: !!toggle.checked });
      resetGenerateButton();
      if (state.hasRenderedOnce) redrawChannelsOnly();
      return;
    }

    if (size) {
      updateChannelById(id, {
        size: size.value,
        qrDisplaySize: 0,
        moduleDisplaySize: 0
      });
      track("channel_size_changed", { channelId: id, size: size.value });
      resetGenerateButton();
      if (state.hasRenderedOnce) redrawChannelsOnly();
    }
  });

  syncSelectedChannelUI();
}

function populateSelectedChannelSelect() {
  if (!selectedChannelSelect) return;

  selectedChannelSelect.innerHTML = "";
  state.qrChannels.forEach((channel) => {
    const option = document.createElement("option");
    option.value = String(channel.id);
    option.textContent = `QR ${channel.id}`;
    selectedChannelSelect.appendChild(option);
  });

  selectedChannelSelect.value = String(state.selectedChannelId);
}

/* -----------------------------
   CACHE HELPERS
----------------------------- */

function clearLayerCache() {
  state.stapledBaseCanvas = null;
  state.currentMaskCanvas = null;
  state.lastBaseSignature = null;
}

function clearQrPreparedState() {
  state.sourceQrCanvas = null;
  state.overlayQrCanvas = null;
  state.normalizedQrCanvas = null;
  state.interiorCanvas = null;
  state.textureTiles = [];
  state.moduleCount = 21;
  state.modulePixelSize = 1;
  state.blockModules = 2;
  state.hasRenderedOnce = false;

  resetQrChannels(qrSizeSelect?.value || DEFAULT_QR_SIZE);
  clearLayerCache();

  clearCanvas(sourcePreviewCanvas);
  clearCanvas(outputCanvas);
  show(qrReadyBadge, false);

  updatePreviewFlags({
    hasSource: false,
    hasOutput: false
  });

  lockWorkflowUntilReady();
}

function getBaseSignature(maskSource) {
  return JSON.stringify({
    hasCustomMask: !!state.customMaskImage,
    selectedMask: maskSelect?.value || "",
    qrModuleCount: state.moduleCount || 21,
    tileCount: state.textureTiles?.length || 0,
    invertMask: !!invertMask?.checked,
    maskScale: Number(maskScale?.value || 0),
    blockModules: state.blockModules || DEFAULT_BLOCK_MODULES,
    maskW: maskSource?.width || 0,
    maskH: maskSource?.height || 0
  });
}

async function getMaskSource() {
  if (state.customMaskImage) {
    return buildCurrentMaskFromUploaded();
  }

  const selectedMask = maskSelect?.value;
  if (!selectedMask || !maskPresets[selectedMask]) {
    throw new Error("No valid preset shape selected");
  }

  const loaded = await loadMask(maskPresets[selectedMask]);
  show(shapeReadyBadge, true);
  return loaded;
}

async function rebuildStapledBaseIfNeeded() {
  const maskSource = await getMaskSource();
  const signature = getBaseSignature(maskSource);

  if (
    state.stapledBaseCanvas &&
    state.currentMaskCanvas &&
    state.lastBaseSignature === signature
  ) {
    return;
  }

  state.currentMaskCanvas = buildMaskCanvas({
    maskImg: maskSource,
    outputSize: 800,
    maskScale: Number(maskScale?.value || DEFAULT_MASK_SCALE),
    maskPadding: 0,
    invertMask: !!invertMask?.checked
  });

  state.stapledBaseCanvas = renderStapledBase({
    tiles: state.textureTiles,
    maskCanvas: state.currentMaskCanvas,
    outputSize: 800,
    blendTightness: DEFAULT_BLEND_TIGHTNESS,
    blockModules: state.blockModules || DEFAULT_BLOCK_MODULES
  });

  state.lastBaseSignature = signature;
}

function regenerateAutoChannels() {
  if (!state.currentMaskCanvas || !state.moduleCount) return;

  const defaultSize = qrSizeSelect?.value || state.defaultChannelSize || DEFAULT_QR_SIZE;

  const generated = createAutoQrChannels({
    maskCanvas: state.currentMaskCanvas,
    moduleCount: state.moduleCount,
    qrSize: defaultSize,
    channelCount: DEFAULT_CHANNEL_COUNT,
    minSpacing: DEFAULT_CHANNEL_SPACING,
    outputSize: 800
  });

  if (!generated.length) return;

  const byId = new Map(state.qrChannels.map((c) => [c.id, c]));

  state.qrChannels = generated.map((auto) => {
    const existing = byId.get(auto.id);
    return {
      ...auto,
      enabled: existing ? existing.enabled : true,
      size: existing ? existing.size : defaultSize,
      x: existing ? existing.x : 0,
      y: existing ? existing.y : 0,
      qrDisplaySize: existing && existing.size === auto.size ? (existing.qrDisplaySize || auto.qrDisplaySize) : auto.qrDisplaySize,
      moduleDisplaySize: existing && existing.size === auto.size ? (existing.moduleDisplaySize || auto.moduleDisplaySize) : auto.moduleDisplaySize
    };
  });

  populateSelectedChannelSelect();
  buildChannelControlsUI();
  syncSelectedChannelUI();
}

function redrawChannelsOnly() {
  if (!state.stapledBaseCanvas || !state.currentMaskCanvas || !state.sourceQrCanvas) return;

  outputCanvas.width = 800;
  outputCanvas.height = 800;

  drawMultipleQrOverlays({
    baseCanvas: state.stapledBaseCanvas,
    maskCanvas: state.currentMaskCanvas,
    outputCanvas,
    sourceQrCanvas: state.sourceQrCanvas,
    moduleCount: state.moduleCount,
    channels: state.qrChannels,
    outputSize: 800
  });

  applyCurrentColorsToOutput();
  clearCanvas(sourcePreviewCanvas);
  updatePreviewFlags({ hasSource: false, hasOutput: true });
}

/* -----------------------------
   RESET
----------------------------- */

function resetAll() {
  if (qrTextInput) qrTextInput.value = "";
  if (qrUpload) qrUpload.value = "";
  if (customMaskUpload) customMaskUpload.value = "";

  if (maskSelect) maskSelect.value = "";
  if (qrSizeSelect) qrSizeSelect.value = DEFAULT_QR_SIZE;
  if (maskScale) maskScale.value = String(DEFAULT_MASK_SCALE);
  if (maskScaleText) maskScaleText.value = String(DEFAULT_MASK_SCALE);
  if (invertMask) invertMask.checked = false;

  syncPresetShapeSelectionUI();

  if (foregroundColor) foregroundColor.value = "#000000";
  if (backgroundColor) backgroundColor.value = "#ffffff";
  if (transparentBackground) transparentBackground.checked = false;

  state.customMaskImage = null;
  state.customMaskCanvas = null;
  state.sourceQrCanvas = null;
  state.overlayQrCanvas = null;
  state.normalizedQrCanvas = null;
  state.interiorCanvas = null;
  state.textureTiles = [];
  state.moduleCount = 21;
  state.modulePixelSize = 1;
  state.blockModules = 2;
  state.hasRenderedOnce = false;

  resetQrChannels(DEFAULT_QR_SIZE);
  clearLayerCache();

  nudgeCount = 0;
  renderCount = 0;
  clearTimeout(renderTimer);
  renderTimer = null;
  isRendering = false;

  syncOffsetLabels();
  syncMaskScaleLabel();
  updateContrastWarning();

  clearCanvas(sourcePreviewCanvas);
  clearCanvas(outputCanvas);

  show(qrReadyBadge, false);
  show(shapeReadyBadge, false);

  updatePreviewFlags({ hasSource: false, hasOutput: false });
  lockWorkflowUntilReady();

  setPreviewMeta(`Paste a link or upload a QR to begin · ${APP_VERSION}`);
  setSourceMeta("waiting for QR source");

  resetGenerateButton();
  setLoading(false);

  populateSelectedChannelSelect();
  buildChannelControlsUI();

  track("reset_all");
  setDebug(`Reset complete · ${APP_VERSION}`);
}

/* -----------------------------
   IMAGE LOADERS
----------------------------- */

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

/* -----------------------------
   QR BUILD
----------------------------- */

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
  state.normalizedQrCanvas = generated.normalizedCanvas;
  state.interiorCanvas = interiorCanvas;
  state.textureTiles = tiles;
  state.moduleCount = generated.moduleCount;
  state.modulePixelSize = 1;
  state.blockModules = DEFAULT_BLOCK_MODULES;
  state.hasRenderedOnce = false;

  resetQrChannels(qrSizeSelect?.value || DEFAULT_QR_SIZE);
  clearLayerCache();

  paintSourcePreview(generated.overlayCanvas);
  setSourceMeta("QR prepared from link");
  setPreviewMeta(`QR ready · choose a shape next · ${APP_VERSION}`);
  show(qrReadyBadge, true);

  populateSelectedChannelSelect();
  buildChannelControlsUI();

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
  state.normalizedQrCanvas = normalized.canvas;
  state.interiorCanvas = interiorCanvas;
  state.textureTiles = tiles;
  state.moduleCount = normalized.moduleCount;
  state.modulePixelSize = modulePixelSize;
  state.blockModules = DEFAULT_UPLOAD_BLOCK_MODULES;
  state.hasRenderedOnce = false;

  resetQrChannels(qrSizeSelect?.value || DEFAULT_QR_SIZE);
  clearLayerCache();

  paintSourcePreview(state.overlayQrCanvas);
  setSourceMeta(file.name || "Uploaded QR");
  setPreviewMeta(`QR ready · choose a shape next · ${APP_VERSION}`);
  show(qrReadyBadge, true);

  populateSelectedChannelSelect();
  buildChannelControlsUI();

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

/* -----------------------------
   PRESET UI
----------------------------- */

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

/* -----------------------------
   MAIN RENDER FLOW
----------------------------- */

async function ensureQrPrepared() {
  if (hasRealQrInput()) return true;

  const uploadedFile = qrUpload?.files?.[0];
  if (uploadedFile) {
    await handleQrUpload(uploadedFile);
    return true;
  }

  const text = (qrTextInput?.value || "").trim();
  if (!text) {
    return false;
  }

  await buildQrFromText(text);
  return true;
}

async function renderOutput() {
  setLoading(true);

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    if (!hasRealQrInput()) {
      setDebug("Paste a link or upload a QR first.");
      return false;
    }

    if (!hasRealShapeInput()) {
      setDebug("Choose a shape first.");
      return false;
    }

    await rebuildStapledBaseIfNeeded();
    regenerateAutoChannels();
    redrawChannelsOnly();

    state.hasRenderedOnce = true;
    renderCount += 1;

    setPreviewMeta(`QR-Camo ready · ${APP_VERSION} · channels ${state.qrChannels.filter((c) => c.enabled).length}`);
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
  if (!okQr) {
    setDebug("Paste a link or upload a QR first.");
    setPreviewMeta(`QR needed first · ${APP_VERSION}`);
    return false;
  }

  if (!hasRealShapeInput()) {
    setDebug("Choose a shape next.");
    setPreviewMeta(`Shape needed next · ${APP_VERSION}`);
    return false;
  }

  unlockWorkflowAfterBothReady();

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
  if (!hasRealQrInput()) return;
  if (!hasRealShapeInput()) return;
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

/* -----------------------------
   CHANNEL MOVEMENT
----------------------------- */

function nudgeSelectedChannel(dx, dy) {
  const channel = getSelectedChannel();
  if (!channel) return;

  nudgeCount += 1;

  updateChannelById(channel.id, {
    x: clamp(Number(channel.x || 0) + dx, -PAN_LIMIT, PAN_LIMIT),
    y: clamp(Number(channel.y || 0) + dy, -PAN_LIMIT, PAN_LIMIT)
  });

  track("channel_nudged", {
    channelId: channel.id,
    dx,
    dy,
    x: getSelectedChannel()?.x || 0,
    y: getSelectedChannel()?.y || 0,
    nudgeCount
  });

  resetGenerateButton();

  if (state.hasRenderedOnce && state.stapledBaseCanvas && state.currentMaskCanvas) {
    redrawChannelsOnly();
    setPreviewMeta(`QR ${channel.id} moved · ${APP_VERSION}`);
  }
}

function resetSelectedChannelPosition() {
  const channel = getSelectedChannel();
  if (!channel) return;

  updateChannelById(channel.id, { x: 0, y: 0 });

  track("channel_position_reset", {
    channelId: channel.id
  });

  resetGenerateButton();

  if (state.hasRenderedOnce && state.stapledBaseCanvas && state.currentMaskCanvas) {
    redrawChannelsOnly();
    setPreviewMeta(`QR ${channel.id} reset · ${APP_VERSION}`);
  }
}

/* -----------------------------
   SHAPE SELECTION
----------------------------- */

async function handlePresetShapeSelection(maskKey) {
  if (!maskKey || !maskPresets[maskKey]) return;

  if (maskSelect) {
    maskSelect.value = maskKey;
  }

  state.customMaskImage = null;
  state.customMaskCanvas = null;
  clearLayerCache();

  if (customMaskUpload) {
    customMaskUpload.value = "";
  }

  show(shapeReadyBadge, true);
  syncPresetShapeSelectionUI();
  resetGenerateButton();
  track("preset_shape_selected", { shape: maskKey });
  setDebug(`Preset shape selected · ${APP_VERSION}`);

  if (hasRealQrInput()) {
    unlockWorkflowAfterBothReady();
    await createQrCamo();
  } else {
    setPreviewMeta(`Shape ready · paste a link or upload a QR next · ${APP_VERSION}`);
  }
}

/* -----------------------------
   SAMPLES
----------------------------- */

async function showSamplePreview(sampleKey) {
  const candidates = samplePreviewCandidates[sampleKey];
  if (!candidates?.length) {
    setDebug(`Sample not found: ${sampleKey}`);
    return;
  }

  try {
    const { img, src } = await resolveFirstWorkingImage(candidates);

    clearCanvas(sourcePreviewCanvas);

    outputCanvas.width = 800;
    outputCanvas.height = 800;
    const ctx = outputCanvas.getContext("2d");
    drawContain(ctx, img, 800, 800, 40, "#0a1020");

    updatePreviewFlags({ hasSource: false, hasOutput: true });

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

/* -----------------------------
   INIT
----------------------------- */

function init() {
  if (appVersionBadge) {
    appVersionBadge.textContent = APP_VERSION;
  }

  populatePresetSelect();
  populatePresetShapeCards();
  initSampleCardImages();
  resetQrChannels(DEFAULT_QR_SIZE);
  populateSelectedChannelSelect();
  buildChannelControlsUI();

  if (qrTextInput) {
    qrTextInput.value = "";
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
  syncPresetShapeSelectionUI();
  updateContrastWarning();
  updatePreviewFlags({ hasSource: false, hasOutput: false });
  lockWorkflowUntilReady();

  setPreviewMeta(`Paste a link or upload a QR to begin · ${APP_VERSION}`);
  setSourceMeta("waiting for QR source");
  setDebug(`Ready · ${APP_VERSION}`);

  track("app_loaded", {
    userAgent: navigator.userAgent
  });

  if (selectedChannelSelect) {
    selectedChannelSelect.addEventListener("change", () => {
      setSelectedChannel(selectedChannelSelect.value);
      track("selected_channel_changed", {
        channelId: state.selectedChannelId
      });
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

      clearTimeout(renderTimer);
      resetGenerateButton();
      clearQrPreparedState();

      track("qr_text_changed", {
        textLength: (qrTextInput.value || "").trim().length
      });

      setPreviewMeta(`Link updated · press Enter when ready · ${APP_VERSION}`);
    });

    qrTextInput.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const okQr = await ensureQrPrepared();
      if (!okQr) return;

      if (hasRealShapeInput()) {
        unlockWorkflowAfterBothReady();
        await createQrCamo();
      } else {
        setPreviewMeta(`QR ready · choose a shape next · ${APP_VERSION}`);
      }
    });

    qrTextInput.addEventListener("blur", async () => {
      const value = qrTextInput.value.trim();
      if (!value) return;

      const okQr = await ensureQrPrepared();
      if (!okQr) return;

      if (hasRealShapeInput()) {
        unlockWorkflowAfterBothReady();
        await createQrCamo();
      } else {
        setPreviewMeta(`QR ready · choose a shape next · ${APP_VERSION}`);
      }
    });
  }

  if (qrUpload) {
    qrUpload.addEventListener("change", async () => {
      const file = qrUpload?.files?.[0] || null;

      track("qr_upload_selected", {
        fileName: file?.name || null
      });

      clearQrPreparedState();

      if (!file) return;

      await handleQrUpload(file);

      if (hasRealShapeInput()) {
        unlockWorkflowAfterBothReady();
        await createQrCamo();
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
        clearLayerCache();

        if (maskSelect) maskSelect.value = "";
        syncPresetShapeSelectionUI();

        show(shapeReadyBadge, true);
        resetGenerateButton();

        track("custom_shape_upload_success", {
          fileName: file.name
        });

        setDebug(`Custom shape uploaded · ${APP_VERSION}`);

        if (hasRealQrInput()) {
          unlockWorkflowAfterBothReady();
          await createQrCamo();
        } else {
          setPreviewMeta(`Shape ready · paste a link or upload a QR next · ${APP_VERSION}`);
        }
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
      state.defaultChannelSize = qrSizeSelect.value;
      state.qrChannels = state.qrChannels.map((c) => ({
        ...c,
        size: qrSizeSelect.value,
        qrDisplaySize: 0,
        moduleDisplaySize: 0
      }));

      buildChannelControlsUI();

      track("default_channel_size_changed", {
        qrSize: qrSizeSelect.value
      });

      resetGenerateButton();

      if (state.hasRenderedOnce && state.stapledBaseCanvas && state.currentMaskCanvas) {
        redrawChannelsOnly();
        setPreviewMeta(`Default QR size updated · ${APP_VERSION}`);
      }
    });
  }

  if (maskScale) {
    maskScale.addEventListener("input", () => {
      syncMaskScaleLabel();
      track("mask_scale_changed", {
        value: Number(maskScale.value || 0)
      });
      resetGenerateButton();
      clearLayerCache();

      if (state.hasRenderedOnce) {
        scheduleAutoRender();
      }
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
      clearLayerCache();

      if (state.hasRenderedOnce) {
        scheduleAutoRender();
      }
    });
  }

  if (invertMask) {
    invertMask.addEventListener("change", () => {
      track("invert_mask_toggled", {
        value: !!invertMask.checked
      });
      resetGenerateButton();
      clearLayerCache();

      if (state.hasRenderedOnce) {
        scheduleAutoRender();
      }
    });
  }

  if (nudgeUp) nudgeUp.addEventListener("click", () => nudgeSelectedChannel(0, -NUDGE_STEP));
  if (nudgeRight) nudgeRight.addEventListener("click", () => nudgeSelectedChannel(NUDGE_STEP, 0));
  if (nudgeDown) nudgeDown.addEventListener("click", () => nudgeSelectedChannel(0, NUDGE_STEP));
  if (nudgeLeft) nudgeLeft.addEventListener("click", () => nudgeSelectedChannel(-NUDGE_STEP, 0));

  if (resetPositionBtn) {
    resetPositionBtn.addEventListener("click", resetSelectedChannelPosition);
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
  syncSelectedChannelUI();
}

init();
