import type { Reply } from '~/types/forum'

export interface ReplyThread {
  id: string
  root?: Reply
  children: Reply[]
}

export function groupReplyThreads(replies: Reply[]) {
  const byId = new Map(replies.map((reply) => [reply.id, reply]))
  const threads = new Map<string, ReplyThread>()
  for (const reply of replies) {
    let rootId = reply.threadId
    if (!rootId) {
      // Older API responses still retain their direct parent relationships.
      let current = reply
      const seen = new Set([reply.id])
      while (current.parentId && !seen.has(current.parentId)) {
        rootId = current.parentId
        seen.add(rootId)
        const parent = byId.get(rootId)
        if (!parent) break
        current = parent
      }
      rootId ||= reply.id
    }
    if (!threads.has(rootId)) threads.set(rootId, { id: rootId, root: byId.get(rootId), children: [] })
    if (reply.id !== rootId) threads.get(rootId)!.children.push(reply)
  }
  return [...threads.values()]
}
