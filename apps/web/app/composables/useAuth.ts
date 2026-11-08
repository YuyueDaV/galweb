import type { AccountRole } from '~/types/awards'
export interface AuthUser {id:string;username:string;email:string;nickname:string;role:AccountRole;signature:string;avatarAssetId:string|null;avatarUrl:string|null}
export function useAuth(){
 const user=useState<AuthUser|null>('auth-user',()=>null),csrf=useState('auth-csrf',()=>''),ready=useState('auth-ready',()=>false)
 async function request<T=unknown>(path:string,body?:unknown,method:'GET'|'POST'|'PATCH'|'DELETE'|'PUT'=body===undefined?'GET':'POST'):Promise<T>{
  try{return await $fetch<T>(`/api${path}`,{timeout:15000,method,body:body as Record<string,unknown>,credentials:'include',headers:{...(method!=='GET'?{'X-CZX-Client':'web'}:{}),...(body!==undefined&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(csrf.value?{'X-CSRF-Token':csrf.value}:{})}}) as T}
  catch(error){const e=error as {data?:{message?:string},statusCode?:number};if(e.statusCode===401){user.value=null;csrf.value=''}throw new Error(e.data?.message||'服务暂时不可用，请稍后重试。')}
 }
 async function refresh(){try{user.value=(await $fetch<{user:AuthUser}>('/api/auth/me',{timeout:15000,credentials:'include'})).user;csrf.value=(await request<{csrfToken:string}>('/auth/csrf',{})).csrfToken}catch{user.value=null;csrf.value=''}finally{ready.value=true}}
 async function initialize(){if(import.meta.client&&!ready.value)await refresh()}
 async function login(username:string,password:string){const data=await request<{user:AuthUser,csrfToken:string}>('/auth/login',{username,password});user.value=data.user;csrf.value=data.csrfToken}
 async function updateProfile(profile:{nickname?:string,signature?:string,avatarAssetId?:string|null}){user.value=(await request<{user:AuthUser}>('/auth/me',profile,'PATCH')).user}
 async function updateNickname(nickname:string){await updateProfile({nickname})}
 async function logout(){await request('/auth/logout',{});user.value=null;csrf.value=''}
 async function deleteAccount(password:string,confirmation:string){const result=await request<{message:string}>('/auth/me',{password,confirmation},'DELETE');user.value=null;csrf.value='';return result}
 return {user,ready,request,refresh,initialize,login,logout,updateNickname,updateProfile,deleteAccount}
}
