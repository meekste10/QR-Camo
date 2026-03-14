console.log("QR Camo app.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector("h1");
  if (header) header.textContent = "QR Camo Lab ✅";
});
import {state} from "./state.js"
import {maskPresets} from "./presets.js"
import {loadImage,drawToCanvas} from "./image-utils.js"
import {threshold,cropInterior} from "./qr-preprocess.js"
import {extractTiles} from "./tile-engine.js"
import {loadMask} from "./mask-engine.js"
import {render} from "./render-engine.js"
import {exportPNG} from "./export.js"

const qrUpload=document.getElementById("qrUpload")
const maskSelect=document.getElementById("maskSelect")
const generateBtn=document.getElementById("generateBtn")
const exportBtn=document.getElementById("exportBtn")

const originalCanvas=document.getElementById("originalCanvas")
const thresholdCanvas=document.getElementById("thresholdCanvas")
const cropCanvas=document.getElementById("cropCanvas")
const outputCanvas=document.getElementById("outputCanvas")

Object.keys(maskPresets).forEach(k=>{
const o=document.createElement("option")
o.value=k
o.textContent=k
maskSelect.appendChild(o)
})

qrUpload.onchange=async e=>{
const file=e.target.files[0]
const img=await loadImage(file)
state.qrImage=img
state.qrImageData=drawToCanvas(img,originalCanvas)
}

generateBtn.onclick=async ()=>{

const thresholded=threshold(new ImageData(
new Uint8ClampedArray(state.qrImageData.data),
state.qrImageData.width,
state.qrImageData.height
))

thresholdCanvas.width=thresholded.width
thresholdCanvas.height=thresholded.height
thresholdCanvas.getContext("2d").putImageData(thresholded,0,0)

const cropped=cropInterior(thresholded,22)

cropCanvas.width=cropped.width
cropCanvas.height=cropped.height
cropCanvas.getContext("2d").putImageData(cropped,0,0)

const tiles=extractTiles(cropped,14)

const mask=await loadMask(maskPresets[maskSelect.value])

render({
tiles,
maskImg:mask,
outputCanvas,
tileSize:14
})

}

exportBtn.onclick=()=>exportPNG(outputCanvas)
