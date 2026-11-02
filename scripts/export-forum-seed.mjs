import { works, initialPosts } from '../apps/web/app/data/forum.ts'
import { writeFile } from 'node:fs/promises'
await writeFile(new URL('../apps/api/src/seed-data.json',import.meta.url),JSON.stringify({works,posts:initialPosts.map((p,index)=>({...p,createdAt:Date.now()-index*3600000,likes:0,replies:0,views:0}))},null,2)+'\n')
