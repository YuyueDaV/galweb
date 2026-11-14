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
  tied?: boolean
  tieBreakSummary?: string
}
