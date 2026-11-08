export interface BangumiSubject {
  id: number
  title: string
  originalTitle: string
  summary: string
  studio: string
  date: string
  coverUrl: string
  score: number | null
  ratingCount: number
  tags: string[]
  syncedAt: number
}
export interface TierLevel {
  id: string
  label: string
  color: string
  workIds: number[]
}
export interface TierList {
  id: string
  title: string
  description: string
  rows: TierLevel[]
  version?: number
  isPublished?: boolean
  updatedAt: number
  mode?: 'community' | 'personal'
  blocked?: boolean
  author?: { id: string; name: string; avatarUrl: string | null } | null
  works?: import('./forum').Work[]
  participants?: number
  publicationKey?: string
  stats?: { participants: number; works: { workId: number; total: number; counts: Record<string, number> }[] }
}
export interface TierBallot {
  version: number
  publicationKey: string
  choices: { workId: number; rowId: string }[]
}
