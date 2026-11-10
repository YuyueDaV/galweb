<script setup lang="ts">
const props = defineProps<{ src?: string | null; name?: string; size?: string }>()
const failed = ref(false)
const image = ref<HTMLImageElement | null>(null)
watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
// A server-rendered image can fail before hydration attaches its error handler.
onMounted(() => {
  if (image.value?.complete && image.value.naturalWidth === 0) failed.value = true
})
</script>
<template>
  <span class="user-avatar" :style="size ? { width: size, height: size } : undefined">
    <img
      ref="image"
      v-if="src && !failed"
      :src="src"
      :alt="`${name || '用户'}的头像`"
      @error="failed = true"
    />
    <span v-else aria-hidden="true">{{ Array.from(name || '澄')[0] }}</span>
  </span>
</template>
<style scoped>
:where(.user-avatar) {
  width: 2.25rem;
  height: 2.25rem;
}
.user-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--orange-soft, #f8e8da);
  color: var(--orange);
  vertical-align: middle;
}
.user-avatar > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
