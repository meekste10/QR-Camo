import { render as renderCamouflage } from "./render.js";
import { buildTilesFromQr } from "./tile-builder.js";
import { loadPresetMasks } from "./presets.js";
import { createThresholdMaskCanvas } from "./mask-threshold.js";

const state = {
  sourceQrImage: null,
  sourceQrCanvas: null,
  tiles: [],
  currentMaskImage: null,
  currentMaskCanvas: null,
  presetMasks: [],
  qrSize: "medium",
  qrOffsetX: 0,
  qrOffsetY: 0,
  foregroundColor: "#000000",
  backgroundColor: "#ffffff",
  transparentBackground: false,
  customMaskFile: null,
  customMaskImage: null,
  customMaskThreshold: 180,
  customMaskInvert: false,
  lastRenderOk: false,
  previewMode: "source"
};

const els = {
  qrReadyBadge: document.getElementById("qrReadyBadge"),
  maskReadyBadge: document.getElementById("maskReadyBadge"),
  engineStatus: document.getElementById("engineStatus"),

  makeQrBtn: document.getElementById("makeQrBtn"),
  generateBtn: document.getElementById("generateBtn"),
  exportBtn: document.getElementById("exportBtn"),

  qrTextInput: document.getElementById("qrTextInput"),
  qrUpload: document.getElementById("qrUpload"),
  qrUploadMirror: document.getElementById("qrUploadMirror"),

  customMaskUpload: document.getElementById("customMaskUpload"),
  customMaskThreshold: document.getElementById("customMaskThreshold"),
  customMaskInvert: document.getElementById("customMaskInvert"),

  maskSelect: document.getElementById("maskSelect"),

  sourcePreviewCanvas: document.getElementById("sourcePreviewCanvas"),
  customMaskCanvas: document.getElementById("customMaskCanvas"),
  outputCanvas: document.getElementById("outputCanvas"),
  originalCanvas: document.getElementById("originalCanvas"),
  thresholdCanvas: document.getElementById("thresholdCanvas"),
  cropCanvas: document.getElementById("cropCanvas"),

  sourceMeta: document.getElementById("sourceMeta"),
  previewMeta: document.getElementById("previewMeta"),
  debugPanel: document.getElementById("debugPanel"),

  qrSizeSelect: document.getElementById("qrSizeSelect"),
  qrOffsetX: document.getElementById("qrOffsetX"),
  qrOffsetY: document.getElementById("qrOffsetY"),
  qrOffsetXLabel: document.getElementById("qrOffsetXLabel"),
  qrOffsetYLabel: document.getElementById("qrOffsetYLabel"),

  foregroundColor: document.getElementById("foregroundColor"),
  backgroundColor: document.getElementById("backgroundColor"),
  transparentBackground: document.getElementById("transparentBackground"),
  contrastWarning: document.getElementById("contrastWarning"),

  resetPositionBtn: document.getElementById("resetPositionBtn"),
  nudgeUp: document.getElementById("nudgeUp"),
  nudgeRight: document.getElementById("nudgeRight"),
  nudgeDown: document.getElementById("nudgeDown"),
  nudgeLeft: document.getElementById("nudgeLeft"),

  previewStageShared: document.querySelector(".preview-stage-shared")
};

function setStatus(text) {
  if (els.engineStatus) els.engineStatus.textContent = text;
  if (els.debugPanel) els.debugPanel.textContent = text;
}

function setPreviewMeta(text) {
  if (els.previewMeta) els.previewMeta.textContent = text;
}

function show(el, on) {
  if (!el) return;
  el.classList.toggle("hidden", !on);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getReadableFileName(file) {
  if (!file) return "Nothing loaded yet";
  return file.name || "Uploaded file";
}

function createCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function drawContain(ctx, source, width, height, padding = 0, background = null) {
  ctx.clearRect(0, 0, width, height);

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);

  const sw = source.width || source.videoWidth || 1;
  const sh = source.height || source.videoHeight || 1;
  const scale = Math.min(availW / sw, availH / sh);

  const drawW = Math.max(1, Math.round(sw * scale));
  const drawH = Math.max(1, Math.round(sh * scale));
  const dx = Math.round((width - drawW) / 2);
  const dy = Math.round((height - drawH) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, dx, dy, drawW, drawH);

  return { dx, dy, drawW, drawH };
}

function syncOffsetLabels() {
  if (els.qrOffsetX) els.qrOffsetX.value = String(state.qrOffsetX);
  if (els.qrOffsetY) els.qrOffsetY.value = String(state.qrOffsetY);
  if (els.qrOffsetXLabel) els.qrOffsetXLabel.textContent = String(state.qrOffsetX);
  if (els.qrOffsetYLabel) els.qrOffsetYLabel.textContent = String(state.qrOffsetY);
}

function updateContrastWarning() {
  if (!els.contrastWarning) return;

  if (state.transparentBackground) {
    els.contrastWarning.classList.add("hidden");
    return;
  }

  const fg = hexToRgb(state.foregroundColor);
  const bg = hexToRgb(state.backgroundColor);
  if (!fg || !bg) {
    els.contrastWarning.classList.add("hidden");
    return;
  }

  const contrast = contrastRatio(fg, bg);
  els.contrastWarning.classList.toggle("hidden", contrast >= 2.5);
}

function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "").trim();
  if (![3, 6].includes(clean.length)) return null;

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

function tintQrCanvas(sourceCanvas, fgColor, bgColor, transparentBackground) {
  const out = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const img = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = img.data;

  const fg = hexToRgb(fgColor) || { r: 0, g: 0, b: 0 };
  const bg = hexToRgb(bgColor) || { r: 255, g: 255, b: 255 };

  for (let i = 0; i < data.length; i += 4) {
    const isDark = data[i] < 128;
    if (isDark) {
      data[i] = fg.r;
      data[i + 1] = fg.g;
      data[i + 2] = fg.b;
      data[i + 3] = 255;
    } else {
      if (transparentBackground) {
        data[i + 3] = 0;
      } else {
        data[i] = bg.r;
        data[i + 1] = bg.g;
        data[i + 2] = bg.b;
        data[i + 3] = 255;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return out;
}

function setPreviewMode(mode) {
  state.previewMode = mode;

  const stage = els.previewStageShared;
  if (!stage) return;

  stage.classList.remove("preview-has-source", "preview-has-output");

  if (mode === "source") {
    stage.classList.add("preview-has-source");
  }

  if (mode === "output") {
    stage.classList.add("preview-has-output");
  }
}

async function buildQrFromText() {
  const value = (els.qrTextInput?.value || "").trim();
  if (!value) {
    setStatus("Paste a link or text first.");
    return;
  }

  try {
    const qrCanvas = createCanvas(512, 512);
    await window.QRCode.toCanvas(qrCanvas, value, {
      width: 512,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    });

    state.sourceQrCanvas = qrCanvas;
    state.sourceQrImage = null;

    hydrateSourceOutputs();
    setPreviewMode("source");

    setStatus("QR created from text.");
    show(els.qrReadyBadge, true);
    maybeAutoRender();
  } catch (error) {
    console.error(error);
    setStatus("Could not create QR from text.");
  }
}

async function handleQrUpload(file) {
  if (!file) return;

  try {
    const img = await loadImageFromFile(file);

    const qrCanvas = createCanvas(512, 512);
    const qctx = qrCanvas.getContext("2d");
    drawContain(qctx, img, 512, 512, 12, "#ffffff");

    state.sourceQrImage = img;
    state.sourceQrCanvas = qrCanvas;

    hydrateSourceOutputs(file);
    setPreviewMode("source");

    setStatus("Existing QR uploaded.");
    show(els.qrReadyBadge, true);
    maybeAutoRender();
  } catch (error) {
    console.error(error);
    setStatus("Could not load uploaded QR.");
  }
}

function hydrateSourceOutputs(file = null) {
  if (!state.sourceQrCanvas) return;

  if (els.sourcePreviewCanvas) {
    const canvas = els.sourcePreviewCanvas;
    canvas.width = 220;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    drawContain(ctx, state.sourceQrCanvas, canvas.width, canvas.height, 16, "#0a1020");
  }

  if (els.originalCanvas) {
    els.originalCanvas.width = state.sourceQrCanvas.width;
    els.originalCanvas.height = state.sourceQrCanvas.height;
    const ctx = els.originalCanvas.getContext("2d");
    ctx.clearRect(0, 0, els.originalCanvas.width, els.originalCanvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.sourceQrCanvas, 0, 0);
  }

  if (els.sourceMeta) {
    els.sourceMeta.textContent = file ? getReadableFileName(file) : "QR ready";
  }
}

async function handleCustomMaskUpload(file) {
  if (!file) return;

  try {
    const img = await loadImageFromFile(file);
    state.customMaskFile = file;
    state.customMaskImage = img;
    buildCurrentMaskFromUploaded();
    show(els.maskReadyBadge, true);
    setStatus("Custom shape uploaded.");
    maybeAutoRender();
  } catch (error) {
    console.error(error);
    setStatus("Could not load custom shape.");
  }
}

function buildCurrentMaskFromUploaded() {
  if (!state.customMaskImage) return;

  const maskCanvas = createThresholdMaskCanvas({
    image: state.customMaskImage,
    size: 800,
    threshold: Number(state.customMaskThreshold),
    invert: !!state.customMaskInvert
  });

  state.currentMaskCanvas = maskCanvas;

  const img = new Image();
  img.src = maskCanvas.toDataURL("image/png");
  img.onload = () => {
    state.currentMaskImage = img;
    paintMaskPreview(maskCanvas);
    maybeAutoRender();
  };

  paintMaskPreview(maskCanvas);
}

function paintMaskPreview(maskCanvas) {
  if (!els.customMaskCanvas || !maskCanvas) return;
  const canvas = els.customMaskCanvas;
  canvas.width = 220;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  drawContain(ctx, maskCanvas, canvas.width, canvas.height, 12, "#0a1020");
}

function populatePresetSelect() {
  if (!els.maskSelect) return;

  els.maskSelect.innerHTML = "";
  state.presetMasks.forEach((preset, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = preset.label;
    els.maskSelect.appendChild(option);
  });
}

function applyPresetMask(index) {
  const preset = state.presetMasks[index];
  if (!preset) return;
  if (state.customMaskImage) return;

  state.currentMaskImage = preset.image;
  state.currentMaskCanvas = preset.canvas || null;
  paintMaskPreview(preset.canvas || preset.image);
  show(els.maskReadyBadge, true);
  setStatus(`Preset shape selected: ${preset.label}`);
  maybeAutoRender();
}

function getTintedSourceQrCanvas() {
  if (!state.sourceQrCanvas) return null;
  return tintQrCanvas(
    state.sourceQrCanvas,
    state.foregroundColor,
    state.backgroundColor,
    state.transparentBackground
  );
}

function rebuildTiles() {
  const tinted = getTintedSourceQrCanvas();
  if (!tinted) return false;

  const built = buildTilesFromQr({
    sourceQrCanvas: tinted,
    originalCanvas: els.originalCanvas,
    thresholdCanvas: els.thresholdCanvas,
    cropCanvas: els.cropCanvas
  });

  state.tiles = built.tiles || [];
  state.sourceQrCanvasTinted = built.thresholdCanvasForRender || tinted;
  return state.tiles.length > 0;
}

function renderOutput() {
  if (!state.currentMaskImage || !state.sourceQrCanvas) {
    setPreviewMeta("Awaiting generation");
    return;
  }

  const ok = rebuildTiles();
  if (!ok) {
    setStatus("Could not prepare QR tiles.");
    return;
  }

  try {
    renderCamouflage({
      tiles: state.tiles,
      maskImg: state.currentMaskImage,
      outputCanvas: els.outputCanvas,
      sourceQrCanvas: state.sourceQrCanvasTinted || getTintedSourceQrCanvas(),
      modulePixelSize: 4,
      qrSize: state.qrSize,
      qrOffsetX: state.qrOffsetX,
      qrOffsetY: state.qrOffsetY
    });

    state.lastRenderOk = true;
    setPreviewMode("output");
    setPreviewMeta("Live preview ready");
    setStatus("Render complete");
  } catch (error) {
    console.error(error);
    state.lastRenderOk = false;
    setStatus("Render failed.");
  }
}

function maybeAutoRender() {
  if (!state.sourceQrCanvas || !state.currentMaskImage) return;
  renderOutput();
}

function setQrSize(size) {
  state.qrSize = size;
  if (els.qrSizeSelect) els.qrSizeSelect.value = size;

  document.querySelectorAll(".pill-btn[data-size]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.size === size);
  });

  maybeAutoRender();
}

function nudge(dx, dy) {
  state.qrOffsetX = clamp(state.qrOffsetX + dx, -240, 240);
  state.qrOffsetY = clamp(state.qrOffsetY + dy, -240, 240);
  syncOffsetLabels();
  maybeAutoRender();
}

function resetPosition() {
  state.qrOffsetX = 0;
  state.qrOffsetY = 0;
  syncOffsetLabels();
  maybeAutoRender();
}

function exportPng() {
  if (!els.outputCanvas || !state.lastRenderOk) {
    setStatus("Generate a QR-Camo first.");
    return;
  }

  const link = document.createElement("a");
  link.download = "qr-camo.png";
  link.href = els.outputCanvas.toDataURL("image/png");
  link.click();
}

function wireEvents() {
  els.makeQrBtn?.addEventListener("click", buildQrFromText);
  els.generateBtn?.addEventListener("click", renderOutput);
  els.exportBtn?.addEventListener("click", exportPng);

  els.qrTextInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      buildQrFromText();
    }
  });

  const onQrFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleQrUpload(file);
  };

  els.qrUpload?.addEventListener("change", onQrFile);
  els.qrUploadMirror?.addEventListener("change", onQrFile);

  els.customMaskUpload?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleCustomMaskUpload(file);
  });

  els.customMaskThreshold?.addEventListener("input", (e) => {
    state.customMaskThreshold = Number(e.target.value);
    if (state.customMaskImage) {
      buildCurrentMaskFromUploaded();
    }
  });

  els.customMaskInvert?.addEventListener("change", (e) => {
    state.customMaskInvert = !!e.target.checked;
    if (state.customMaskImage) {
      buildCurrentMaskFromUploaded();
    }
  });

  els.maskSelect?.addEventListener("change", (e) => {
    applyPresetMask(Number(e.target.value));
  });

  document.querySelectorAll(".pill-btn[data-size]").forEach((btn) => {
    btn.addEventListener("click", () => setQrSize(btn.dataset.size));
  });

  els.nudgeUp?.addEventListener("click", () => nudge(0, -8));
  els.nudgeRight?.addEventListener("click", () => nudge(8, 0));
  els.nudgeDown?.addEventListener("click", () => nudge(0, 8));
  els.nudgeLeft?.addEventListener("click", () => nudge(-8, 0));
  els.resetPositionBtn?.addEventListener("click", resetPosition);

  els.foregroundColor?.addEventListener("input", (e) => {
    state.foregroundColor = e.target.value;
    updateContrastWarning();
    maybeAutoRender();
  });

  els.backgroundColor?.addEventListener("input", (e) => {
    state.backgroundColor = e.target.value;
    updateContrastWarning();
    maybeAutoRender();
  });

  els.transparentBackground?.addEventListener("change", (e) => {
    state.transparentBackground = !!e.target.checked;
    updateContrastWarning();
    maybeAutoRender();
  });
}

async function initPresets() {
  try {
    state.presetMasks = await loadPresetMasks();
    populatePresetSelect();

    if (state.presetMasks.length) {
      applyPresetMask(0);
    }
  } catch (error) {
    console.error(error);
    setStatus("Preset masks could not load.");
  }
}

function initialUiSync() {
  syncOffsetLabels();
  updateContrastWarning();
  setQrSize("medium");
  setPreviewMode("source");
  setPreviewMeta("Awaiting generation");
  setStatus("Engine ready");
  show(els.qrReadyBadge, false);
  show(els.maskReadyBadge, false);
}

async function init() {
  initialUiSync();
  wireEvents();
  await initPresets();
}

init();
