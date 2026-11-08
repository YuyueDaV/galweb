import { Controller, Get, Post, Put, Patch, Body, Query, Param, Req, HttpException } from '@nestjs/common'
import type { Request } from 'express'
import { z } from 'zod'
import { Auth } from './auth'
import { Database } from './database'
import { Platform, staff } from './platform'
import { digest, equal } from './security'
import { Catalog, workEditSchema, tierSchema } from './catalog'
import type { Bangumi } from './bangumi'

export function catalogControllers(
  db: Database,
  auth: Auth,
  platform: Platform,
  cookieName: string,
  bangumi?: Bangumi,
) {
  const catalog = new Catalog(db, platform, bangumi)
  const parse = <T>(schema: z.ZodType<T>, body: unknown) => {
    const result = schema.safeParse(body)
    if (!result.success)
      throw new HttpException(
        result.error.issues[0]?.message.match(/[\u4e00-\u9fff]/)
          ? result.error.issues[0]!.message
          : '请检查表单字段及编号。',
        422,
      )
    return result.data
  }
  const id = (value: string) => parse(z.coerce.number().int().positive().max(2147483647), value)
  const actor = async (req: Request, write = false) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1)
    const user = await auth.session(token)
    staff(user)
    if (write && !equal(digest(req.header('X-CSRF-Token') || ''), user.csrf_hash))
      throw new HttpException('请求校验失败。', 403)
    return user
  }
  @Controller('api')
  class CatalogController {
    @Get('works') works() {
      return catalog.works()
    }
    @Get('works/:id') work(@Param('id') value: string) {
      return catalog.detail(id(value))
    }
    @Get('admin/works') async adminWorks(@Req() req: Request) {
      await actor(req)
      return catalog.works()
    }
    @Get('bangumi/search') async search(@Req() req: Request, @Query() query: unknown) {
      const input = parse(
        z
          .object({
            q: z.string().trim().min(1).max(100),
            page: z.coerce.number().int().min(1).max(100).default(1),
          })
          .strict(),
        query,
      )
      await auth.limit('bangumi-public-search', req.ip || 'unknown', 30, 60000)
      return catalog.bangumi.search(input.q, input.page)
    }
    @Post('admin/works/import') async importWork(@Req() req: Request, @Body() body: unknown) {
      const user = await actor(req, true)
      const input = parse(
        z
          .object({
            subjectId: z.number().int().positive().max(2147483647),
            existingWorkId: z.number().int().positive().optional(),
            version: z.number().int().min(0).optional(),
          })
          .strict()
          .refine(
            (input) => !input.existingWorkId || input.version !== undefined,
            '关联已有作品时请先刷新书库。',
          ),
        body,
      )
      await auth.limit('bangumi-import', user.id, 20, 60000)
      return catalog.import(user, input.subjectId, input.existingWorkId, input.version)
    }
    @Patch('admin/works/:id') async edit(
      @Req() req: Request,
      @Param('id') value: string,
      @Body() body: unknown,
    ) {
      return catalog.edit(await actor(req, true), id(value), parse(workEditSchema, body))
    }
    @Get('tier-lists') tiers() {
      return catalog.tiers()
    }
    @Get('tier-lists/:id') tier(@Param('id') value: string) {
      return catalog.tierDetail(parse(z.uuid(), value))
    }
    @Get('admin/tier-lists') async adminTiers(@Req() req: Request) {
      return catalog.tiers(await actor(req))
    }
    @Get('admin/tier-lists/:id') async adminTier(@Req() req: Request, @Param('id') value: string) {
      return catalog.tierDetail(parse(z.uuid(), value), await actor(req))
    }
    @Post('admin/tier-lists') async createTier(@Req() req: Request, @Body() body: unknown) {
      const user = await actor(req, true)
      await auth.limit('tier-create', user.id, 20, 60000)
      return catalog.createTier(
        user,
        parse(z.object({ title: z.string().trim().min(1).max(80) }).strict(), body).title,
      )
    }
    @Put('admin/tier-lists/:id') async saveTier(
      @Req() req: Request,
      @Param('id') value: string,
      @Body() body: unknown,
    ) {
      return catalog.saveTier(await actor(req, true), parse(z.uuid(), value), parse(tierSchema, body))
    }
  }
  return [CatalogController]
}
