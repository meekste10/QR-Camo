
import {pointInsideMask} from "./mask-engine.js"

export function render(options){

const {tiles,maskImg,outputCanvas,tileSize}=options

const ctx=outputCanvas.getContext("2d")

outputCanvas.width=800
outputCanvas.height=800

const maskCanvas=new OffscreenCanvas(800,800)
const mctx=maskCanvas.getContext("2d")

mctx.drawImage(maskImg,0,0,800,800)

let tileIndex=0

for(let y=0;y<800;y+=tileSize){
for(let x=0;x<800;x+=tileSize){

const cx=x+tileSize/2
const cy=y+tileSize/2

if(pointInsideMask(mctx,cx,cy)){
const tile=tiles[tileIndex%tiles.length]
ctx.drawImage(tile,x,y,tileSize,tileSize)
tileIndex++
}

}
}

}
