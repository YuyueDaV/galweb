import {createRequire} from 'node:module'
import {readdir,mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const require=createRequire(new URL('../apps/api/package.json',import.meta.url))
const sharp=require('sharp')
const source=process.argv[2]||'D:/works/gala/十二橙器/uploads'
const root=fileURLToPath(new URL('../',import.meta.url))
const output=path.join(root,'apps/web/public/images/works/responsive')
await mkdir(output,{recursive:true})
const originals=await readdir(source)
const manifest={}
for(let rank=1;rank<=12;rank++){
 const name=originals.find(file=>path.parse(file).name===`cover_rank_${rank}`)
 if(!name)throw new Error(`Missing original cover ${rank}`)
 const input=path.join(source,name)
 manifest[rank]={}
 const variants={rail:{widths:[48,64,96,128,192],ratio:4/5},post:{widths:[96,144,192,288,384,576],ratio:4/3},...(rank===9?{hero:{widths:[384,576,768,1152,1536],ratio:3/2}}:{})}
 for(const [variant,{widths,ratio}] of Object.entries(variants)){
  const metadata=await sharp(input).metadata()
  const cropWidth=Math.min(metadata.width,Math.round(metadata.height*ratio))
  const cropHeight=Math.min(metadata.height,Math.round(metadata.width/ratio))
  // Match the original object-position; crop once at full source resolution.
  const left=Math.round((metadata.width-cropWidth)*(variant==='hero'?.65:.5))
  const top=Math.round((metadata.height-cropHeight)*(variant==='hero'?.4:.5))
  const images=[]
  for(const width of widths){
   if(width>cropWidth)continue
   const filename=`${rank}-${variant}-${width}.webp`
   const info=await sharp(input).extract({left,top,width:cropWidth,height:cropHeight})
    .resize({width,height:Math.round(width/ratio),fit:'cover',kernel:'lanczos3',withoutEnlargement:true})
    .sharpen().webp({quality:92,effort:5,smartSubsample:true}).toFile(path.join(output,filename))
   images.push({width:info.width,height:info.height,url:`/images/works/responsive/${filename}`})
  }
  manifest[rank][variant]=images
 }
}
await writeFile(path.join(root,'apps/web/app/data/cover-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log('Prepared responsive covers directly from 12 originals (Lanczos downsampling, mild sharpening, no upscaling).')
