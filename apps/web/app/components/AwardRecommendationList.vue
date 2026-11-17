<script setup lang="ts">
import type { AwardPublicRecommendation } from '~/types/awards'
defineProps<{ items: AwardPublicRecommendation[] }>()
</script>

<template>
  <section v-if="items.length" class="award-recommendations" aria-label="成员推荐词">
    <h4>
      成员推荐词 <span>{{ items.length }} 篇</span>
    </h4>
    <blockquote v-for="(item, index) in items" :key="index">
      <p>{{ item.text }}</p>
      <footer>
        推荐 / <strong>{{ item.authorName || '已注销用户' }}</strong
        ><span>第 {{ item.round }} 轮</span>
      </footer>
    </blockquote>
  </section>
</template>

<style scoped>
.award-recommendations {
  min-width: 0;
  margin-top: 16px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
  text-align: left;
}
.award-recommendations h4 {
  margin: 0 0 12px;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.8;
}
.award-recommendations h4 > span {
  margin-left: 8px;
  font-size: 13px;
  color: var(--subtle);
  font-weight: 400;
}
.award-recommendations blockquote {
  margin: 0;
  padding: 0 0 0 14px;
  border-left: 2px solid var(--orange);
}
.award-recommendations blockquote + blockquote {
  margin-top: 20px;
}
.award-recommendations blockquote > p {
  display: block;
  margin: 0;
  min-height: 0;
  font-size: 15px;
  line-height: 1.9;
  color: var(--ink);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.award-recommendations footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: 8px;
  color: var(--subtle);
  font-size: 14px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.award-recommendations footer strong {
  color: var(--ink);
  font-weight: 500;
}
</style>
