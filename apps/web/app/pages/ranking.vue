<script setup lang="ts">
import { works, coverUrl } from '~/data/forum'
import type { AwardArchiveEntry } from '~/types/award-archive'
import type { AwardCampaign } from '~/types/awards'

useSeoMeta({ title: '第一届十二橙器 · 澄之响' })
const api = useRequestFetch()
const { data: campaigns } = await useAsyncData(
  'award-archive-editions',
  () => api<AwardCampaign[]>('/api/award-campaigns', { timeout: 4000 }),
  { default: () => [] },
)
const entries: AwardArchiveEntry[] = works.map((work) => ({
  ...work,
  id: String(work.rank),
  coverUrl: coverUrl(work.rank),
  to: `/works/${work.rank}`,
  badge: ['共同的选择', '善恶的叩问', '魔法的回响'][work.rank - 1],
}))
</script>

<template>
  <div class="awards-page">
    <AwardEditionNavigation :campaigns="campaigns" selected-campaign-id="orange-awards-1" />
    <AwardArchive :edition="1" :entries="entries" />
  </div>
</template>
