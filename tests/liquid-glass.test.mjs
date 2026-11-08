import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const ts = require('typescript')
const source = await readFile(new URL('../apps/web/app/utils/liquid-glass.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const module = { exports: {} }
new Function('module', 'exports', code)(module, module.exports)
const { computeDisplacementData } = module.exports

test('玻璃贴图：中心不位移、圆角透明、边缘反向折射，高像素密度和极小尺寸仍有效', () => {
  const map = computeDisplacementData({ width: 80, height: 40, radius: 12, bevelDepth: 8 })
  const pixel = (x, y) => [...map.data.slice((y * map.width + x) * 4, (y * map.width + x) * 4 + 4)]
  assert.deepEqual(pixel(40, 20), [128, 128, 0, 255])
  assert.equal(pixel(0, 0)[3], 0)
  const left = pixel(2, 20),
    right = pixel(77, 20)
  assert.ok(left[0] > 128 && right[0] < 128)
  assert.ok(Math.abs(left[0] + right[0] - 256) <= 1)
  assert.equal(left[3], 255)
  assert.ok(left[2] > 0, '向光边缘保留高光')
  const retina = computeDisplacementData({ width: 80, height: 40, radius: 12, bevelDepth: 8, dpr: 2 })
  assert.equal(retina.width, 160)
  assert.equal(retina.height, 80)
  assert.equal(retina.data.length, 160 * 80 * 4)
  for (const [width, height] of [
    [1, 1],
    [1, 40],
    [40, 1],
  ]) {
    const tiny = computeDisplacementData({ width, height, radius: 999, bevelDepth: 14 })
    assert.equal(tiny.data.length, width * height * 4)
    assert.ok(tiny.data.every(Number.isFinite))
  }
})
