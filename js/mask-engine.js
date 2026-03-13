
export async function loadMask(src){
return new Promise(res=>{
const img=new Image()
img.onload=()=>res(img)
img.src=src
})
}

export function pointInsideMask(ctx,x,y){
const data=ctx.getImageData(x,y,1,1).data
return data[3]>10
}
