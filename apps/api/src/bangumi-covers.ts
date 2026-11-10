import sharp from 'sharp'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile, rename, unlink, readdir } from 'node:fs/promises'
import path from 'node:path'
import { bangumiCover } from './bangumi'
import { reject } from './platform'

const MAX_BYTES = 5 * 1024 * 1024,
  FRESH = 7 * 86400000
class TransientCoverError extends Error {}
export class BangumiCovers {
  private pending = new Map<string, Promise<Buffer>>()
  private failures = new Map<string, number>()
  private active = 0
  private waiting: (() => void)[] = []
  constructor(
    private request: typeof fetch = fetch,
    readonly directory = path.resolve(process.env.UPLOAD_DIR || '.data/uploads', '.cache/bangumi-covers'),
  ) {}
  async image(source: string): Promise<Buffer> {
    const url = bangumiCover(source)
    if (!url || url !== source) throw reject('封面地址无效。', 422)
    const key = createHash('sha256').update(url).digest('hex')
    const running = this.pending.get(key)
    if (running) return running
    const task = this.load(url, key)
    this.pending.set(key, task)
    try {
      return await task
    } finally {
      this.pending.delete(key)
    }
  }
  private async load(url: string, key: string) {
    const filename = path.join(this.directory, key + '.webp')
    let cached: Buffer | undefined
    try {
      const info = await stat(filename)
      if (info.size <= 2 * 1024 * 1024) {
        cached = await readFile(filename)
        if (Date.now() - info.mtimeMs < FRESH) return cached
      }
    } catch {}
    if ((this.failures.get(key) || 0) > Date.now()) {
      if (cached) return cached
      throw reject('封面暂时无法获取，请稍后重试。', 502)
    }
    try {
      const image = await this.download(url)
      try {
        await mkdir(this.directory, { recursive: true })
        const temporary = filename + '.' + randomUUID() + '.tmp'
        try {
          await writeFile(temporary, image, { mode: 0o600 })
          await rename(temporary, filename)
        } finally {
          await unlink(temporary).catch(() => {})
        }
        await this.prune()
      } catch {
        console.error('Bangumi cover cache write failed')
      }
      this.failures.delete(key)
      return image
    } catch {
      if (this.failures.size >= 256) this.failures.delete(this.failures.keys().next().value!)
      this.failures.set(key, Date.now() + 30000)
      if (cached) return cached
      throw reject('封面暂时无法获取，请稍后重试。', 502)
    }
  }
  private async download(url: string) {
    if (this.active < 3) this.active++
    else {
      if (this.waiting.length >= 24) throw new Error('busy')
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          clearTimeout(timer)
          resolve()
        }
        const timer = setTimeout(() => {
          const i = this.waiting.indexOf(ready)
          if (i >= 0) this.waiting.splice(i, 1)
          reject(new Error('queue timeout'))
        }, 12000)
        this.waiting.push(ready)
      })
    }
    try {
      let bytes: Buffer | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          bytes = await this.fetchBytes(url)
          break
        } catch (error) {
          if (!(error instanceof TransientCoverError) || attempt === 1) throw error
        }
      }
      const image = sharp(bytes!, { limitInputPixels: 20000000, animated: false })
      const metadata = await image.metadata()
      if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) throw new Error('format')
      const output = await image
        .rotate()
        .resize({ width: 960, height: 1440, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
      if (output.length > 2 * 1024 * 1024) throw new Error('size')
      return output
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.active--
    }
  }
  private async fetchBytes(url: string): Promise<Buffer> {
    let response: Response
    try {
      response = await this.request(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'YuyueDaV/galweb (https://github.com/YuyueDaV/galweb)',
          Accept: 'image/webp,image/jpeg,image/png,image/gif',
        },
      })
    } catch {
      throw new TransientCoverError('network')
    }
    if (response.status >= 500) {
      await response.body?.cancel()
      throw new TransientCoverError('upstream unavailable')
    }
    if (
      !response.ok ||
      !/^image\/(jpeg|png|webp|gif)(?:;|$)/i.test(response.headers.get('content-type') || '') ||
      Number(response.headers.get('content-length')) > MAX_BYTES
    ) {
      await response.body?.cancel()
      throw new Error('upstream')
    }
    if (!response.body) throw new Error('empty')
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        let next: ReadableStreamReadResult<Uint8Array>
        try {
          next = await reader.read()
        } catch {
          throw new TransientCoverError('interrupted image')
        }
        if (next.done) break
        length += next.value.length
        if (length > MAX_BYTES) throw new Error('size')
        chunks.push(next.value)
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
    return Buffer.concat(chunks)
  }
  private async prune() {
    const files = (await readdir(this.directory)).filter((name) => /^[a-f0-9]{64}\.webp$/.test(name))
    if (files.length <= 256) return
    const ordered = await Promise.all(
      files.map(async (name) => ({
        name,
        time: (await stat(path.join(this.directory, name)).catch(() => ({ mtimeMs: 0 }))).mtimeMs,
      })),
    )
    ordered.sort((a, b) => a.time - b.time)
    for (const file of ordered.slice(0, files.length - 256))
      await unlink(path.join(this.directory, file.name)).catch(() => {})
  }
}
