export type SocialProvider = 'qq' | 'discord' | 'qq-xinyue'
export type SocialOption = { provider: SocialProvider; label: string; enabled: boolean }
export type SocialBinding = SocialOption & { bound: boolean; displayName: string; boundAt: number | null }

export function useSocialLogin() {
  const auth = useAuth()
  const options = useState<SocialOption[]>('social-login-options', () => [])
  const loaded = useState('social-login-loaded', () => false)
  async function load() {
    options.value = await auth.request<SocialOption[]>('/auth/oauth/providers')
    loaded.value = true
  }
  async function start(provider: SocialProvider, mode: 'login' | 'bind', returnTo: string) {
    await auth.initialize()
    const result = await auth.request<{ url: string }>(`/auth/oauth/${provider}/start`, { mode, returnTo })
    window.location.assign(result.url)
  }
  return { options, loaded, load, start }
}
