import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {resolveObjectURL} from 'node:buffer'
import {createRequire} from 'node:module'
import {prepareAvatar} from '../apps/web/app/utils/avatar.ts'

const require=createRequire(new URL('../apps/api/package.json',import.meta.url))
const sharp=require('sharp')

// Decode/encode real image fixtures with Sharp while supplying the browser APIs
// used by the helper. Browser layout and native file-picker interaction are separate.
test('头像处理：大于 5 MB 的原图变为可上传的方形图片，并回收临时 URL',async t=>{
 const oldImage=globalThis.Image,oldDocument=globalThis.document
 const revoked=[],revoke=URL.revokeObjectURL.bind(URL)
 t.mock.method(URL,'revokeObjectURL',url=>{revoked.push(url);revoke(url)})
 globalThis.Image=class {
  async decode(){this.buffer=Buffer.from(await resolveObjectURL(this.src).arrayBuffer());const metadata=await sharp(this.buffer).metadata();this.naturalWidth=metadata.width;this.naturalHeight=metadata.height}
 }
 let contextAvailable=true,encodeAvailable=true
 globalThis.document={createElement(tag){assert.equal(tag,'canvas');const canvas={width:0,height:0};let drawing
  canvas.getContext=()=>contextAvailable?{drawImage(...args){drawing=args}}:null
  canvas.toBlob=callback=>{
   if(!encodeAvailable){callback(null);return}
   const [image,x,y,width,height]=drawing
   sharp(image.buffer).extract({left:Math.floor(x),top:Math.floor(y),width,height}).resize(canvas.width,canvas.height).webp({quality:86}).toBuffer().then(buffer=>callback(new Blob([buffer],{type:'image/webp'})))
  }
  return canvas
 }}
 try{
  const noisy=await sharp(randomBytes(2000*1000*3),{raw:{width:2000,height:1000,channels:3}}).png().toBuffer()
  assert.ok(noisy.length>5*1024*1024)
  const output=await prepareAvatar(new File([noisy],'large.png',{type:'image/png'}))
  assert.equal(output.type,'image/webp');assert.ok(output.size<5*1024*1024)
  const metadata=await sharp(Buffer.from(await output.arrayBuffer())).metadata()
  assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(revoked.length,1)
  await assert.rejects(()=>prepareAvatar(new File(['<svg/>'],'fake.png',{type:'image/png'})),/格式不支持/)
  await assert.rejects(()=>prepareAvatar(new File([new Uint8Array(32*1024*1024+1)],'huge.png')),/32 MB/)
  await assert.rejects(()=>prepareAvatar(new File([],'empty.png')),/空文件/)
  await assert.rejects(()=>prepareAvatar(new File([noisy.subarray(0,12)],'broken.png')),/无法读取/)
  assert.equal(revoked.length,2,'解码失败也回收临时 URL')
  const oversized=await sharp({create:{width:8000,height:6000,channels:3,background:'orange'}}).png().toBuffer()
  await assert.rejects(()=>prepareAvatar(new File([oversized],'many-pixels.png')),/4000 万像素/)
  const small=await sharp({create:{width:48,height:32,channels:3,background:'orange'}}).png().toBuffer()
  const smaller=await prepareAvatar(new File([small],'small.png'))
  assert.equal((await sharp(Buffer.from(await smaller.arrayBuffer())).metadata()).width,32,'小图不放大')
  contextAvailable=false
  await assert.rejects(()=>prepareAvatar(new File([small],'small.png')),/浏览器无法处理/)
  contextAvailable=true;encodeAvailable=false
  await assert.rejects(()=>prepareAvatar(new File([small],'small.png')),/压缩失败/)
 }finally{globalThis.Image=oldImage;globalThis.document=oldDocument}
})
