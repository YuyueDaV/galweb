export interface PostTopic {
  name: string
  count: number
  latestAt: number
}

export function useTopics() {
  const topics = useState<PostTopic[]>('post-topics', () => []),
    error = useState('post-topics-error', () => ''),
    loading = useState('post-topics-loading', () => false),
    revision = useState('post-topics-revision', () => 0)
  const auth = useAuth()
  async function load() {
    const run = ++revision.value
    loading.value = true
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
  }
  return { topics, error, loading, load }
}
