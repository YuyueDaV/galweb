<script setup lang="ts">
const props = defineProps<{ source: string; assetIds: string[]; exclude?: string }>()
const remaining = computed(() => {
  const inline = new Set(
    [...props.source.matchAll(/!\[[^\]]*\]\(\s*<?\/api\/assets\/([a-f0-9-]{36})(?:\s|>|\))/gi)].map((m) =>
      m[1]!.toLowerCase(),
    ),
  )
  return [...new Set(props.assetIds)].filter(
    (id) => !inline.has(id.toLowerCase()) && '/api/assets/' + id !== props.exclude,
  )
})
</script>
<template>
  <div v-if="remaining.length" class="post-attachments" aria-label="帖子配图">
    <ReadingImage v-for="id in remaining" :key="id" :src="'/api/assets/' + id" alt="帖子配图" />
  </div>
</template>
<style scoped>
.post-attachments {
  display: grid;
  gap: 1rem;
  margin: 1rem 0;
  min-width: 0;
}
</style>
