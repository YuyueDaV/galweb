export function usePageLoading() {
  const requests = useState('foreground-page-requests', () => 0)
  let active = 0
  let disposed = false

  if (import.meta.client) {
    onScopeDispose(() => {
      disposed = true
      requests.value -= active
    })
  }

  async function track<T>(load: () => Promise<T>): Promise<T> {
    if (import.meta.server || disposed) return load()
    active++
    requests.value++
    try {
      return await load()
    } finally {
      if (!disposed) {
        active--
        requests.value--
      }
    }
  }

  return { pending: computed(() => requests.value > 0), track }
}
