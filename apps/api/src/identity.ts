// Public login names are independent from immutable internal UUIDs and mutable display names.
export const usernameKey=(value:string)=>value.trim().normalize('NFKC').toLowerCase()
export function validUsername(value:string){return /^[\p{L}\p{N}_]{3,24}$/u.test(value.trim())&&/^[\p{L}\p{N}_]{3,24}$/u.test(usernameKey(value))}
