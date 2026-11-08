import test from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'
import type {Config} from '../src/config'
import {Mailer,smtpDiagnostic} from '../src/mail'

const config=():Config=>({NODE_ENV:'test',API_HOST:'127.0.0.1',API_PORT:3200,WEB_ORIGIN:'http://127.0.0.1:3100',DB_HOST:'127.0.0.1',DB_PORT:3306,DB_USER:'mail_fixture',DB_PASSWORD:'',DB_NAME:'mail_fixture_test',AUTH_SECRET:'mail-fixture-only-'.repeat(4),TRUST_PROXY:'loopback',MAIL_TRANSPORT:'smtp' as const,SMTP_HOST:'smtp.example.com',SMTP_PORT:465,SMTP_SECURE:'true' as const,SMTP_USER:'sender@example.com',SMTP_PASSWORD:'test-only-authorization',MAIL_FROM:'sender@example.com'})

test('SMTP：465 使用直接 TLS，检查认证不发信并关闭连接',async t=>{
 let checked=0,closed=0
 t.mock.method(nodemailer,'createTransport',(options:Record<string,unknown>)=>{
  assert.equal(options.port,465);assert.equal(options.secure,true);assert.equal(options.requireTLS,false)
  assert.equal(options.debug,false);assert.equal(options.logger,false)
  assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true)
  return {verify:async()=>{checked++},close:()=>{closed++},sendMail:()=>{throw new Error('Verification must not send mail')}}
 })
 await new Mailer(config()).verify();assert.equal(checked,1);assert.equal(closed,1)
})

test('SMTP：注册、找回密码及测试邮件采用同一发送通道，587 强制 STARTTLS',async t=>{
 const messages:{from:string,to:string,subject:string,text:string}[]=[];let closed=0
 t.mock.method(nodemailer,'createTransport',(options:Record<string,unknown>)=>{
  assert.equal(options.secure,false);assert.equal(options.requireTLS,true)
  return {sendMail:async(message:typeof messages[number])=>{messages.push(message);return {accepted:[message.to]}},close:()=>{closed++}}
 })
 const mail=new Mailer({...config(),SMTP_PORT:587,SMTP_SECURE:'false'})
 await mail.send('registration-fixture','recipient@example.com','123456','registration')
 await mail.send('reset-fixture','recipient@example.com','654321','reset')
 await mail.sendTest('recipient@example.com')
 assert.match(messages[0]!.subject,/注册/);assert.match(messages[0]!.text,/123456/)
 assert.match(messages[1]!.subject,/重置密码/);assert.match(messages[1]!.text,/654321/)
 assert.match(messages[2]!.subject,/SMTP 发信测试/);assert.doesNotMatch(messages[2]!.text,/123456|654321/)
 assert.equal(closed,3)
})

test('SMTP：失败关闭连接，诊断不回显服务商响应或授权码',async t=>{
 let closed=0
 const failure=Object.assign(new Error('server response contains private authorization'),{code:'EAUTH'})
 t.mock.method(nodemailer,'createTransport',()=>({verify:async()=>{throw failure},sendMail:async()=>({accepted:[]}),close:()=>{closed++}}))
 const mail=new Mailer(config())
 await assert.rejects(()=>mail.verify(),error=>error===failure)
 await assert.rejects(()=>mail.sendTest('recipient@example.com'),error=>(error as {code:string}).code==='EENVELOPE')
 assert.equal(closed,2)
 assert.match(smtpDiagnostic(failure),/授权码/);assert.doesNotMatch(smtpDiagnostic(failure),/private authorization/)
 assert.match(smtpDiagnostic({code:'ETIMEDOUT'}),/无法连接/)
 await assert.rejects(()=>new Mailer({...config(),NODE_ENV:'production',MAIL_TRANSPORT:'capture'}).send('fixture','recipient@example.com','123456','registration'),/Capture is forbidden/)
})
