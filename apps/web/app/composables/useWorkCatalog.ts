import type { Work } from '~/types/forum'

const catalogKey = 'work-catalog-summary'
const cacheDuration = 60_000

export function invalidateWorkCatalog() {
  useState<number>(`${catalogKey}-at`, () => 0).value = 0
}

export function useWorkCatalog(options: { lazy?: boolean; server?: boolean } = {}) {
  const api = useRequestFetch()
  const app = useNuxtApp()
  const fetchedAt = useState<number>(`${catalogKey}-at`, () => 0)
  const isFresh = () => fetchedAt.value > 0 && Date.now() - fetchedAt.value < cacheDuration
  const result = useAsyncData(
    catalogKey,
    async () => {
      try {
        const works = await api<Work[]>('/api/works?view=summary')
        fetchedAt.value = Date.now()
        return works
      } catch (error) {
        fetchedAt.value = 0
        throw error
      }
    },
    {
      default: () => [],
      lazy: options.lazy ?? false,
      server: options.server ?? true,
      dedupe: 'cancel',
      getCachedData(key, app, context) {
        if (context.cause !== 'initial') return undefined
        // Nuxt's payload belongs to this SSR request/browser tab, never to other visitors.
        if (app.isHydrating || isFresh()) {
          return app.payload.data[key] ?? app.static.data[key]
        }
        return undefined
      },
    },
  )
  // Nuxt retains successful entries when a custom cache is supplied. Non-lazy
  // navigation otherwise skips its initial fetch even when that cache has expired.
  if (!options.lazy && !app.isHydrating && !isFresh() && result.status.value === 'success') {
    return Object.assign(
      result.refresh().then(() => ({ ...result })),
      result,
    )
  }
  return result
}
