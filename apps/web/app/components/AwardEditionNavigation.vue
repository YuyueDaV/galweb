<script setup lang="ts">
import type { AwardCampaign } from '~/types/awards'
import { phaseNames } from '~/utils/awards'

const props = defineProps<{ campaigns: AwardCampaign[]; selectedCampaignId: string }>()
const editions = computed(() => [
  ...props.campaigns.filter((item) => item.edition !== 1).sort((a, b) => b.edition - a.edition),
  { id: 'orange-awards-1', edition: 1, phase: 'archived' as const },
])
function selectEdition(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  void navigateTo(id === 'orange-awards-1' ? '/ranking' : { path: '/awards', query: { campaign: id } })
}
</script>

<template>
  <div class="award-page-top">
    <span class="page-kicker"
      ><span class="category-dot orange"></span> THE TWELVE ORANGES · COMMUNITY AWARDS</span
    >
    <label class="award-edition-select">
      <span class="sr-only">选择活动届次</span>
      <select :value="selectedCampaignId" @change="selectEdition">
        <option v-for="item in editions" :key="item.id" :value="item.id">
          第 {{ item.edition }} 届 · {{ phaseNames[item.phase] }}
        </option>
      </select>
    </label>
  </div>
</template>
