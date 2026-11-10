<script setup lang="ts">
import type { Work } from '~/types/forum'
const props = defineProps<{ work: Work; overlay?: boolean }>()
const honors = computed(
  () =>
    props.work.awardHonors ??
    (props.work.archiveRank
      ? [{ campaignId: 'orange-awards-1', edition: 1, rank: props.work.archiveRank }]
      : []),
)
</script>
<template>
  <span class="work-award-badges" :class="{ 'is-overlay': overlay }" aria-label="作品收录与十二橙器荣誉">
    <span
      v-for="honor in honors"
      :key="honor.campaignId"
      class="work-award-badge"
      :aria-label="`第${honor.edition}届十二橙器，第${honor.rank}名`"
    >
      <AppIcon name="trophy" :size="15" /><span
        ><strong>第 {{ honor.edition }} 届十二橙器</strong
        ><small>第 {{ String(honor.rank).padStart(2, '0') }} 名</small></span
      >
    </span>
    <span v-if="!honors.length" class="work-award-badge is-catalog"
      ><AppIcon name="book" :size="14" /><strong>书库收录</strong></span
    >
  </span>
</template>
<style scoped>
.work-award-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  max-width: 100%;
}
.work-award-badges.is-overlay {
  position: absolute;
  top: 0.65rem;
  left: 0.65rem;
  right: 0.65rem;
  pointer-events: none;
  align-items: flex-start;
}
.work-award-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid #dfc9a2;
  border-radius: 0.4rem;
  background: #fffaf2f5;
  color: #806032;
  box-shadow: 0 2px 8px #0000000a;
  font-family: var(--sans);
  font-weight: 400;
  line-height: 1.5;
}
.work-award-badge > span {
  display: grid;
  gap: 0.05rem;
}
.work-award-badge strong {
  font-size: max(13px, 0.65rem);
  font-weight: 500;
}
.work-award-badge small {
  font-size: max(12px, 0.6rem);
  font-weight: 400;
}
.work-award-badge.is-catalog {
  background: var(--surface);
  border-color: var(--line);
  color: var(--subtle);
}
@media (max-width: 600px) {
  .work-award-badges.is-overlay {
    top: 0.4rem;
    left: 0.4rem;
    right: 0.4rem;
  }
  .work-award-badge {
    gap: 0.25rem;
    padding: 0.25rem 0.35rem;
  }
  .work-award-badge strong {
    font-size: max(12px, 0.6rem);
  }
  .work-award-badge small {
    font-size: max(12px, 0.55rem);
  }
}
</style>
