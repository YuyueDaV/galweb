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
const honorLabels = computed(() =>
  honors.value.map((honor) => `第${honor.edition}届十二橙器第${honor.rank}名`),
)
</script>
<template>
  <span class="work-award-badges" :class="{ 'is-overlay': overlay }" aria-label="作品收录与十二橙器荣誉">
    <span v-if="honors.length > 1" class="work-award-menu">
      <span class="work-award-summary" :aria-label="honorLabels.join('，')">
        <AppIcon name="trophy" :size="15" /><span
          ><span class="work-award-name">十二橙器 · </span>{{ honors.length }} 届荣誉</span
        ><AppIcon name="chevronDown" :size="14" class="work-award-chevron" />
      </span>
      <span class="work-award-options" role="list">
        <span v-for="honor in honors" :key="honor.campaignId" role="listitem">
          <strong>第 {{ honor.edition }} 届</strong><small>第 {{ String(honor.rank).padStart(2, '0') }} 名</small>
        </span>
      </span>
    </span>
    <span
      v-else-if="overlay && honors.length === 1"
      class="work-award-badge is-compact"
      :aria-label="honorLabels[0]"
    >
      <AppIcon name="trophy" :size="15" /><span
        >第 {{ honors[0].edition }} 届 · 第 {{ String(honors[0].rank).padStart(2, '0') }} 名</span
      >
    </span>
    <template v-else>
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
    </template>
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
.work-award-badge.is-compact {
  padding: 0.3rem 0.5rem;
}
.work-award-badge.is-compact > span {
  display: block;
  font-size: max(12px, 0.6rem);
  font-weight: 400;
  line-height: 1.4;
  white-space: nowrap;
}
.work-award-menu {
  position: relative;
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  pointer-events: auto;
}
.work-award-name {
  display: inline;
}
.work-award-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid #dfc9a2;
  border-radius: 0.4rem;
  background: #fffaf2f5;
  color: #806032;
  box-shadow: 0 2px 8px #0000000a;
  font-size: max(13px, 0.65rem);
  line-height: 1.5;
  white-space: nowrap;
}
.work-award-chevron {
  opacity: 0.7;
  transition: transform 0.18s;
}
.work-award-menu:hover .work-award-chevron,
.work-award-menu:focus-within .work-award-chevron {
  transform: rotate(180deg);
}
.work-award-options {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  z-index: 3;
  display: none;
  width: max-content;
  padding: 0.3rem;
  border: 1px solid #dfc9a2;
  border-radius: 0.4rem;
  background: #fffaf2;
  box-shadow: 0 0.6rem 1.5rem #0000001f;
}
.work-award-menu:hover .work-award-options,
.work-award-menu:focus-within .work-award-options {
  display: grid;
  gap: 0.1rem;
}
.work-award-options > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0.45rem;
  border-radius: 0.25rem;
  color: #806032;
  white-space: nowrap;
}
.work-award-options > span:hover {
  background: #f6ead8;
}
.work-award-options strong {
  font-size: max(12px, 0.6rem);
  font-weight: 500;
}
.work-award-options small {
  font-size: max(12px, 0.6rem);
  font-weight: 400;
}
@media (max-width: 360px) {
  .work-award-name {
    display: none;
  }
}
@media (hover: none) {
  .work-award-badges:not(.is-overlay) .work-award-menu {
    display: inline-grid;
  }
  .work-award-badges:not(.is-overlay) .work-award-options {
    position: static;
    display: grid;
    gap: 0.1rem;
    margin-top: 0.3rem;
    box-shadow: none;
  }
  .is-overlay .work-award-chevron,
  .is-overlay .work-award-options {
    display: none;
  }
}
@media (max-width: 600px) {
  .work-award-summary {
    gap: 0.25rem;
    padding: 0.3rem 0.45rem;
    font-size: max(12px, 0.6rem);
    max-width: 100%;
    min-width: 0;
  }
  .work-award-summary > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
