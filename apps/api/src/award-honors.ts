import { decode } from './forum'
import type { AwardCampaign, AwardResult } from './award-types'

export interface AwardHonor {
  campaignId: string
  edition: number
  rank: number
}
export interface PublishedAward {
  campaignId: string
  edition: number
  campaign: unknown
  results: unknown
}

export function workAwardHonors(
  workId: number,
  archiveRank: number | undefined,
  published: PublishedAward[],
): AwardHonor[] {
  const honors = new Map<number, AwardHonor>()
  if (archiveRank && archiveRank > 0)
    honors.set(1, { campaignId: 'orange-awards-1', edition: 1, rank: archiveRank })
  for (const row of published) {
    const campaign = decode(row.campaign) as AwardCampaign & { deletedAt?: string }
    if (campaign.deletedAt || !['results', 'archived'].includes(campaign.phase)) continue
    const results = (decode(row.results) as { results?: AwardResult[] }).results || []
    for (const result of results) {
      const linkedId = result.coverRank ?? result.nominations?.find((item) => item.coverRank)?.coverRank
      if (linkedId !== workId || result.votes <= 0 || result.rank < 1 || result.rank > campaign.winnerCount)
        continue
      const previous = honors.get(row.edition)
      if (!previous || result.rank < previous.rank)
        honors.set(row.edition, { campaignId: row.campaignId, edition: row.edition, rank: result.rank })
    }
  }
  return [...honors.values()].sort((a, b) => b.edition - a.edition)
}
