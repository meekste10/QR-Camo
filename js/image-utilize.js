
export function loadImage(file){
return new Promise(res=>{
const img=new Image()
img.onload=()=>res(img)
img.src=URL.createObjectURL(file)
})
}

export function drawToCanvas(img,canvas){
const ctx=canvas.getContext("2d")
canvas.width=img.width
canvas.height=img.height
ctx.drawImage(img,0,0)
return ctx.getImageData(0,0,canvas.width,canvas.height)
}

export function downloadCanvas(canvas,name="qr-camo.png"){
const link=document.createElement("a")
link.download=name
link.href=canvas.toDataURL()
link.click()
}
