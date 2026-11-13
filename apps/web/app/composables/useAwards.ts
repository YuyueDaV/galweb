import type {
  AwardCampaign,
  AwardNomination,
  AwardBallot,
  AwardAuditEntry,
  AwardResult,
  CampaignPhase,
  WeightedBallotInput,
  AwardPublicRecommendation,
  AwardAdminBallot,
} from '~/types/awards'
import { loveChoices, collectAwardCandidates, awardVotingCandidates } from '~/utils/awards'
const fallback: AwardCampaign = {
  id: 'orange-awards-2',
  edition: 2,
  title: '第二届澄之响十二橙器',
  phase: 'draft',
  nominationLimit: 3,
  voteLimit: 3,
  votingRule: 'weighted-v1',
  winnerCount: 12,
  nominationStart: null,
  nominationEnd: null,
  votingStart: null,
  votingEnd: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  version: 0,
}
export function useAwards() {
  const auth = useAuth(),
    identity = usePreviewIdentity()
  const campaigns = useState<AwardCampaign[]>('award-campaigns', () => [{ ...fallback }]),
    selectedCampaignId = useState('award-selected-id', () => ''),
    current = useState<AwardCampaign>('award-current', () => ({ ...fallback }))
  const nominations = useState<AwardNomination[]>('award-nominations', () => []),
    myBallot = useState<(AwardBallot & { version: number }) | null>('award-my-ballot', () => null),
    ballotVersion = useState('award-ballot-version', () => 0),
    ballotCount = useState('award-ballot-count', () => 0),
    results = useState<AwardResult[]>('award-results', () => []),
    recommendations = useState<AwardPublicRecommendation[]>('award-recommendations', () => []),
    ballots = useState<AwardAdminBallot[]>('award-admin-ballots', () => []),
    audit = useState<AwardAuditEntry[]>('award-audit', () => []),
    online = useState('awards-online', () => false),
    revision = useState('award-revision', () => 0)
  const campaign = computed(() => current.value),
    campaignNominations = computed(() => nominations.value),
    candidates = computed(() => collectAwardCandidates(nominations.value, campaign.value.id)),
    visibleCandidates = computed(() =>
      collectAwardCandidates(nominations.value, campaign.value.id, campaign.value.phase === 'nomination'),
    ),
    votingCandidates = computed(() =>
      awardVotingCandidates(campaign.value, collectAwardCandidates(nominations.value, campaign.value.id)),
    ),
    myNominations = computed(() =>
      nominations.value.filter(
        (n) => !n.adminAdded && n.accountId === identity.account.value.id && n.status !== 'withdrawn',
      ),
    )
  async function refresh() {
    const sequence = ++revision.value
    await auth.initialize()
    const list = await auth.request<AwardCampaign[]>('/award-campaigns')
    if (sequence !== revision.value) return
    campaigns.value = list
    const id = list.some((c) => c.id === selectedCampaignId.value) ? selectedCampaignId.value : list[0]?.id
    if (!id) {
      selectedCampaignId.value = ''
      current.value = { ...fallback, id: '' }
      nominations.value = []
      myBallot.value = null
      ballotVersion.value = 0
      ballotCount.value = 0
      results.value = []
      recommendations.value = []
      ballots.value = []
      audit.value = []
      online.value = true
      return
    }
    selectedCampaignId.value = id
    const data = await auth.request<{
      campaign: AwardCampaign
      nominations: AwardNomination[]
      myBallot: (AwardBallot & { version: number }) | null
      ballotVersion?: number
      ballotCount: number
      results: AwardResult[]
      recommendations?: AwardPublicRecommendation[]
      ballots?: AwardAdminBallot[]
      audit: AwardAuditEntry[]
    }>('/award-campaigns/' + id)
    if (sequence !== revision.value) return
    if (JSON.stringify(current.value) !== JSON.stringify(data.campaign)) current.value = data.campaign
    nominations.value = data.nominations
    if (JSON.stringify(myBallot.value) !== JSON.stringify(data.myBallot)) myBallot.value = data.myBallot
    ballotVersion.value = data.ballotVersion ?? data.myBallot?.version ?? 0
    ballotCount.value = data.ballotCount
    results.value = data.results
    recommendations.value = data.recommendations || []
    ballots.value = data.ballots || []
    audit.value = data.audit.map((a) => ({ ...a, createdAt: new Date(Number(a.createdAt)).toISOString() }))
    online.value = true
  }
  async function initialize() {
    try {
      await refresh()
    } catch {
      online.value = false
    }
  }
  async function mutate(path: string, body: unknown, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST') {
    await auth.request(path, body, method)
    await refresh()
  }
  const root = () => `/award-campaigns/${campaign.value.id}`,
    adminRoot = () => `/admin/award-campaigns/${campaign.value.id}`
  async function createCampaign(edition?: number) {
    const c = await auth.request<AwardCampaign>('/admin/award-campaigns', edition ? { edition } : {})
    selectedCampaignId.value = c.id
    await refresh()
    return c
  }
  return {
    campaigns,
    selectedCampaignId,
    campaign,
    campaignNominations,
    nominations,
    candidates,
    visibleCandidates,
    votingCandidates,
    myNominations,
    myBallot,
    results,
    recommendations,
    ballots,
    audit,
    ballotCount,
    online,
    initialize,
    refresh,
    persist: initialize,
    createCampaign,
    deleteCampaign: (confirmation: string) =>
      mutate(adminRoot(), { confirmation, version: campaign.value.version }, 'DELETE'),
    saveWeightedBallot: (weighted: WeightedBallotInput) =>
      mutate(
        root() + '/ballot',
        {
          candidateIds: [...loveChoices(weighted), ...weighted.likeIds],
          weighted,
          version: ballotVersion.value,
          round: campaign.value.votingRound || 1,
        },
        'PUT',
      ),
    saveSettings: (next: AwardCampaign) => mutate(adminRoot(), next, 'PATCH'),
    movePhase: (phase: CampaignPhase) =>
      mutate(adminRoot() + '/transitions', { phase, version: campaign.value.version }),
    startRunoff: () => mutate(adminRoot() + '/runoff', { version: campaign.value.version }),
    startTieBreak: () => mutate(adminRoot() + '/tie-break', { version: campaign.value.version }),
    submitNomination: (
      title: string,
      studio: string,
      reason: string,
      source: { workId?: number; subjectId?: number; coverAssetId?: string } = {},
    ) => mutate(root() + '/nominations', { title, studio, reason, ...source }),
    withdrawNomination: (id: string) =>
      mutate(root() + '/nominations/' + id, { status: 'withdrawn' }, 'PATCH'),
    reviewNomination: (id: string, status: 'approved' | 'rejected', note: string) =>
      mutate(root() + '/nominations/' + id, { status, note }, 'PATCH'),
    editNominationDetails: (input: {
      entries: {
        id: string
        nominatorName: string
        nominatedAt: string
        reason: string
        source: string
        revision: string
      }[]
      candidateId: string
      additions: { nominatorName: string; nominatedAt: string; reason: string; source: string }[]
      removals: { id: string; revision: string }[]
    }) => mutate(adminRoot() + '/nomination-details', input, 'PATCH'),
    saveBallot: (candidateIds: string[]) =>
      mutate(
        root() + '/ballot',
        { candidateIds, version: ballotVersion.value, round: campaign.value.votingRound || 1 },
        'PUT',
      ),
    withdrawBallot: () =>
      mutate(
        root() + '/ballot',
        { candidateIds: null, version: ballotVersion.value, round: campaign.value.votingRound || 1 },
        'PUT',
      ),
  }
}
