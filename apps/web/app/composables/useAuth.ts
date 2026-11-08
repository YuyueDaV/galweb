import type { AccountRole } from '~/types/awards'
export interface AuthUser {
  id: string
  username: string
  email: string
  nickname: string
  role: AccountRole
  signature: string
  avatarAssetId: string | null
  avatarUrl: string | null
}
type AuthRuntime = { pending?: Promise<void>; revision: number }

export function useAuth() {
  const app = useNuxtApp() as ReturnType<typeof useNuxtApp> & { _czxAuth?: AuthRuntime }
  // The Nuxt app belongs to one SSR request or one browser tab. Never share an
  // authentication promise or account data between server requests.
  const runtime = (app._czxAuth ||= { revision: 0 })
  const fetchSession = useRequestFetch()
  const sessionCookie = import.meta.server ? useRequestHeaders(['cookie']).cookie || '' : ''
  const user = useState<AuthUser | null>('auth-user', () => null)
  const csrf = useState('auth-csrf', () => '')
  const ready = useState('auth-ready', () => false)
  const restoreError = useState('auth-restore-error', () => '')
  function clear() {
    runtime.revision++
    user.value = null
    csrf.value = ''
    ready.value = true
    restoreError.value = ''
  }
  async function request<T = unknown>(
    path: string,
    body?: unknown,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' = body === undefined ? 'GET' : 'POST',
  ): Promise<T> {
    const revision = runtime.revision
    try {
      return (await $fetch<T>(`/api${path}`, {
        timeout: 15000,
        method,
        body: body as Record<string, unknown>,
        credentials: 'include',
        headers: {
          ...(method !== 'GET' ? { 'X-CZX-Client': 'web' } : {}),
          ...(body !== undefined && !(body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(csrf.value ? { 'X-CSRF-Token': csrf.value } : {}),
        },
      })) as T
    } catch (error) {
      const e = error as { data?: { message?: string }; statusCode?: number }
      if (e.statusCode === 401 && revision === runtime.revision) clear()
      throw Object.assign(new Error(e.data?.message || '服务暂时不可用，请稍后重试。'), {
        statusCode: e.statusCode,
      })
    }
  }
  function singleFlight(work: () => Promise<void>) {
    if (!runtime.pending)
      runtime.pending = work().finally(() => {
        runtime.pending = undefined
      })
    return runtime.pending
  }
  async function restore(csrfOnly = false) {
    const revision = runtime.revision
    restoreError.value = ''
    try {
      if (!csrfOnly) {
        if (import.meta.server && !/(?:^|;\s*)(?:__Host-czx_session|czx_session)=/.test(sessionCookie)) {
          clear()
          return
        }
        const data = await fetchSession<{ user: AuthUser; csrfToken?: string | null }>('/api/auth/me', {
          timeout: import.meta.server ? 4000 : 15000,
          credentials: 'include',
        })
        if (revision !== runtime.revision) return
        user.value = data.user
        csrf.value = data.csrfToken || ''
        ready.value = true
      }
      // Old servers/sessions can still use the existing CSRF endpoint. Keep the
      // confirmed account visible while this token is obtained in the browser.
      if (import.meta.client && user.value && !csrf.value) {
        const data = await request<{ csrfToken: string }>('/auth/csrf', {})
        if (revision !== runtime.revision) return
        csrf.value = data.csrfToken
      }
    } catch (error) {
      if (revision !== runtime.revision) return
      if ((error as { statusCode?: number }).statusCode === 401) clear()
      else restoreError.value = '登录状态暂时无法确认，请重试。'
    }
  }
  function refresh() {
    return singleFlight(() => restore())
  }
  function initialize() {
    if (!ready.value) return refresh()
    if (import.meta.client && user.value && !csrf.value) return singleFlight(() => restore(true))
    return Promise.resolve()
  }
  async function login(username: string, password: string) {
    runtime.revision++
    const data = await request<{ user: AuthUser; csrfToken: string }>('/auth/login', { username, password })
    user.value = data.user
    csrf.value = data.csrfToken
    ready.value = true
    restoreError.value = ''
  }
  async function updateProfile(profile: {
    nickname?: string
    signature?: string
    avatarAssetId?: string | null
  }) {
    runtime.revision++
    user.value = (await request<{ user: AuthUser }>('/auth/me', profile, 'PATCH')).user
  }
  async function updateNickname(nickname: string) {
    await updateProfile({ nickname })
  }
  async function logout() {
    runtime.revision++
    await request('/auth/logout', {})
    clear()
  }
  async function deleteAccount(password: string, confirmation: string) {
    runtime.revision++
    const result = await request<{ message: string }>('/auth/me', { password, confirmation }, 'DELETE')
    clear()
    return result
  }
  return {
    user,
    ready,
    restoreError,
    request,
    refresh,
    initialize,
    login,
    logout,
    updateNickname,
    updateProfile,
    deleteAccount,
  }
}
