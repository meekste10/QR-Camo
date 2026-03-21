export const state = {
  qrImage: null,
  qrImageData: null,

  customMaskImage: null,
  customMaskCanvas: null,

  sourceQrCanvas: null,
  overlayQrCanvas: null,
  normalizedQrCanvas: null,
  interiorCanvas: null,

  textureTiles: [],

  moduleCount: 21,
  modulePixelSize: 1
};
state.baseCanvas = null;
state.baseCtx = null;

state.liveTransform = {
  x: 0,
  y: 0,
  scale: 1,
  isDragging: false
};
