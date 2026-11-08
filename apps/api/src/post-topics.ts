// Generated from packages/domain by scripts/sync-award-rules.mjs. Do not edit.
export const MAX_POST_TOPICS = 5
export const MAX_TOPIC_LENGTH = 24

export function normalizeTopic(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/\s+/gu, ' ')
}

export function topicKey(value: string): string {
  return normalizeTopic(value).toLowerCase()
}

export function validTopic(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_TOPIC_LENGTH &&
    !/[#<>\p{Cc}\p{Cf}]/u.test(value) &&
    /[\p{L}\p{N}]/u.test(value)
  )
}

export function uniqueTopics(values: string[]): string[] {
  const topics = new Map<string, string>()
  for (const value of values) {
    const name = normalizeTopic(value)
    if (validTopic(name) && !topics.has(topicKey(name))) topics.set(topicKey(name), name)
  }
  return [...topics.values()]
}

export function recentTopics(posts: { tags: string[]; createdAt: number }[], limit = 20) {
  const topics = new Map<string, { name: string; count: number; latestAt: number }>()
  for (const post of posts) {
    for (const name of uniqueTopics(post.tags)) {
      const key = topicKey(name),
        existing = topics.get(key)
      if (existing) {
        existing.count++
        if (post.createdAt > existing.latestAt) {
          existing.latestAt = post.createdAt
          existing.name = name
        }
      } else topics.set(key, { name, count: 1, latestAt: post.createdAt })
    }
  }
  return [...topics.values()]
    .sort((a, b) => b.latestAt - a.latestAt || b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, limit)
}
