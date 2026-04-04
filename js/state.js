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

  hasRenderedOnce: false,

  selectedChannelId: 1,
  defaultChannelSize: "xxsmall",

  qrChannels: [
    { id: 1, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0 },
    { id: 2, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0 },
    { id: 3, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0 },
    { id: 4, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0 },
    { id: 5, enabled: true, size: "xxsmall", x: 0, y: 0, autoX: 0, autoY: 0, fitScore: 0, cornersFit: 0, overlapRisk: 0 }
  ],

  placementCandidates: [],

  stapledBaseCanvas: null,
  currentMaskCanvas: null,
  lastBaseSignature: null,

  channelOverlayCanvases: {},
  compositeCanvas: null
};

state.baseCanvas = null;
state.baseCtx = null;

state.liveTransform = {
  x: 0,
  y: 0,
  scale: 1,
  isDragging: false
};
