export type AccountRole = 'member' | 'admin' | 'super_admin'
export type AwardPermission = 'nomination.submit' | 'ballot.submit' | 'campaign.manage' | 'nomination.review' | 'campaign.create' | 'campaign.archive' | 'account.manage'
export type CampaignPhase = 'draft' | 'nomination' | 'voting' | 'results' | 'archived'
export type NominationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface PreviewAccount {
  username?: string
  id: string
  name: string
  role: AccountRole
}

export interface AwardCampaign {
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
  id: string
  campaignId: string
  accountId: string
  candidateIds: string[]
  updatedAt: string
}

export interface AwardResult extends AwardCandidate {
  votes: number
  rank: number
}

export interface AwardAuditEntry {
  id: string
  campaignId: string
  actor: string
  action: string
  createdAt: string
}
