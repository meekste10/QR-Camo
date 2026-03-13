
export function extractTiles(imageData,tileSize){
const tiles=[]
for(let y=0;y<imageData.height;y+=tileSize){
for(let x=0;x<imageData.width;x+=tileSize){
const canvas=new OffscreenCanvas(tileSize,tileSize)
const ctx=canvas.getContext("2d")
ctx.putImageData(imageData,-x,-y)
tiles.push(canvas)
}
}
return tiles
}
