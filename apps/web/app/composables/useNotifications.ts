import type {InboxItem} from '~/types/community'
export function useNotifications(){
 const auth=useAuth(),unread=useState('notification-unread',()=>0),items=useState<InboxItem[]>('notification-items',()=>[]),total=useState('notification-total',()=>0)
 async function load(page=1,summaryOnly=false){const id=auth.user.value?.id;if(!id){unread.value=0;items.value=[];total.value=0;return}const result=await auth.request<{items:InboxItem[],total:number,unread:number}>(`/notifications?page=${page}`);if(auth.user.value?.id!==id)return;if(!summaryOnly){items.value=result.items;total.value=result.total}unread.value=result.unread}
 async function read(id?:string){await auth.request(id?`/notifications/${id}/read`:'/notifications/read',{},'PUT');await load()}
 return {unread,items,total,load,read}
}
