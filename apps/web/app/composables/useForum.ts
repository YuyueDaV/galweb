import type { ForumPost,Reply,Category } from '~/types/forum'
import { initialPosts } from '~/data/forum'
export function useForum(){
 const auth=useAuth(),posts=useState<ForumPost[]>('forum-posts',()=>initialPosts.map(p=>({...p,likes:0,replies:0,views:0}))),replies=useState<Reply[]>('forum-replies',()=>[])
 const bookmarks=useState<string[]>('forum-bookmarks',()=>[]),likes=useState<string[]>('forum-likes',()=>[]),username=computed(()=>auth.user.value?.nickname||'')
 const pendingReactions=useState<string[]>('forum-pending-reactions',()=>[])
 const query=useState('forum-query',()=>''),category=useState<Category|'全部'>('forum-category',()=> '全部'),toast=useState('forum-toast',()=>''),composerOpen=useState('forum-composer',()=>false),loginOpen=useState('forum-login',()=>false),initialized=useState('forum-initialized',()=>false),online=useState('forum-online',()=>false)
 const feedPage=useState('feed-page',()=>1),hasMore=useState('feed-more',()=>false),feedOptions=useState<Record<string,string>>('feed-options',()=>({})),revision=useState('feed-revision',()=>0)
 const feedIds=useState<string[]>('feed-ids',()=>[]),feedTotal=useState('feed-total',()=>0),loadingFeed=useState('feed-loading',()=>false),feedLoaded=useState('feed-loaded',()=>false),feedError=useState('feed-error',()=>'')
 const feedPosts=computed(()=>{const cache=new Map(posts.value.map(post=>[post.id,post]));return feedIds.value.flatMap(id=>{const post=cache.get(id);return post?[post]:[]})})
 function notify(message:string){toast.value=message;if(import.meta.client)window.setTimeout(()=>{if(toast.value===message)toast.value=''},4000)}
 async function loadFeed(options:Record<string,string>=feedOptions.value,more=false){
  if(more&&(loadingFeed.value||!hasMore.value))return
  const run=++revision.value;feedOptions.value={...options};const page=more?feedPage.value+1:1
  loadingFeed.value=true;feedError.value=''
  try{
   const params=new URLSearchParams({...options,page:String(page),limit:'6'})
   const data=await auth.request<{items:ForumPost[],total:number,page:number,limit:number}>(`/posts?${params}`)
   if(run!==revision.value)return
   const cache=new Map(posts.value.map(post=>[post.id,post]))
   for(const post of data.items)cache.set(post.id,post)
   posts.value=[...cache.values()]
   feedIds.value=more?[...new Set([...feedIds.value,...data.items.map(post=>post.id)])]:data.items.map(post=>post.id)
   feedPage.value=data.page;feedTotal.value=data.total;hasMore.value=data.page*data.limit<data.total;feedLoaded.value=true;online.value=true
  }catch(e){
   if(run!==revision.value)return
   feedError.value=(e as Error).message;online.value=false;feedLoaded.value=true
   if(!more){feedIds.value=[];feedTotal.value=0;hasMore.value=false}
   notify(feedError.value)
  }finally{if(run===revision.value)loadingFeed.value=false}
 }
 async function syncMine(){const userId=auth.user.value?.id;if(!userId){bookmarks.value=[];likes.value=[];return}const mine=await auth.request<{bookmarks:string[],likes:string[]}>('/forum/me');if(auth.user.value?.id!==userId)return;bookmarks.value=mine.bookmarks;likes.value=mine.likes}
 async function initialize(){if(!import.meta.client||initialized.value)return;initialized.value=true;await auth.initialize();if(!loadingFeed.value)await loadFeed();try{await syncMine()}catch(e){notify((e as Error).message)}}
 function requireLogin(){if(!auth.user.value){loginOpen.value=true;throw new Error('请先登录。')}}
 async function fetchPost(id:string){const post=await auth.request<ForumPost>(`/posts/${encodeURIComponent(id)}`);const at=posts.value.findIndex(p=>p.id===id);if(at<0)posts.value.push(post);else posts.value[at]=post;const data=await auth.request<(Reply&{createdAt:number})[]>(`/posts/${encodeURIComponent(id)}/replies`);replies.value=[...replies.value.filter(r=>r.postId!==id),...data.map(r=>({...r,time:new Date(Number(r.createdAt)).toLocaleString('zh-CN')}))];return post}
 function reactionPending(id:string,kind:'like'|'bookmark'){return pendingReactions.value.includes(`${kind}:${id}`)}
 async function reaction(id:string,kind:'like'|'bookmark'){
  if(reactionPending(id,kind))return
  const key=`${kind}:${id}`;pendingReactions.value.push(key)
  try{requireLogin();const userId=auth.user.value!.id,collection=kind==='like'?likes:bookmarks,active=!collection.value.includes(id);await auth.request(`/posts/${encodeURIComponent(id)}/reactions`,{kind,active},'PUT');if(auth.user.value?.id!==userId)return;collection.value=active?[...new Set([...collection.value,id])]:collection.value.filter(item=>item!==id);if(kind==='like'){const post=await auth.request<ForumPost>(`/posts/${encodeURIComponent(id)}`);if(auth.user.value?.id!==userId)return;const index=posts.value.findIndex(p=>p.id===id);if(index>=0)posts.value[index]=post}else{if(feedOptions.value.saved==='true')await loadFeed();notify(active?'已收藏。':'已取消收藏。')}}catch(e){notify((e as Error).message)}finally{pendingReactions.value=pendingReactions.value.filter(item=>item!==key)}
 }
 async function recordView(id:string){const data=await auth.request<{views:number}>(`/posts/${encodeURIComponent(id)}/views`,{});const post=posts.value.find(p=>p.id===id);if(post)post.views=data.views}
 async function createPost(title:string,content:string,postCategory:Category,spoiler:boolean,assetId?:string){requireLogin();const {id}=await auth.request<{id:string}>('/posts',{title,content,category:postCategory,spoiler,...assetId?{assetId}:{}});await fetchPost(id);composerOpen.value=false;notify('帖子已发布。');return id}
 async function addReply(postId:string,content:string){requireLogin();await auth.request(`/posts/${postId}/replies`,{content});await fetchPost(postId);notify('回复已发布。')}
 function clearPersonalData(){revision.value++;posts.value=[];replies.value=[];bookmarks.value=[];likes.value=[];feedIds.value=[];feedTotal.value=0;feedPage.value=1;hasMore.value=false;feedLoaded.value=false;loadingFeed.value=false;feedError.value='';feedOptions.value={};query.value='';category.value='全部';composerOpen.value=false;loginOpen.value=false}
 return {posts,replies,bookmarks,likes,username,query,category,toast,composerOpen,loginOpen,online,hasMore,feedPosts,feedTotal,loadingFeed,feedLoaded,feedError,loadFeed,syncMine,fetchPost,recordView,initialize,notify,clearPersonalData,reactionPending,toggleBookmark:(id:string)=>reaction(id,'bookmark'),toggleLike:(id:string)=>reaction(id,'like'),createPost,addReply,replyCount:(post:ForumPost)=>post.replies}
}
