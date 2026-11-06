import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
const webRequire=createRequire(new URL('../apps/web/package.json',import.meta.url)),apiRequire=createRequire(new URL('../apps/api/package.json',import.meta.url)),ts=apiRequire('typescript')
const source=await readFile(new URL('../apps/web/app/utils/markdown.ts',import.meta.url),'utf8'),module={exports:{}}
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText
new Function('require','module','exports',code)(webRequire,module,module.exports)
const {renderMarkdown}=module.exports
test('Markdown 渲染拒绝原始 HTML、脚本链接及远程图片，保留安全格式',()=>{
 const output=renderMarkdown('# 标题\n\n**加粗** [安全链接](https://example.com)\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[危险](javascript:alert(1))\n\n![远程](https://tracker.example/pixel)\n\n![本地](/api/assets/12345678-1234-1234-1234-123456789abc)')
 assert.doesNotMatch(output.html,/<script|<img src=x|href="javascript:|src="https:\/\/tracker/)
 assert.match(output.html,/<strong>加粗<\/strong>/);assert.match(output.html,/rel="nofollow noopener noreferrer"/)
 assert.match(output.html,/src="\/api\/assets\/12345678-1234-1234-1234-123456789abc"/)
 assert.equal(output.toc[0].text,'标题')
})
test('段落与图片剧透默认折叠，隐藏章节不进入目录，超深嵌套不会崩溃',()=>{
 const output=renderMarkdown('## 无剧透介绍\n\n||结局秘密||\n\n:::spoiler\n## 秘密章节\n![秘密图片](/api/assets/12345678-1234-1234-1234-123456789abc)\n:::')
 assert.match(output.html,/<details class="inline-spoiler">/);assert.match(output.html,/<details class="spoiler-block">/);assert.doesNotMatch(output.html,/<details[^>]*\sopen/)
 assert.deepEqual(output.toc.map(h=>h.text),['无剧透介绍'])
 assert.doesNotThrow(()=>renderMarkdown(':::spoiler\n'.repeat(100)+'内容\n'+':::\n'.repeat(100)))
 const formatted=renderMarkdown('正文 ||**加粗秘密** 与 [链接](https://example.com)|| 结尾，`||代码示例||`')
 assert.match(formatted.html,/<details class="inline-spoiler"><summary>[^<]*<\/summary><span><strong>加粗秘密<\/strong>/)
 assert.match(formatted.html,/<code>\|\|代码示例\|\|<\/code>/)
})
