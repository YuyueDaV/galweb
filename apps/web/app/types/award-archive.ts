import type { AwardPublicRecommendation } from './awards'

export interface AwardArchiveEntry {
  id: string
  rank: number
  title: string
  subtitle: string
  studio: string
  description: string
  nominator: string
  coverUrl: string
  coverRank?: number
  to?: string
  badge?: string
  votes?: number
  recommendationAuthor?: string
  recommendations?: AwardPublicRecommendation[]
  tied?: boolean
  tieBreakSummary?: string
}
