export function postExcerpt(content:string,spoiler=false){
 if(spoiler)return '本文包含剧情剧透，请进入帖子后自行选择展开。'
 let depth=0;const visible:string[]=[]
 for(const line of content.split('\n')){if(line.trim()===':::spoiler'){if(!depth)visible.push('[剧透内容]');depth++;continue}if(depth&&line.trim()===':::'){depth--;continue}if(!depth)visible.push(line)}
 return visible.join('\n').replace(/\|\|[\s\S]*?(?:\|\||$)/g,'[剧透内容]').replace(/!\[[^\]]*\]\([^)]*\)/g,'[图片]').replace(/[#>*_`~]/g,'').replace(/\s+/g,' ').slice(0,120)
}
