import {createRequire} from 'node:module'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const require=createRequire(new URL('../apps/api/package.json',import.meta.url))
const sharp=require('sharp')
const root=fileURLToPath(new URL('../',import.meta.url))
const publicRoot=path.join(root,'apps/web/public')
const output=path.join(publicRoot,'images/works/responsive')
await mkdir(output,{recursive:true})
const sources=JSON.parse(await readFile(path.join(root,'apps/web/app/data/cover-sources.json'),'utf8'))
const manifest={}
for(const source of sources){
 const {rank}=source
 const input=path.join(publicRoot,source.url)
 const bytes=await readFile(input)
 const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12)
 const metadata=await sharp(bytes).metadata()
 manifest[rank]={original:{url:source.url,width:metadata.width,height:metadata.height}}
 const variants={cover:{widths:[192,320,480,600,768,960,1200,1600,1920]},rail:{widths:[48,64,96,128,192]},post:{widths:[96,144,192,288,384,576],ratio:4/3},...(rank===9?{hero:{widths:[384,576,768,1152,1536],ratio:3/2}}:{})}
 for(const [variant,{widths,ratio}] of Object.entries(variants)){
  const cropWidth=ratio?Math.min(metadata.width,Math.round(metadata.height*ratio)):metadata.width
  const cropHeight=ratio?Math.min(metadata.height,Math.round(metadata.width/ratio)):metadata.height
  // Match the original object-position; crop once at full source resolution.
  const left=Math.round((metadata.width-cropWidth)*(variant==='hero'?.65:.5))
  const top=Math.round((metadata.height-cropHeight)*(variant==='hero'?.4:.5))
  const images=[]
  const targets=[...new Set([...widths.filter(width=>width<=cropWidth),...(variant==='cover'?[cropWidth]:[])])].sort((a,b)=>a-b)
  for(const width of targets){
   const filename=`${rank}-${hash}-${variant}-${width}.webp`
   let pipeline=sharp(bytes)
   if(ratio)pipeline=pipeline.extract({left,top,width:cropWidth,height:cropHeight})
   const info=await pipeline.resize({width,kernel:'lanczos3',withoutEnlargement:true})
    .sharpen({sigma:.5}).webp({quality:92,effort:5,smartSubsample:true}).toFile(path.join(output,filename))
   images.push({width:info.width,height:info.height,url:`/images/works/responsive/${filename}`})
  }
  manifest[rank][variant]=images
 }
}
await writeFile(path.join(root,'apps/web/app/data/cover-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
// Reuse the credited autumn illustration behind the site's floating glass header.
const headerSource=sources.find(source=>source.rank===12)
if(headerSource)await sharp(path.join(publicRoot,headerSource.url))
 .resize(1600,520,{fit:'cover',position:sharp.strategy.attention,withoutEnlargement:true})
 .webp({quality:88,effort:6}).toFile(path.join(publicRoot,'images/header-autumn.webp'))
console.log('Prepared 12 covers: full-frame cover/rail, cropped post/hero, content-hashed URLs, no upscaling.')
