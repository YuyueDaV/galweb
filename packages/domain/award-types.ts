export type AccountRole = 'member' | 'admin' | 'super_admin'
export type AwardPermission =
  | 'nomination.submit'
  | 'ballot.submit'
  | 'campaign.manage'
  | 'nomination.review'
  | 'campaign.create'
  | 'campaign.archive'
  | 'campaign.delete'
  | 'account.view'
  | 'account.status'
  | 'account.manage'
export type CampaignPhase = 'draft' | 'nomination' | 'voting' | 'results' | 'archived'
export type NominationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface PreviewAccount {
  username?: string
  id: string
  name: string
  role: AccountRole
  status: 'active' | 'disabled' | 'deleted'
  avatarUrl: string | null
  isLastSuperAdmin?: boolean
}

export type AwardVotingRule = 'legacy' | 'weighted-v1'
export interface AwardBallotRules {
  loveLimit: number
  likeLimit: number
  lovePoints: number
  likePoints: number
  recommendationPoints: number
  recommendationLimit: number
}
export interface WeightedBallotInput {
  loveIds?: string[]
  loveId: string | null
  likeIds: string[]
  recommendations: { candidateId: string; text: string }[]
}
export interface AwardCampaign {
  votingRound?: number
  lockedCandidateIds?: string[]
  ballotRules?: AwardBallotRules
  votingRule?: AwardVotingRule
  version?: number
  id: string
  edition: number
  title: string
  phase: CampaignPhase
  nominationLimit: number
  voteLimit: number
  winnerCount: number
  nominationStart: string | null
  nominationEnd: string | null
  votingStart: string | null
  votingEnd: string | null
  createdAt: string
}

export interface AwardNomination {
  id: string
  campaignId: string
  candidateId: string
  title: string
  studio: string
  coverRank?: number
  reason: string
  accountId: string
  accountName: string
  status: NominationStatus
  createdAt: string
  reviewedBy?: string
  reviewNote?: string
}

export interface AwardCandidate {
  id: string
  title: string
  studio: string
  coverRank?: number
  nominations: AwardNomination[]
}

export interface AwardBallot {
  loveIds?: string[]
  loveId?: string | null
  likeIds?: string[]
  recommendations?: { candidateId: string; text: string }[]
  id: string
  campaignId: string
  accountId: string
  candidateIds: string[]
  updatedAt: string
}

export interface AwardResult extends AwardCandidate {
  qualifiedRound?: number
  loveVotes?: number
  likeVotes?: number
  recommendationCount?: number
  votes: number
  rank: number
}

export interface AwardPublicRecommendation {
  candidateId: string
  text: string
  authorName: string
  round: number
}

export interface AwardAdminBallot extends AwardBallot {
  accountName: string
  round: number
}

export interface AwardAuditEntry {
  id: string
  campaignId: string
  actor: string
  action: string
  createdAt: string
}
