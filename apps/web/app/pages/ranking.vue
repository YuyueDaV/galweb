<script setup lang="ts">
import type { AwardCampaign } from '~/types/awards'

useSeoMeta({ title: '第一届十二橙器 · 澄之响' })
const api = useRequestFetch()
const { data: campaigns } = useLazyAsyncData(
  'award-archive-editions',
  () => api<AwardCampaign[]>('/api/award-campaigns', { timeout: 4000 }),
  { default: () => [], server: false },
)
</script>

<template>
  <div class="awards-page">
    <AwardEditionNavigation :campaigns="campaigns" selected-campaign-id="orange-awards-1" />
    <AwardArchive :edition="1" :entries="firstEditionEntries" />
  </div>
</template>
