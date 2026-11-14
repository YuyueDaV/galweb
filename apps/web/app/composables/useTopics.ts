export interface PostTopic {
  name: string
  count: number
  latestAt: number
}

type TopicRuntime = { pending?: Promise<void> }

export function useTopics() {
  const app = useNuxtApp() as ReturnType<typeof useNuxtApp> & { _czxTopics?: TopicRuntime }
  // Request-local on the server, tab-local in the browser. Never share promises across SSR users.
  const runtime = (app._czxTopics ||= {})
  const topics = useState<PostTopic[]>('post-topics', () => []),
    error = useState('post-topics-error', () => ''),
    loading = useState('post-topics-loading', () => false),
    revision = useState('post-topics-revision', () => 0)
  const auth = useAuth()
  function load(force = false): Promise<void> {
    if (runtime.pending && !force) return runtime.pending
    const run = ++revision.value
    loading.value = true
    const task = (async () => {
      try {
        const data = await auth.request<PostTopic[]>('/topics')
        if (run !== revision.value) return
        topics.value = data
        error.value = ''
      } catch (cause) {
        if (run === revision.value) {
          topics.value = []
          error.value = (cause as Error).message
        }
      } finally {
        if (run === revision.value) loading.value = false
      }
    })()
    runtime.pending = task
    void task.finally(() => {
      if (runtime.pending === task) runtime.pending = undefined
    })
    return task
  }
  return { topics, error, loading, load }
}
