<script setup lang="ts">
import type { Work } from '~/types/forum'
defineProps<{ works: Work[] }>()
</script>
<template>
  <div class="book-shelf" aria-label="立体作品书架">
    <NuxtLink
      v-for="work in works"
      :key="work.rank"
      :to="`/works/${work.rank}`"
      class="shelf-book tw:flex tw:flex-col tw:items-center tw:min-w-0"
    >
      <div class="shelf-book-object">
        <WorkCover
          :rank="work.rank"
          :src="work.rank > 12 ? work.bangumi?.coverUrl || '/images/work-placeholder.svg' : undefined"
          variant="cover"
          :alt="`${work.title}封面`"
          sizes="(max-width: 600px) 40vw, 220px"
        />
      </div>
      <span class="shelf-book-title tw:text-center">{{ work.title }}</span
      ><span class="shelf-book-studio tw:text-center tw:text-czx-subtle">{{ work.studio }}</span>
    </NuxtLink>
  </div>
</template>
