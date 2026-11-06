import type { AccountRole, AwardPermission } from '~/types/awards'
import { hasAwardPermission, roleNames } from '~/utils/awards'
export function usePreviewIdentity(){
 const auth=useAuth()
 const account=computed(()=>({id:auth.user.value?.id||'',name:auth.user.value?.nickname||'访客',role:auth.user.value?.role||'member' as AccountRole}))
 const selectedId=computed(()=>account.value.id),role=computed(()=>account.value.role)
 const can=(permission:AwardPermission)=>!!auth.user.value&&hasAwardPermission(role.value,permission)
 return {account,selectedId,role,can,roleNames}
}
