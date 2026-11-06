import MarkdownIt,{type Token} from 'markdown-it'

export interface ReadingHeading {id:string;text:string;level:number}
const md=new MarkdownIt({html:false,breaks:true,linkify:true,typographer:false})
const escape=md.utils.escapeHtml
md.core.ruler.after('inline','inline_spoilers',state=>{
 for(const block of state.tokens){
  if(block.type!=='inline'||!block.children)continue
  const result:Token[]=[];let offset=0,found=false
  const append=(source:string)=>{const tokens:Token[]=[];md.inline.parse(source,md,state.env,tokens);result.push(...tokens)}
  // Code spans remain literal; formatting inside a spoiler stays inside its fold.
  for(const match of block.content.matchAll(/(`+)[\s\S]*?\1|(?<!\\)\|\|([\s\S]+?)\|\|/g)){
   if(match[1])continue
   found=true;append(block.content.slice(offset,match.index));const spoiler=new state.Token('inline_spoiler','',0);spoiler.content=match[2]!;result.push(spoiler);offset=match.index!+match[0].length
  }
  if(found){append(block.content.slice(offset));block.children=result}
 }
})
md.renderer.rules.inline_spoiler=(tokens,index)=>'<details class="inline-spoiler"><summary>剧透 · 点击展开</summary><span>'+md.renderInline(tokens[index]!.content)+'</span></details>'
md.block.ruler.before('fence','spoiler_block',(state,start,end,silent)=>{
 const line=(n:number)=>state.src.slice(state.bMarks[n]!+state.tShift[n]!,state.eMarks[n])
 if(line(start).trim()!==':::spoiler'||(Number(state.env.spoilerDepth)||0)>=8)return false
 let close=start+1,depth=1
 for(;close<end;close++){if(line(close).trim()===':::spoiler')depth++;if(line(close).trim()===':::')depth--;if(!depth)break}
 if(close===end)return false
 if(silent)return true
 state.push('spoiler_open','details',1).block=true
 const body=state.getLines(start+1,close,state.blkIndent,false)
 state.env.spoilerDepth=(Number(state.env.spoilerDepth)||0)+1
 try{md.block.parse(body,md,state.env,state.tokens)}finally{state.env.spoilerDepth=Number(state.env.spoilerDepth)-1}
 state.push('spoiler_close','details',-1).block=true;state.line=close+1;return true
})
md.renderer.rules.spoiler_open=()=>'<details class="spoiler-block"><summary>包含剧情或图片剧透，点击后展开</summary><div>'
md.renderer.rules.spoiler_close=()=>'</div></details>'
md.core.ruler.push('reading_headings',state=>{
 let index=0,hidden=0;const toc:ReadingHeading[]=[]
 for(let i=0;i<state.tokens.length;i++){const token=state.tokens[i]!;if(token.type==='spoiler_open')hidden++;if(token.type==='spoiler_close')hidden--;if(token.type!=='heading_open')continue;const id='read-section-'+(++index);token.attrSet('id',id);if(!hidden)toc.push({id,level:Number(token.tag.slice(1)),text:state.tokens[i+1]?.children?.filter(t=>t.type==='text'||t.type==='code_inline').map(t=>t.content).join('')||'章节'})}
 state.env.toc=toc
})
const originalLink=md.renderer.rules.link_open||((tokens,index,options,_env,self)=>self.renderToken(tokens,index,options))
md.renderer.rules.link_open=(tokens,index,options,env,self)=>{tokens[index]!.attrSet('rel','nofollow noopener noreferrer');tokens[index]!.attrSet('target','_blank');return originalLink(tokens,index,options,env,self)}
md.renderer.rules.image=(tokens,index)=>{
 const token=tokens[index]!,src=String(token.attrGet('src')||'')
 if(!/^\/api\/assets\/[a-f0-9-]{36}$/.test(src))return '<span class="markdown-image-note">[请通过编辑器上传图片]</span>'
 return `<img src="${escape(src)}" alt="${escape(token.content)}" loading="lazy" data-reading-image />`
}
export function renderMarkdown(source:string){const env:{toc?:ReadingHeading[]}={};const html=md.render(source.slice(0,10000),env);return {html,toc:env.toc||[]}}
