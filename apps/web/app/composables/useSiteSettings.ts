import type {SiteSettings} from '~/types/community'
import {DEFAULT_SITE_BACKGROUND,normalizeSiteBackground} from '~/utils/site-background'
export function useSiteSettings(){
 const settings=useState<SiteSettings>('site-settings',()=>({title:'南京工程学院澄之响视觉小说同好会',description:'让读完后的心情，遇见另一个懂你的人。',announcement:'',joinInfo:'入社方式与活动安排待管理员公布。',contact:'',links:[],background:{...DEFAULT_SITE_BACKGROUND},version:0}))
 const revision=useState('site-settings-revision',()=>0)
 async function load(){const run=++revision.value;const data=await $fetch<SiteSettings>('/api/site-settings',{timeout:8000});if(run===revision.value&&data.version>=settings.value.version)settings.value={...settings.value,...data,background:normalizeSiteBackground(data.background)};return settings.value}
 return {settings,load}
}
