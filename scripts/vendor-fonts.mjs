import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '../apps/web')
async function sourceText(directory) {
  let text = ''
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) text += await sourceText(path)
    else if (/\.(vue|ts)$/.test(entry.name)) text += await readFile(path, 'utf8')
  }
  return text
}
const characters = [...new Set(((await sourceText(join(root, 'app'))).match(/[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/gu) || []))].join('')
const serif = new URL('https://fonts.googleapis.com/css2')
serif.searchParams.set('family', 'Noto Serif SC:wght@500;600;700;800')
serif.searchParams.set('display', 'swap')
serif.searchParams.set('text', characters)
const sans = new URL('https://fonts.googleapis.com/css2')
sans.searchParams.set('family', 'Noto Sans SC:wght@400;500;600;700')
sans.searchParams.set('display', 'swap')
sans.searchParams.set('text', characters)
const sources = [serif.href, sans.href, 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap']
const files = new Map()
let css = '/* Locally hosted Google Fonts. Font licenses are in public/fonts/LICENSES.txt. */\n'
await mkdir(join(root, 'public/fonts'), { recursive: true })
for (const source of sources) {
  const response = await fetch(source, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`Font stylesheet HTTP ${response.status}`)
  let sheet = await response.text()
  for (const match of sheet.matchAll(/url\((https:[^)]+)\)/g)) {
    const url = match[1]
    let name = files.get(url)
    if (!name) {
      name = `font-${files.size + 1}.${url.includes('.woff2') ? 'woff2' : url.includes('.woff') ? 'woff' : 'ttf'}`
      const font = await fetch(url)
      if (!font.ok) throw new Error(`Font asset HTTP ${font.status}`)
      await writeFile(join(root, 'public/fonts', name), Buffer.from(await font.arrayBuffer()))
      files.set(url, name)
    }
    sheet = sheet.replaceAll(url, `/fonts/${name}`)
  }
  css += `${sheet}\n`
}
for (const [family, license] of [
  ['Noto Serif SC', 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt'],
  ['Noto Sans SC', 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt'],
  ['DM Sans', 'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt'],
]) {
  const response = await fetch(license)
  if (!response.ok) throw new Error(`Font license HTTP ${response.status}`)
  await writeFile(join(root, `public/fonts/${family.replaceAll(' ', '-')}-OFL.txt`), await response.text())
}
await writeFile(join(root, 'public/fonts/LICENSES.txt'), 'Noto Serif SC, Noto Sans SC and DM Sans are distributed under the SIL Open Font License 1.1. See the adjacent *-OFL.txt files.\n')
await writeFile(join(root, 'app/assets/css/fonts.css'), css)
console.log(`Vendored ${files.size} font files; ${characters.length} Chinese and punctuation glyphs.`)
