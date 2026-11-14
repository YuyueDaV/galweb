import { coverUrl, works } from '~/data/forum'
import type { AwardArchiveEntry } from '~/types/award-archive'

export const firstEditionEntries: AwardArchiveEntry[] = works.map((work) => ({
  ...work,
  id: String(work.rank),
  coverUrl: coverUrl(work.rank),
  coverRank: work.rank,
  to: `/works/${work.rank}`,
  badge: ['共同的选择', '善恶的叩问', '魔法的回响'][work.rank - 1],
}))
