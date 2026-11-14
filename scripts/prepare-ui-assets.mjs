import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const sharp = require('sharp')
const publicRoot = path.join(root, 'apps/web/public')
const logo = await readFile(path.join(publicRoot, 'images/club/club-logo-6982b4563975.png'))
const variants = []
for (const width of [128, 256, 512]) {
  const bytes = await sharp(logo)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer()
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const url = `/images/club/club-logo-${hash}-${width}.webp`
  await writeFile(path.join(publicRoot, url), bytes)
  variants.push({ width, url })
  console.log(`Logo ${width}px: ${bytes.length} bytes`)
}
const clubPath = path.join(root, 'apps/web/app/data/club.ts')
const club = await readFile(clubPath, 'utf8')
await writeFile(
  clubPath,
  club
    .replace(/ {2}logo: '[^']+',/, `  logo: '${variants.at(-1).url}',`)
    .replace(/ {2}logoSrcset: '[^']+',\r?\n/, '')
    .replace(
      / {2}qrCode:/,
      `  logoSrcset: '${variants.map((image) => `${image.url} ${image.width}w`).join(', ')}',\n  qrCode:`,
    ),
)

// Preserve the original artwork and URLs for existing deployments and saved links.
const artwork = await readFile(path.join(publicRoot, 'images/backgrounds/autumn-dc8073085d34-1920.webp'))
const backgroundPath = path.join(root, 'packages/domain/site-background.ts')
let background = await readFile(backgroundPath, 'utf8')
for (const [width, name] of [
  [1920, 'DEFAULT_BACKGROUND_IMAGE'],
  [960, 'DEFAULT_BACKGROUND_MOBILE'],
]) {
  const bytes = await sharp(artwork)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toBuffer()
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const url = `/images/backgrounds/autumn-${hash}-${width}.webp`
  await writeFile(path.join(publicRoot, url), bytes)
  background = background.replace(
    new RegExp(`export const ${name} = '[^']+'`),
    `export const ${name} = '${url}'`,
  )
  console.log(`Background ${width}px: ${bytes.length} bytes`)
}
await writeFile(backgroundPath, background)
