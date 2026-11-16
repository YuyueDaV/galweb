import { Body, Controller, Delete, Get, HttpException, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { Database } from './database'
import { Auth } from './auth'
import { Platform } from './platform'
import type { Config } from './config'
import { digest, equal } from './security'
import { OAuth, oauthReturnPath } from './oauth'
import { oauthLabel } from './oauth-providers'

export function oauthControllers(
  db: Database,
  auth: Auth,
  platform: Platform,
  cookieName: string,
  config: Config,
  oauth = new OAuth(db, auth, platform, config),
) {
  const cookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
  const flowCookie = config.NODE_ENV === 'production' ? '__Host-czx_oauth' : 'czx_oauth'
  const cookie = (req: Request, name: string) =>
    (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(name + '='))
      ?.slice(name.length + 1)
  const parse = <T>(schema: z.ZodType<T>, value: unknown) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) throw new HttpException('授权请求不正确，请重新尝试。', 422)
    return parsed.data
  }
  const provider = z.enum(['qq', 'discord'])
  const actor = async (req: Request) => {
    const user = await auth.session(cookie(req, cookieName))
    if (!equal(digest(req.header('X-CSRF-Token') || ''), user.csrf_hash))
      throw new HttpException('请求校验失败。', 403)
    return user
  }
  @Controller('api/auth')
  class OAuthController {
    @Get('oauth/providers') providers() {
      return oauth.options()
    }
    @Get('oauth/bindings') async bindings(@Req() req: Request) {
      const user = await auth.session(cookie(req, cookieName))
      return oauth.bindings(user.id)
    }
    @Post('oauth/:provider/start') async start(
      @Param('provider') value: string,
      @Body() body: unknown,
      @Req() req: Request,
      @Res({ passthrough: true }) res: Response,
    ) {
      const kind = parse(provider, value)
      const input = parse(
        z
          .object({ mode: z.enum(['login', 'bind']), returnTo: z.string().max(1000).default('/account') })
          .strict(),
        body,
      )
      if (input.mode === 'bind') await actor(req)
      await auth.limit('oauth-start', req.ip || 'unknown', 20, 60000)
      const result = await oauth.start(kind, input.mode, input.returnTo, cookie(req, cookieName))
      res.cookie(flowCookie, result.browser, { ...cookieOptions, maxAge: 600000 })
      return { url: result.url }
    }
    @Get('oauth/:provider/callback') async callback(
      @Param('provider') value: string,
      @Query() query: unknown,
      @Req() req: Request,
      @Res() res: Response,
    ) {
      const kind = parse(provider, value)
      res.setHeader('Referrer-Policy', 'no-referrer')
      let returnTo = '/account',
        status = 'error',
        message = '授权未能完成，请重新尝试。'
      try {
        const input = parse(
          z.object({
            state: z.string().max(128),
            code: z.string().max(4096).optional(),
            error: z.string().max(200).optional(),
            iss: z.string().max(200).optional(),
          }),
          query,
        )
        await auth.limit('oauth-callback', req.ip || 'unknown', 60, 60000)
        const result = await oauth.callback(
          kind,
          input,
          cookie(req, flowCookie) || '',
          cookie(req, cookieName),
        )
        returnTo = result.returnTo
        status = result.mode === 'login' ? 'login' : 'bound'
        message = oauthLabel(kind) + (result.mode === 'login' ? '登录成功。' : '绑定成功。')
        if (result.mode === 'login')
          res.cookie(cookieName, result.session.session, { ...cookieOptions, maxAge: 7 * 86400000 })
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() < 500) message = error.message
        const path = (error as { oauthReturnTo?: string }).oauthReturnTo
        if (path) returnTo = oauthReturnPath(path, config.WEB_ORIGIN)
      }
      res.clearCookie(flowCookie, cookieOptions)
      const target = new URL(returnTo, config.WEB_ORIGIN)
      target.searchParams.set('oauth', status)
      target.searchParams.set('oauth_provider', kind)
      target.searchParams.set('oauth_message', message)
      return res.redirect(303, target.toString())
    }
    @Delete('oauth/:provider') async unlink(@Param('provider') value: string, @Req() req: Request) {
      const user = await actor(req)
      await auth.limit('oauth-unlink', user.id, 10, 60000)
      return oauth.unlink(user.id, parse(provider, value), cookie(req, cookieName)!)
    }
    @Post('credentials') async credentials(@Body() body: unknown, @Req() req: Request) {
      const user = await actor(req)
      await auth.limit('oauth-credentials', user.id, 10, 60000)
      const input = parse(
        z
          .object({
            email: z
              .string()
              .trim()
              .max(254)
              .email()
              .regex(/^[\x21-\x7e]+$/),
            challengeId: z.uuid(),
            code: z.string().regex(/^\d{6}$/),
            password: z.string().min(12).max(128),
            confirmPassword: z.string().min(12).max(128),
          })
          .strict(),
        body,
      )
      return auth.completeCredentials(user.id, input, cookie(req, cookieName)!)
    }
  }
  return [OAuthController]
}
