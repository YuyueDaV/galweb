import { createHash,createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto'
import { HttpException } from '@nestjs/common'
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
export const mac=(secret:string,value:string)=>createHmac('sha256',secret).update(value).digest('hex')
export const token=()=>randomBytes(32).toString('base64url')
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y)}
let busy=0
async function derive(password:string,salt:string):Promise<Buffer>{
  if(busy>=4)throw new HttpException('服务繁忙，请稍后再试。',503)
  busy++
  try{
    return await new Promise<Buffer>((resolve,reject)=>{
      scryptCallback(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024},(error,key)=>error?reject(error):resolve(key))
    })
  }finally{busy--}
}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${(await derive(password,salt)).toString('hex')}`}
export async function checkPassword(password:string,encoded:string){const [kind,salt,hash]=encoded.split('$');if(kind!=='scrypt'||!salt||!hash)return false;return equal((await derive(password,salt)).toString('hex'),hash)}
// Explicit application policy: ASCII email addresses, case-insensitive account lookup; preserve dots and + tags.
export function emailKey(value:string){return value.trim().toLowerCase()}
