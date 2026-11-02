import nodemailer from 'nodemailer'
import { mkdir,writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Config } from './config'
export class Mailer {
  constructor(private readonly c:Config){}
  private transport(){
    return nodemailer.createTransport({host:this.c.SMTP_HOST,port:this.c.SMTP_PORT,secure:this.c.SMTP_SECURE==='true',requireTLS:this.c.SMTP_SECURE!=='true',auth:{user:this.c.SMTP_USER,pass:this.c.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false})
  }
  async verify(){const transport=this.transport();try{await transport.verify()}finally{transport.close()}}
  private async deliver(email:string,subject:string,text:string){
    const transport=this.transport()
    try{const result=await transport.sendMail({from:this.c.MAIL_FROM,to:email,subject,text});if(!result.accepted.length)throw Object.assign(new Error('Mail rejected'),{code:'EENVELOPE'})}finally{transport.close()}
  }
  async sendTest(email:string){await this.deliver(email,'澄之响 · SMTP 发信测试','这是一封用于验证澄之响账号注册邮件服务的测试邮件。\n收到此邮件说明发信服务已完成一次实际投递。\n本邮件不包含注册验证码，无需回复。')}
  async send(id:string,email:string,code:string,purpose:string){
    const subject=`澄之响 · ${purpose==='registration'?'注册':'重置密码'}验证码`
    const text=`你的验证码是：${code}\n5 分钟内有效，仅可使用一次。\n如果不是你本人操作，请忽略此邮件。`
    if(this.c.MAIL_TRANSPORT==='capture'){
      if(this.c.NODE_ENV==='production')throw new Error('Capture is forbidden in production')
      const dir=path.resolve('.data/mail');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,`${id}.json`),JSON.stringify({to:email,subject,text},null,2),{mode:0o600});return
    }
    await this.deliver(email,subject,text)
  }
}

export function smtpDiagnostic(error:unknown){
 const code=(error as {code?:string})?.code
 if(code==='EAUTH')return 'SMTP 身份验证失败：请开启邮箱 SMTP 服务，并使用授权码，而非 QQ 登录密码。'
 if(['EDNS','ENOTFOUND','EAI_AGAIN'].includes(code||''))return 'SMTP 域名解析失败，请检查 SMTP_HOST 和本机网络。'
 if(['ETIMEDOUT','ECONNECTION','ESOCKET','ECONNREFUSED','ECONNRESET'].includes(code||''))return '无法连接 SMTP 服务，请检查服务器、端口、网络或代理设置。'
 if(code==='ETLS'||code?.startsWith('CERT_'))return 'SMTP 加密连接失败，请检查端口和 SMTP_SECURE 配置；请勿关闭证书校验。'
 if(code==='EENVELOPE')return '发件人或收件人被拒绝，请确认 MAIL_FROM 与发信账号匹配、收件邮箱有效。'
 return 'SMTP 检查失败，请确认本地 SMTP 配置完整，并检查邮箱服务状态。'
}
