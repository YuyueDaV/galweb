import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
  Res,
  HttpException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { Auth } from './auth'
import { Database } from './database'
import { Platform, staff } from './platform'
import { digest, equal } from './security'
import { Catalog, workContributionSchema, workEditSchema, tierSchema, catalogOrderSchema } from './catalog'
import type { Bangumi } from './bangumi'
import { BangumiCovers } from './bangumi-covers'
import { TierVoting, tierBallotSchema } from './tier-voting'

export function catalogControllers(
  db: Database,
  auth: Auth,
  platform: Platform,
  cookieName: string,
  bangumi?: Bangumi,
) {
  const catalog = new Catalog(db, platform, bangumi)
  const voting = new TierVoting(db, platform)
  const covers = new BangumiCovers()
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
  const actor = async (req: Request, write = false, requireStaff = true) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1)
    const user = await auth.session(token)
    if (requireStaff) staff(user)
    if (write && !equal(digest(req.header('X-CSRF-Token') || ''), user.csrf_hash))
      throw new HttpException('请求校验失败。', 403)
    return user
  }
  @Controller('api')
  class CatalogController {
    @Get('works') works() {
      return catalog.publicWorks()
    }
    @Post('works') async contribute(@Req() req: Request, @Body() body: unknown) {
      const user = await actor(req, true, false)
      await auth.limit('work-contribution', user.id, 10, 3600000)
      return catalog.contribute(user, parse(workContributionSchema, body))
    }
    @Patch('works/:id/cover') async coverUpdate(
      @Req() req: Request,
      @Param('id') value: string,
      @Body() body: unknown,
    ) {
      const user = await actor(req, true, false)
      const input = parse(
        z.object({ coverAssetId: z.uuid().nullable(), version: z.number().int().min(0) }).strict(),
        body,
      )
      return catalog.changeCover(user, id(value), input.coverAssetId, input.version)
    }
    @Get('bangumi/subjects/:id') async subject(
      @Req() req: Request,
      @Param('id') value: string,
      @Query() query: unknown,
    ) {
      const input = parse(
        z.object({ includeRestricted: z.enum(['true', 'false']).default('false') }).strict(),
        query,
      )
      if (input.includeRestricted === 'true') await actor(req, false, false)
      await auth.limit('bangumi-public-detail', req.ip || 'unknown', 30, 60000)
      return catalog.bangumi.detail(id(value), input.includeRestricted === 'true')
    }
    @Get('works/:id') work(@Param('id') value: string) {
      return catalog.detail(id(value))
    }
    @Get('admin/works') async adminWorks(@Req() req: Request) {
      await actor(req)
      return catalog.publicWorks()
    }
    @Put('admin/works/order') async reorder(@Req() req: Request, @Body() body: unknown) {
      const user = await actor(req, true)
      return catalog.reorder(user, parse(catalogOrderSchema, body))
    }
    @Get('bangumi/cover') async cover(@Req() req: Request, @Query() query: unknown, @Res() res: Response) {
      const input = parse(z.object({ image: z.string().min(1).max(2000) }).strict(), query)
      await auth.limit('bangumi-cover', req.ip || 'unknown', 180, 60000)
      const image = await covers.image(input.image)
      res.setHeader('Content-Type', 'image/webp')
      res.setHeader('Cache-Control', 'private, max-age=86400')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
      return res.send(image)
    }
    @Get('bangumi/search') async search(@Req() req: Request, @Query() query: unknown) {
      const input = parse(
        z
          .object({
            q: z.string().trim().min(1).max(100),
            page: z.coerce.number().int().min(1).max(100).default(1),
            includeRestricted: z.enum(['true', 'false']).default('false'),
          })
          .strict(),
        query,
      )
      if (input.includeRestricted === 'true') await actor(req, false, false)
      await auth.limit('bangumi-public-search', req.ip || 'unknown', 30, 60000)
      return catalog.bangumi.search(input.q, input.page, input.includeRestricted === 'true')
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
    @Delete('admin/works/:id') async remove(
      @Req() req: Request,
      @Param('id') value: string,
      @Body() body: unknown,
    ) {
      const user = await actor(req, true)
      const input = parse(z.object({ version: z.number().int().min(0) }).strict(), body)
      return catalog.remove(user, id(value), input.version)
    }
    @Get('tier-lists') tiers() {
      return catalog.tiers()
    }
    @Get('tier-lists/:id') tier(@Param('id') value: string) {
      return catalog.tierDetail(parse(z.uuid(), value))
    }
    @Get('tier-lists/:id/ballot') async myBallot(@Req() req: Request, @Param('id') value: string) {
      return voting.mine(await actor(req, false, false), parse(z.uuid(), value))
    }
    @Put('tier-lists/:id/ballot') async saveBallot(
      @Req() req: Request,
      @Param('id') value: string,
      @Body() body: unknown,
    ) {
      const user = await actor(req, true, false)
      await auth.limit('tier-ballot', user.id, 30, 60000)
      return voting.save(user, parse(z.uuid(), value), parse(tierBallotSchema, body))
    }
    @Get('my/tier-lists') async myTiers(@Req() req: Request) {
      return catalog.myTiers(await actor(req, false, false))
    }
    @Post('my/tier-lists') async createPersonal(@Req() req: Request, @Body() body: unknown) {
      const user = await actor(req, true, false)
      await auth.limit('tier-personal-create', user.id, 20, 60000)
      return catalog.createTier(
        user,
        parse(z.object({ title: z.string().trim().min(1).max(80) }).strict(), body).title,
        true,
      )
    }
    @Put('my/tier-lists/:id') async savePersonal(
      @Req() req: Request,
      @Param('id') value: string,
      @Body() body: unknown,
    ) {
      return catalog.saveTier(
        await actor(req, true, false),
        parse(z.uuid(), value),
        parse(tierSchema, body),
        true,
      )
    }
    @Post('my/tier-works/import') async importPersonalWork(@Req() req: Request, @Body() body: unknown) {
      const user = await actor(req, true, false)
      await auth.limit('tier-work-import', user.id, 20, 60000)
      return catalog.importTierWork(
        user,
        parse(z.object({ subjectId: z.number().int().positive().max(2147483647) }).strict(), body).subjectId,
      )
    }
    @Get('admin/tier-lists') async adminTiers(@Req() req: Request) {
      return catalog.tiers(await actor(req))
    }
    @Get('admin/tier-moderation') async moderation(@Req() req: Request) {
      return catalog.moderation(await actor(req))
    }
    @Patch('admin/tier-lists/:id/moderation') async moderatePersonal(
      @Req() req: Request,
      @Param('id') value: string,
      @Body() body: unknown,
    ) {
      const user = await actor(req, true),
        input = parse(z.object({ version: z.number().int().min(0), blocked: z.boolean() }).strict(), body)
      return catalog.moderatePersonal(user, parse(z.uuid(), value), input.version, input.blocked)
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
