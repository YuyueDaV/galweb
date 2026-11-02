import {readConfig} from './config'
import {Mailer,smtpDiagnostic} from './mail'
import {z} from 'zod'

async function main(){
 const mode=process.argv[2]||'check'
 if(!['check','test'].includes(mode))throw new Error('Unknown mail command')
 // Check the real SMTP settings without changing the running application's mode.
 process.env.MAIL_TRANSPORT='smtp'
 const mail=new Mailer(readConfig())
 if(mode==='check'){await mail.verify();console.log('SMTP 连接与身份验证通过，未发送邮件。');return}
 const recipient=z.string().max(254).email().regex(/^[\x21-\x7e]+$/).safeParse(process.argv[3])
 if(!recipient.success){console.error('请提供一个有效的测试收件邮箱。');process.exitCode=1;return}
 await mail.sendTest(recipient.data)
 console.log('测试邮件已被 SMTP 服务接受，请检查收件箱和垃圾邮件。')
}
main().catch(error=>{console.error(smtpDiagnostic(error));process.exitCode=1})
