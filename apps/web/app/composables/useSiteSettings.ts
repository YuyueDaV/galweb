import type {SiteSettings} from '~/types/community'
export function useSiteSettings(){
 const settings=useState<SiteSettings>('site-settings',()=>({title:'南京工程学院澄之响视觉小说同好会',description:'让读完后的心情，遇见另一个懂你的人。',announcement:'',joinInfo:'入社方式与活动安排待管理员公布。',contact:'',links:[],version:0}))
 async function load(){settings.value=await $fetch<SiteSettings>('/api/site-settings')}
 return {settings,load}
}
