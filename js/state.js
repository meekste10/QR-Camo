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
  modulePixelSize: 1,
  blockModules: 2,

  hasRenderedOnce: false,

  stapledBaseCanvas: null,
  currentMaskCanvas: null,
  lastBaseSignature: null,

  qrPlacement: null,
  liveQrScale: 1
};
