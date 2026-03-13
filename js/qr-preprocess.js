
export function threshold(imageData,threshold=128){
const d=imageData.data
for(let i=0;i<d.length;i+=4){
const avg=(d[i]+d[i+1]+d[i+2])/3
const v=avg>threshold?255:0
d[i]=v
d[i+1]=v
d[i+2]=v
}
return imageData
}

export function cropInterior(imageData,cropPercent){
const w=imageData.width
const h=imageData.height
const crop=Math.floor(w*(cropPercent/100))
const newW=w-crop*2
const newH=h-crop*2
const canvas=new OffscreenCanvas(newW,newH)
const ctx=canvas.getContext("2d")
const temp=new ImageData(imageData.data,w,h)
ctx.putImageData(temp,-crop,-crop)
return ctx.getImageData(0,0,newW,newH)
}
