import test from 'node:test'
import assert from 'node:assert/strict'
import { Bangumi, bangumiCover, normalizeSubject } from '../src/bangumi'

const raw = {
  id: 13,
  type: 4,
  name: 'CLANNAD',
  name_cn: '',
  summary: '原站简介',
  rating: { score: 8.9, total: 123 },
  images: { large: 'https://lain.bgm.tv/pic/cover/l/test.jpg' },
  tags: [{ name: 'Key' }],
  infobox: [{ key: '开发', value: 'Key' }],
}
test('Bangumi 元数据：游戏类型、字段规范化和封面域名白名单', () => {
  const item = normalizeSubject(raw)
  assert.equal(item.title, 'CLANNAD')
  assert.equal(item.studio, 'Key')
  assert.equal(item.score, 8.9)
  assert.equal(
    bangumiCover('https://lain.bgm.tv/r/400/pic/cover/l/test.jpg'),
    'https://lain.bgm.tv/r/400/pic/cover/l/test.jpg',
  )
  assert.throws(() => normalizeSubject({ ...raw, type: 2 }), /游戏/)
  for (const url of [
    'http://lain.bgm.tv/pic/cover/a.jpg',
    'https://evil.example/pic/cover/a.jpg',
    'https://user:pass@lain.bgm.tv/pic/cover/a.jpg',
    'https://lain.bgm.tv:4430/pic/cover/a.jpg',
    'javascript:alert(1)',
  ])
    assert.equal(bangumiCover(url), '')
})
test('Bangumi 搜索使用公开官方 v0 游戏搜索，携带标识并缓存相同请求', async () => {
  const calls: { url: string; options?: RequestInit }[] = []
  const client = new Bangumi(async (url, options) => {
    calls.push({ url: String(url), options })
    return Response.json({ total: 1, data: [raw] })
  })
  assert.equal((await client.search('CLANNAD', 2)).items[0]!.id, 13)
  await client.search('CLANNAD', 2)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.url, 'https://api.bgm.tv/v0/search/subjects?limit=10&offset=10')
  assert.deepEqual(JSON.parse(String(calls[0]!.options!.body)), {
    keyword: 'CLANNAD',
    sort: 'match',
    filter: { type: [4] },
  })
  assert.match(new Headers(calls[0]!.options!.headers).get('User-Agent')!, /YuyueDaV\/galweb/)
  assert.equal(calls[0]!.options!.redirect, 'error')
})
test('Bangumi 失败显示可读错误，不泄漏上游响应正文；拒绝错号与损坏响应', async () => {
  for (const [status, message] of [
    [404, /不存在/],
    [429, /频繁/],
    [500, /暂时/],
  ] as const) {
    const client = new Bangumi(async () => new Response('private upstream trace', { status }))
    await assert.rejects(() => client.detail(13), message)
  }
  await assert.rejects(
    () =>
      new Bangumi(async () => {
        throw new Error('private socket trace')
      }).detail(13),
    /无法连接/,
  )
  await assert.rejects(() => new Bangumi(async () => new Response('not json')).detail(13), /无法读取/)
  await assert.rejects(() => new Bangumi(async () => Response.json(raw)).detail(14), /编号不匹配/)
})
