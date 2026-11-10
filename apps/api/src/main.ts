import 'reflect-metadata'
import { Body,Controller,Get,Post,Patch,Delete,Param,Req,Res,Module,HttpException, type ExceptionFilter, type ArgumentsHost, Catch } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { json, type Request,type Response } from 'express'
import { z } from 'zod'
import { readConfig } from './config'
import { Database } from './database'
import { Auth } from './auth'
import { Mailer } from './mail'
import { Platform } from './platform'
import { equal,digest } from './security'
import { businessControllers } from './business-api'
import {validUsername} from './identity'
import {apiError} from './http-errors'
import {AccountDeletion} from './account-deletion'
import {Assets} from './assets'
import {verifiedRequestOrigin} from './request-origin'
import {startupDiagnostic,type StartupStage} from './startup-diagnostic'

const email=z.string().trim().max(254).email().regex(/^[\x21-\x7e]+$/)
const password=z.string().min(12).max(128)
const verification={email,challengeId:z.uuid(),code:z.string().regex(/^\d{6}$/),password,confirmPassword:password}
const username=z.string().trim().min(3).max(24).refine(validUsername)
export function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success){const field=String(result.error.issues[0]?.path[0]||'');const messages:Record<string,string>={username:'用户名需为 3–24 位中文、字母、数字或下划线。',password:'请检查密码长度（注册或重置时为 12–128 个字符）。',confirmPassword:'请再次输入相同密码（12–128 个字符）。',nickname:'昵称需为 1–24 个字符。',signature:'个性签名最多 120 个字符。',avatarAssetId:'请选择有效的头像图片。',confirmation:'请输入“注销账号”确认操作。',email:'请输入有效邮箱。',code:'请输入 6 位验证码。'};throw new HttpException(messages[field]||'请求字段无效。',422)}return result.data}
export function cookies(req:Request){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')).filter(p=>p.length===2))}
const c=readConfig(),db=new Database(c),auth=new Auth(db,c,new Mailer(c))
const platform=new Platform(db),deletion=new AccountDeletion(db,platform),assets=new Assets(db,platform)
const cookieName=c.NODE_ENV==='production'?'__Host-czx_session':'czx_session'
const cookieOptions={httpOnly:true,secure:c.NODE_ENV==='production',sameSite:'lax' as const,path:'/'}
@Catch()
class Errors implements ExceptionFilter {catch(error:unknown,host:ArgumentsHost){const res=host.switchToHttp().getResponse<Response>();const result=apiError(error);if(result.statusCode===500)console.error('API request failed');res.status(result.statusCode).json(result)}}
@Controller('api/auth')
class AuthController {
  @Post('registration-code') request(@Body() body:unknown,@Req() req:Request){const p=parse(z.object({email}).strict(),body);return auth.requestCode(p.email,'registration',req.ip||'unknown')}
  @Post('register') register(@Body() body:unknown,@Req() req:Request){const p=parse(z.object({...verification,username}).strict(),body);return auth.complete(p,'registration',req.ip||'unknown')}
  @Post('password-reset/request') resetRequest(@Body() body:unknown,@Req() req:Request){const p=parse(z.object({email}).strict(),body);return auth.requestCode(p.email,'reset',req.ip||'unknown')}
  @Post('password-reset/confirm') reset(@Body() body:unknown,@Req() req:Request){return auth.complete(parse(z.object(verification).strict(),body),'reset',req.ip||'unknown')}
  @Post('login') async login(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response){const p=parse(z.object({username:z.string().trim().min(1).max(128),password:z.string().min(1).max(128)}).strict(),body);const result=await auth.login(p.username,p.password,req.ip||'unknown',cookies(req)[cookieName]);res.cookie(cookieName,result.session,{...cookieOptions,maxAge:7*86400000});return {user:result.user,csrfToken:result.csrf}}
  @Patch('me') async profile(@Body() body:unknown,@Req() req:Request){const user=await auth.session(cookies(req)[cookieName]);if(!equal(digest(req.header('X-CSRF-Token')||''),user.csrf_hash))throw new HttpException('请求校验失败。',403);await auth.limit('profile-update',user.id,20,60000);const p=parse(z.object({nickname:z.string().trim().min(1).max(24).optional(),signature:z.string().trim().max(120).optional(),avatarAssetId:z.uuid().nullable().optional()}).strict().refine(p=>Object.keys(p).length>0),body);return auth.updateProfile(user,p)}
  @Delete('me') async remove(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response){const user=await auth.session(cookies(req)[cookieName]);if(!equal(digest(req.header('X-CSRF-Token')||''),user.csrf_hash))throw new HttpException('请求校验失败。',403);await auth.limit('account-delete',user.id,5,600000);const p=parse(z.object({password:z.string().min(1).max(128),confirmation:z.literal('注销账号')}).strict(),body);const result=await deletion.remove(user,p.password);res.clearCookie(cookieName,cookieOptions);try{await assets.cleanupDeletedAccounts()}catch{console.error('Deleted account asset cleanup will be retried.')}return result}
  @Get('me') async me(@Req() req:Request){return auth.bootstrap(cookies(req)[cookieName])}
  @Post('csrf') csrf(@Req() req:Request){return auth.refreshCsrf(cookies(req)[cookieName]||'')}
  @Post('logout') async logout(@Req() req:Request,@Res({passthrough:true}) res:Response){const result=await auth.logout(cookies(req)[cookieName]||'',req.header('X-CSRF-Token')||'');res.clearCookie(cookieName,cookieOptions);return result}
}
@Controller('api') class HealthController {@Get('health') async health(){await db.rows('SELECT 1');return {status:'ok'}}}
@Controller('api/admin/users') class AccountsController {
 @Get() async list(@Req() req:Request){return platform.accounts(await auth.session(cookies(req)[cookieName]))}
 @Patch(':id') async update(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const actor=await auth.session(cookies(req)[cookieName]);if(!equal(digest(req.header('X-CSRF-Token')||''),actor.csrf_hash))throw new HttpException('请求校验失败。',403);const patch=parse(z.object({role:z.enum(['member','admin','super_admin']).optional(),status:z.enum(['active','disabled']).optional()}).strict(),body);return platform.updateAccount(actor,id,patch)}
}
@Module({controllers:[AuthController,HealthController,AccountsController,...businessControllers(db,auth,platform,cookieName,c.AUTH_SECRET)]}) class AppModule {}
let startupStage:StartupStage='database'
async function bootstrap(){
  await db.rows('SELECT id FROM users LIMIT 1')
  startupStage='authentication';await auth.initialize()
  startupStage='application'
  const app=await NestFactory.create(AppModule,{bodyParser:false,logger:['error','warn']})
  app.getHttpAdapter().getInstance().set('trust proxy',c.TRUST_PROXY.split(',').filter(Boolean))
  app.use(json({limit:'128kb'}))
  app.enableCors({origin:c.WEB_ORIGIN,credentials:true,methods:['GET','POST','PATCH','PUT','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token']})
  app.use((req:Request,res:Response,next:()=>void)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff')
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      const source=verifiedRequestOrigin({origin:req.header('origin'),referer:req.header('referer'),fetchSite:req.header('sec-fetch-site'),client:req.header('x-czx-client')},c.WEB_ORIGIN)
      if(!source){res.status(403).json({code:'REQUEST_ORIGIN_REJECTED',message:'无法验证请求来源，请刷新页面后重试，或使用系统浏览器直接打开网站。'});return}
      if(!(req.is('application/json')||(req.path==='/api/uploads'&&req.is('multipart/form-data')))){res.status(415).json({code:'REQUEST_CONTENT_TYPE_INVALID',message:'请求内容类型不正确，请刷新页面后重新提交。'});return}
    }
    next()
  })
  app.useGlobalFilters(new Errors())
  startupStage='listen'
  await app.listen(c.API_PORT,c.API_HOST)
  console.log(`Auth API listening on ${c.API_HOST}:${c.API_PORT}`)
  void assets.cleanupDeletedAccounts().catch(()=>console.error('Deleted account asset cleanup failed'))
  void assets.cleanupPendingDeletes().catch(()=>console.error('Deleted asset file cleanup failed'))
  const cleanup=setInterval(()=>{void Promise.all([assets.cleanupDeletedAccounts(),assets.cleanupPendingDeletes(),db.execute('DELETE FROM forum_view_receipts WHERE expires_at<?',[Date.now()]),db.execute('DELETE FROM auth_sessions WHERE expires_at<?',[Date.now()]),db.execute('DELETE FROM auth_rate_limits WHERE expires_at<?',[Date.now()]),db.execute('DELETE FROM email_verification_challenges WHERE expires_at<?',[Date.now()-86400000])]).catch(()=>console.error('Auth cleanup failed'))},3600000);cleanup.unref()
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{clearInterval(cleanup);void app.close().then(()=>db.pool.end())})
}
bootstrap().catch(error=>{console.error('API startup failed.',startupDiagnostic(error,startupStage));void db.pool.end();process.exitCode=1})
