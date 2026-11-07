import { Body,Controller,Get,Post,Patch,Put,Delete,Param,Query,Req,Res,HttpException,UseInterceptors,UploadedFile,UseGuards,type CanActivate,type ExecutionContext } from '@nestjs/common'
import {FileInterceptor} from '@nestjs/platform-express'
import type { Request,Response } from 'express'
import { z } from 'zod'
import { Auth } from './auth'
import { Database } from './database'
import { Platform } from './platform'
import { Forum } from './forum'
import { digest,equal,mac } from './security'
import { Awards } from './awards'
import {Assets} from './assets'
import {readFile} from 'node:fs/promises'
import {communityControllers} from './community-api'
export const validate=<T>(schema:z.ZodType<T>,body:unknown)=>{const result=schema.safeParse(body);if(!result.success){const message=result.error.issues[0]?.message||'';throw new HttpException(/[\u4e00-\u9fff]/.test(message)?message:'请求字段无效。',422)}return result.data}
export function businessControllers(db:Database,auth:Auth,platform:Platform,cookieName:string,viewSecret:string){
 const forum=new Forum(db,platform)
 const awards=new Awards(db,platform)
 const assets=new Assets(db,platform)
 const sendImage=async(filename:string,res:Response)=>{
  let contents:Buffer
  try{contents=await readFile(filename)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new HttpException('图片不存在。',404);throw error}
  res.setHeader('Content-Type','image/webp');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Cache-Control','private, no-store');return res.send(contents)
 }
 const sessionToken=(req:Request)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
 const actor=async(req:Request,write=false)=>{const u=await auth.session(sessionToken(req));if(write&&!equal(digest(req.header('X-CSRF-Token')||''),u.csrf_hash))throw new HttpException('请求校验失败。',403);return u}
 const optional=async(req:Request)=>{if(!sessionToken(req))return undefined;try{return await actor(req)}catch(e){if(e instanceof HttpException&&e.getStatus()===401)return undefined;throw e}}
 const category=z.enum(['作品讨论','阅读手记','同好闲聊','社团活动'])
 @Controller('api') class ForumController{
  @Get('posts') async list(@Query() q:unknown,@Req() req:Request){const p=validate(z.object({q:z.string().trim().max(100).optional(),category:category.optional(),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(30),saved:z.enum(['true','false']).optional(),sort:z.enum(['latest','hot']).optional(),tab:z.enum(['latest','featured','unanswered']).optional(),authorId:z.uuid().optional(),workId:z.coerce.number().int().positive().optional()}),q);return forum.list({...p,saved:p.saved==='true'},await optional(req))}
  @Get('posts/:id') async detail(@Param('id') id:string,@Req() req:Request){return forum.detail(id,await optional(req))}
  @Post('posts/:id/views') async view(@Param('id') id:string,@Req() req:Request){return forum.recordView(id,mac(viewSecret,JSON.stringify(['post-view',req.ip,req.header('user-agent')||''])))}
  @Post('posts') async create(@Body() body:unknown,@Req() req:Request){const u=await actor(req,true);await auth.limit('post-create',u.id,10,60000);return forum.create(u,validate(z.object({title:z.string().trim().min(4,'标题至少需要 4 个字符。').max(80,'标题最多 80 个字符。'),content:z.string().trim().min(10,'正文至少需要 10 个字符。').max(10000,'正文最多 10000 个字符。'),category,spoiler:z.boolean().default(false),image:z.number().int().min(1).max(12).optional(),assetId:z.uuid().optional(),assetIds:z.array(z.uuid()).max(12).optional(),format:z.enum(['plain','markdown']).optional(),workId:z.number().int().positive().nullable().optional()}).strict(),body))}
  @Patch('posts/:id') async edit(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){return forum.edit(await actor(req,true),id,validate(z.object({title:z.string().trim().min(4).max(80).optional(),content:z.string().trim().min(10,'正文至少需要 10 个字符。').max(10000,'正文最多 10000 个字符。').optional(),status:z.enum(['published','hidden','deleted']).optional(),pinned:z.boolean().optional(),featured:z.boolean().optional(),format:z.enum(['plain','markdown']).optional(),workId:z.number().int().positive().nullable().optional(),assetIds:z.array(z.uuid()).max(12).optional(),spoiler:z.boolean().optional()}).strict(),body))}
  @Get('posts/:id/replies') async replies(@Param('id') id:string,@Req() req:Request){return forum.replies(id,await optional(req))}
  @Post('posts/:id/replies') async reply(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const u=await actor(req,true);await auth.limit('reply-create',u.id,30,60000);const p=validate(z.object({content:z.string().trim().min(1).max(3000),parentId:z.uuid().optional()}).strict(),body);return forum.reply(u,id,p.content,p.parentId)}
  @Put('posts/:id/reactions') async reaction(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const p=validate(z.object({kind:z.enum(['like','bookmark']),active:z.boolean()}).strict(),body);return forum.reaction(await actor(req,true),id,p.kind,p.active)}
  @Get('forum/me') async mine(@Req() req:Request){return forum.mine(await actor(req))}
  @Get('works') async works(){return (await db.rows<{data:unknown}>('SELECT data FROM works ORDER BY id')).map(r=>typeof r.data==='string'?JSON.parse(r.data):r.data)}
  @Get('admin/posts') async adminPosts(@Req() req:Request){return forum.adminPosts(await actor(req))}
  @Get('admin/replies') async adminReplies(@Req() req:Request){return forum.adminReplies(await actor(req))}
  @Patch('admin/replies/:id') async moderate(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){return forum.moderateReply(await actor(req,true),id,validate(z.object({status:z.enum(['published','hidden','deleted'])}).strict(),body).status)}
 }
 const phase=z.enum(['draft','nomination','voting','results','archived'])
 @Controller('api') class AwardsController{
  @Get('award-campaigns') campaigns(){return awards.campaigns()}
  @Get('award-campaigns/:id') async state(@Param('id') id:string,@Req() req:Request){return awards.state(id,await optional(req))}
  @Post('admin/award-campaigns') async create(@Req() req:Request){return awards.create(await actor(req,true))}
  @Patch('admin/award-campaigns/:id') async settings(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const nullable=z.string().datetime({offset:true}).nullable();const p=validate(z.object({id:z.string(),edition:z.number().int(),title:z.string().trim().min(1).max(80),phase,nominationLimit:z.number().int().min(1).max(100),voteLimit:z.number().int().min(1).max(100),winnerCount:z.number().int().min(1).max(100),nominationStart:nullable,nominationEnd:nullable,votingStart:nullable,votingEnd:nullable,createdAt:z.string(),version:z.number().int().min(0)}).strict(),body);await awards.settings(await actor(req,true),id,p);return {message:'设置已保存。'}}
  @Post('admin/award-campaigns/:id/transitions') async advance(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const p=validate(z.object({phase,version:z.number().int().min(0)}).strict(),body);await awards.phase(await actor(req,true),id,p.phase,p.version);return {message:'阶段已更新。'}}
  @Post('award-campaigns/:id/nominations') async nominate(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const p=validate(z.object({title:z.string().trim().min(1).max(80),studio:z.string().trim().max(80),reason:z.string().trim().min(10).max(600)}).strict(),body);const user=await actor(req,true);await auth.limit('award-nomination',user.id,20,60000);return awards.nominate(user,id,p.title,p.studio,p.reason)}
  @Patch('award-campaigns/:id/nominations/:nominationId') async nomination(@Param('id') id:string,@Param('nominationId') nominationId:string,@Body() body:unknown,@Req() req:Request){const p=validate(z.object({status:z.enum(['withdrawn','approved','rejected']),note:z.string().trim().max(300).default('')}).strict(),body);await awards.nominationAction(await actor(req,true),id,nominationId,p.status,p.note);return {message:'提名已更新。'}}
  @Put('award-campaigns/:id/ballot') async vote(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const p=validate(z.object({candidateIds:z.array(z.string()).max(100).nullable(),version:z.number().int().min(0)}).strict(),body);const user=await actor(req,true);await auth.limit('award-vote',user.id,60,60000);await awards.vote(user,id,p.candidateIds,p.version);return {message:'选票已保存。'}}
 }
 class UploadGuard implements CanActivate {async canActivate(context:ExecutionContext){await actor(context.switchToHttp().getRequest(),true);return true}}
 @Controller('api') class AssetsController{
  @Get('admin/assets') async list(@Req() req:Request){return assets.list(await actor(req))}
  @Post('uploads') @UseGuards(UploadGuard) @UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:0}})) async upload(@UploadedFile() file:{buffer:Buffer}|undefined,@Req() req:Request){const user=await actor(req,true);await auth.limit('uploads',user.id,20,600000);if(!file)throw new HttpException('请选择图片。',422);return assets.create(user,file.buffer)}
  @Get('assets/:id') async image(@Param('id') id:string,@Res() res:Response){return sendImage(await assets.file(id),res)}
  @Get('admin/assets/:id') async preview(@Param('id') id:string,@Req() req:Request,@Res() res:Response){return sendImage(await assets.adminFile(await actor(req),id),res)}
  @Patch('admin/assets/:id') async moderate(@Param('id') id:string,@Body() body:unknown,@Req() req:Request){const user=await actor(req,true);const patch=validate(z.object({status:z.enum(['active','hidden'])}).strict(),body);return assets.moderate(user,id,patch.status)}
  @Delete('admin/assets/:id') async hide(@Param('id') id:string,@Req() req:Request){return assets.hide(await actor(req,true),id)}
 }
 return [ForumController,AwardsController,AssetsController,...communityControllers(db,auth,platform,cookieName)]
}
