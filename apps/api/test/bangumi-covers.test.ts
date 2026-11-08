import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readdir, utimes } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { BangumiCovers } from '../src/bangumi-covers'
import { bangumiImageSource } from '../../web/app/utils/bangumi-image'

const source = 'https://lain.bgm.tv/pic/cover/l/f6/cc/385984_D7Lj5.jpg'
async function temporary() {
  const base = path.resolve('.data')
  await mkdir(base, { recursive: true })
  return mkdtemp(path.join(base, 'cover-tests-'))
}
async function cleanup(directory: string) {
  assert.ok(path.resolve(directory).startsWith(path.resolve('.data') + path.sep))
  assert.ok(path.basename(directory).startsWith('cover-tests-'))
  await rm(directory, { recursive: true, force: true })
}

test('封面同源转换兼容已有书库，下载去重、重编码、磁盘复用及上游离线回退', async () => {
  const directory = await temporary()
  try {
    const raw = await sharp({ create: { width: 1400, height: 2100, channels: 3, background: '#abcdef' } })
      .jpeg()
      .toBuffer()
    let calls = 0
    const covers = new BangumiCovers(async (url, options) => {
      calls++
      assert.equal(String(url), source)
      assert.equal(options?.redirect, 'error')
      return new Response(raw, { headers: { 'content-type': 'image/jpeg' } })
    }, directory)
    const images = await Promise.all(Array.from({ length: 8 }, () => covers.image(source)))
    assert.equal(calls, 1)
    assert.ok(images.every((b) => b.equals(images[0]!)))
    const metadata = await sharp(images[0]).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 960)
    const cached = new BangumiCovers(async () => {
      throw new Error('must not use network')
    }, directory)
    assert.deepEqual(await cached.image(source), images[0])
    const files = await readdir(directory)
    assert.equal(files.length, 1)
    const expired = new Date(Date.now() - 8 * 86400000)
    await utimes(path.join(directory, files[0]!), expired, expired)
    assert.deepEqual(await cached.image(source), images[0], '上游离线仍使用已缓存封面')
    assert.equal(bangumiImageSource(source), '/api/bangumi/cover?image=' + encodeURIComponent(source))
    assert.equal(bangumiImageSource('/images/covers/one.webp'), '/images/covers/one.webp')
  } finally {
    await cleanup(directory)
  }
})

test('封面接口拒绝任意外站、内网、重定向、非图片及超限内容；失败短暂退避', async () => {
  const directory = await temporary()
  try {
    let calls = 0
    const denied = new BangumiCovers(async () => {
      calls++
      throw new Error('private upstream details')
    }, directory)
    for (const url of [
      'http://127.0.0.1/',
      'https://evil.example/image.jpg',
      'https://lain.bgm.tv:4430/pic/cover/l/test.jpg',
      'https://lain.bgm.tv/pic/cover/l/test.jpg?redirect=http://localhost',
      'https://lain.bgm.tv/pic/user/l/test.jpg',
      'https://lain.bgm.tv/pic/cover/l/test.svg',
    ])
      await assert.rejects(() => denied.image(url), /无效/)
    assert.equal(calls, 0)
    for (let i = 0; i < 2; i++) await assert.rejects(() => denied.image(source), /封面暂时无法获取/)
    assert.equal(calls, 1)
    for (const response of [
      new Response('redirect', { status: 302, headers: { location: 'http://127.0.0.1/' } }),
      new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
      new Response('html', { headers: { 'content-type': 'image/jpeg' } }),
      new Response('big', {
        headers: { 'content-type': 'image/jpeg', 'content-length': String(6 * 1024 * 1024) },
      }),
      new Response(Buffer.alloc(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } }),
    ]) {
      const invalid = new BangumiCovers(async () => response, directory)
      await assert.rejects(() => invalid.image(source), /封面暂时无法获取/)
    }
  } finally {
    await cleanup(directory)
  }
})

test('不同封面并发受限，同一封面的请求合并', async () => {
  const directory = await temporary()
  try {
    const raw = await sharp({ create: { width: 20, height: 30, channels: 3, background: 'blue' } })
      .png()
      .toBuffer()
    let active = 0,
      peak = 0,
      calls = 0
    const covers = new BangumiCovers(async () => {
      active++
      calls++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 30))
      active--
      return new Response(raw, { headers: { 'content-type': 'image/png' } })
    }, directory)
    await Promise.all(
      Array.from({ length: 9 }, (_, i) => covers.image(source.replace('385984', '38598' + i))),
    )
    assert.equal(calls, 9)
    assert.ok(peak <= 3)
  } finally {
    await cleanup(directory)
  }
})
