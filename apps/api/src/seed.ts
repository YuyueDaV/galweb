import data from './seed-data.json'
import { Database } from './database'
export async function seed(db:Database){
 const campaign={id:'orange-awards-2',edition:2,title:'第二届澄之响十二橙器',phase:'draft',nominationLimit:3,voteLimit:12,winnerCount:12,nominationStart:null,nominationEnd:null,votingStart:null,votingEnd:null,createdAt:new Date().toISOString(),version:0}
 await db.execute('INSERT IGNORE INTO award_campaigns(id,edition,data) VALUES (?,?,?)',[campaign.id,2,JSON.stringify(campaign)])
 for(const work of data.works)await db.execute('INSERT IGNORE INTO works(id,data) VALUES (?,?)',[work.rank,JSON.stringify(work)])
 for(const post of data.posts)await db.execute('INSERT IGNORE INTO forum_posts(id,title,category,data,created_at) VALUES (?,?,?,?,?)',[post.id,post.title,post.category,JSON.stringify(post),post.createdAt])
}
