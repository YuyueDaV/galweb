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
}
