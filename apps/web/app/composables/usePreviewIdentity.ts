import type { PreviewAccount, AccountRole, AwardPermission } from '~/types/awards'
import { hasAwardPermission, roleNames } from '~/utils/awards'
export function usePreviewIdentity(){
 const auth=useAuth(),accounts=useState<(PreviewAccount & {status?:string})[]>('server-accounts',()=>[])
 const account=computed(()=>({id:auth.user.value?.id||'',name:auth.user.value?.nickname||'访客',role:auth.user.value?.role||'member' as AccountRole}))
 const selectedId=computed(()=>account.value.id),role=computed(()=>account.value.role)
 const can=(permission:AwardPermission)=>!!auth.user.value&&hasAwardPermission(role.value,permission)
 async function refreshAccounts(){accounts.value=role.value==='super_admin'?await auth.request('/admin/users'):[]}
 async function initialize(){await auth.initialize();await refreshAccounts()}
 async function setAccountRole(id:string,nextRole:AccountRole){await auth.request(`/admin/users/${id}`,{role:nextRole},'PATCH');await refreshAccounts()}
 return {accounts,account,selectedId,role,can,roleNames,initialize,refreshAccounts,setAccountRole}
}
