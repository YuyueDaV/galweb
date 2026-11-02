const MAX_SOURCE_BYTES=32*1024*1024
const MAX_SOURCE_PIXELS=40_000_000
const MAX_UPLOAD_BYTES=5*1024*1024

/** Convert the selected original into a small, centred avatar before uploading. */
export async function prepareAvatar(file:File):Promise<File>{
 if(!file.size)throw new Error('这张图片是空文件，请重新选择。')
 if(file.size>MAX_SOURCE_BYTES)throw new Error('原图超过 32 MB，请先缩小图片后重试。')
 const header=new Uint8Array(await file.slice(0,12).arrayBuffer())
 const jpeg=header[0]===0xff&&header[1]===0xd8&&header[2]===0xff
 const png=[137,80,78,71,13,10,26,10].every((byte,i)=>header[i]===byte)
 const webp=String.fromCharCode(...header.slice(0,4))==='RIFF'&&String.fromCharCode(...header.slice(8,12))==='WEBP'
 if(!jpeg&&!png&&!webp)throw new Error('图片格式不支持，请选择 JPG、PNG 或 WebP。')
 const url=URL.createObjectURL(file),image=new Image()
 try{
  image.src=url
  try{await image.decode()}catch{throw new Error('无法读取这张图片，文件可能已损坏，请换一张重试。')}
  const width=image.naturalWidth,height=image.naturalHeight
  if(!width||!height)throw new Error('图片尺寸无效，请重新选择。')
  if(width*height>MAX_SOURCE_PIXELS)throw new Error('图片分辨率超过 4000 万像素，请先缩小尺寸后重试。')
  const sourceSize=Math.min(width,height),size=Math.min(512,sourceSize)
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size
  const context=canvas.getContext('2d')
  if(!context)throw new Error('当前浏览器无法处理头像，请更新浏览器后重试。')
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high'
  context.drawImage(image,(width-sourceSize)/2,(height-sourceSize)/2,sourceSize,sourceSize,0,0,size,size)
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('头像压缩失败，请换一张图片重试。')),'image/webp',.86))
  if(blob.size>MAX_UPLOAD_BYTES)throw new Error('处理后的头像仍超过 5 MB，请换一张图片重试。')
  return new File([blob],blob.type==='image/webp'?'avatar.webp':'avatar.png',{type:blob.type})
 }finally{URL.revokeObjectURL(url)}
}
