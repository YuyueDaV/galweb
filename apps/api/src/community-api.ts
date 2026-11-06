import {Controller,Get,Put,Post,Patch,Delete,Body,Param,Query,Req,HttpException} from '@nestjs/common'
import type {Request} from 'express'
import {z} from 'zod'
import {Auth} from './auth'
import {Database} from './database'
import {Platform} from './platform'
import {Forum} from './forum'
import {Community,settingsSchema,draftSchema,entrySchema,librarySchema} from './community'
import {digest,equal} from './security'

export function communityControllers(db:Database,auth:Auth,platform:Platform,cookieName:string){
 const community=new Community(db,platform),forum=new Forum(db,platform)
 const parse=<T>(schema:z.ZodType<T>,body:unknown)=>{const p=schema.safeParse(body);if(!p.success){const message=p.error.issues[0]?.message||'';throw new HttpException(/[\u4e00-\u9fff]/.test(message)?message:'请检查表单字段、字数和链接格式。',422)}return p.data}
 const user=async(req:Request,write=false)=>{const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);const actor=await auth.session(token);if(write&&!equal(digest(req.header('X-CSRF-Token')||''),actor.csrf_hash))throw new HttpException('请求校验失败。',403);return actor}
 const page=(query:unknown)=>parse(z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}),query).page
 @Controller('api') class CommunityController {
  @Get('site-settings') settings(){return community.settings()}
  @Put('admin/site-settings') async settingsSave(@Body() body:unknown,@Req() req:Request){return community.saveSettings(await user(req,true),parse(settingsSchema,body))}
  @Get('forum/draft') async draft(@Req() req:Request){return {draft:await community.draft(await user(req))}}
  @Put('forum/draft') async saveDraft(@Body() body:unknown,@Req() req:Request){const actor=await user(req,true);await auth.limit('draft-save',actor.id,60,60000);return community.saveDraft(actor,parse(draftSchema,body))}
  @Delete('forum/draft') async clearDraft(@Req() req:Request){return community.removeDraft(await user(req,true))}
  @Get('notifications') async inbox(@Req() req:Request,@Query() query:unknown){return community.inbox(await user(req),page(query))}
  @Put('notifications/read') async readAll(@Req() req:Request){return community.read(await user(req,true))}
  @Put('notifications/:id/read') async read(@Req() req:Request,@Param('id') id:string){return community.read(await user(req,true),parse(z.uuid(),id))}
  @Get('users/:id') profile(@Param('id') id:string){return community.profile(parse(z.uuid(),id))}
  @Get('users/:id/posts') async posts(@Param('id') id:string,@Query() query:unknown){await community.profile(parse(z.uuid(),id));return forum.list({page:page(query),limit:12,authorId:id})}
  @Get('users/:id/replies') replies(@Param('id') id:string,@Query() query:unknown){return community.publicReplies(parse(z.uuid(),id),page(query))}
  @Get('library') async library(@Req() req:Request){return community.library((await user(req)).id)}
  @Put('library/:id') async saveLibrary(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){return community.saveLibrary(await user(req,true),parse(z.coerce.number().int().positive(),id),parse(librarySchema,body))}
  @Delete('library/:id') async removeLibrary(@Req() req:Request,@Param('id') id:string){return community.saveLibrary(await user(req,true),parse(z.coerce.number().int().positive(),id),null)}
  @Get('community-entries') entries(@Query() query:unknown){return community.entries(page(query))}
  @Get('admin/community-entries') async adminEntries(@Req() req:Request,@Query() query:unknown){return community.entries(page(query),await user(req))}
  @Post('admin/community-entries') async createEntry(@Req() req:Request,@Body() body:unknown){return community.saveEntry(await user(req,true),parse(entrySchema,body))}
  @Patch('admin/community-entries/:id') async editEntry(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){return community.saveEntry(await user(req,true),parse(entrySchema,body),parse(z.uuid(),id))}
 }
 return [CommunityController]
}
