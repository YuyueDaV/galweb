import { z } from 'zod'
import { reject } from './platform'

const subject = z.object({
  id: z.number().int().positive(),
  type: z.number(),
  name: z.string(),
  name_cn: z.string().optional(),
  summary: z.string().optional(),
  date: z.string().nullable().optional(),
  images: z.object({ large: z.string().optional(), common: z.string().optional() }).optional(),
  rating: z.object({ score: z.number().optional(), total: z.number().optional() }).optional(),
  tags: z.array(z.object({ name: z.string() })).optional(),
  infobox: z.array(z.object({ key: z.string(), value: z.unknown() })).optional(),
})
export interface BangumiSubject {
  id: number
  title: string
  originalTitle: string
  summary: string
  studio: string
  date: string
  coverUrl: string
  score: number | null
  ratingCount: number
  tags: string[]
  syncedAt: number
}
export function bangumiCover(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === 'lain.bgm.tv' &&
      !url.username &&
      !url.password &&
      !url.port && !url.search && !url.hash &&
      /^\/(?:r\/\d+(?:x\d+)?\/)?pic\/cover\/[a-zA-Z0-9/_-]+\.(?:jpe?g|png|webp|gif)$/.test(url.pathname)
      ? url.href
      : ''
  } catch {
    return ''
  }
}
export function normalizeSubject(raw: unknown): BangumiSubject {
  const parsed = subject.safeParse(raw)
  if (!parsed.success) throw reject('Bangumi 返回的数据格式暂不支持，请稍后重试。', 502)
  const item = parsed.data
  if (item.type !== 4) throw reject('只能将 Bangumi 游戏条目加入作品书库。', 422)
  const studio = item.infobox?.find((field) => ['开发', '开发商', '游戏开发商'].includes(field.key))?.value
  return {
    id: item.id,
    title: (item.name_cn || item.name).slice(0, 160),
    originalTitle: item.name.slice(0, 160),
    summary: (item.summary || '').slice(0, 8000),
    studio: typeof studio === 'string' ? studio.slice(0, 200) : '',
    date: (item.date || '').slice(0, 10),
    coverUrl: bangumiCover(item.images?.large || item.images?.common || ''),
    score: item.rating?.score ?? null,
    ratingCount: item.rating?.total || 0,
    tags: [...new Set(item.tags?.map((tag) => tag.name.slice(0, 40)) || [])].slice(0, 16),
    syncedAt: Date.now(),
  }
}
export class Bangumi {
  private cache = new Map<string, { until: number; value: unknown }>()
  constructor(private request: typeof fetch = fetch) {}
  private async json(path: string, body?: object) {
    const key = path + JSON.stringify(body || {})
    const cached = this.cache.get(key)
    if (cached && cached.until > Date.now()) return cached.value
    let response: Response
    try {
      response = await this.request('https://api.bgm.tv/v0/' + path, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'YuyueDaV/galweb/1.0 (https://github.com/YuyueDaV/galweb)',
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw reject('暂时无法连接 Bangumi，请稍后重试；已导入的书库仍可浏览。', 502)
    }
    if (response.status === 404) throw reject('Bangumi 条目不存在或当前无法公开访问。', 404)
    if (response.status === 429) throw reject('Bangumi 请求过于频繁，请稍后再试。', 429)
    if (!response.ok) throw reject('Bangumi 暂时无法提供此数据，请稍后重试。', 502)
    let value: unknown
    try {
      const text = await response.text()
      if (text.length > 2_000_000) throw new Error('oversized')
      value = JSON.parse(text)
    } catch {
      throw reject('Bangumi 返回的数据无法读取，请稍后重试。', 502)
    }
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(key, { until: Date.now() + 300000, value })
    return value
  }
  async search(keyword: string, page: number) {
    const raw = await this.json('search/subjects?limit=10&offset=' + (page - 1) * 10, {
      keyword,
      sort: 'match',
      filter: { type: [4] },
    })
    const result = z.object({ total: z.number(), data: z.array(z.unknown()) }).safeParse(raw)
    if (!result.success) throw reject('Bangumi 搜索结果格式暂不支持，请稍后重试。', 502)
    return { items: result.data.data.map(normalizeSubject), total: result.data.total, page }
  }
  async detail(id: number) {
    const item = normalizeSubject(await this.json('subjects/' + id))
    if (item.id !== id) throw reject('Bangumi 条目编号不匹配。', 502)
    return item
  }
}
