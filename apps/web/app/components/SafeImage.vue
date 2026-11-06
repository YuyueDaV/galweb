<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{ src: string; alt?: string; fallbackSrc?: string; srcset?: string }>(),
  { alt: '' },
)
const failed = ref(false)
const image = ref<HTMLImageElement | null>(null)
const original = ref(false)
const current = computed(() => (original.value && props.fallbackSrc ? props.fallbackSrc : props.src))
watch(
  () => [props.src, props.fallbackSrc],
  () => {
    failed.value = false
    original.value = false
  },
)
function onError() {
  if (!original.value && props.fallbackSrc && props.fallbackSrc !== props.src) original.value = true
  else failed.value = true
}
// An SSR image can fail before hydration attaches its error listener.
onMounted(() => {
  if (image.value?.complete && image.value.naturalWidth === 0) onError()
})
</script>
<template>
  <img
    ref="image"
    v-if="!failed"
    v-bind="$attrs"
    :src="current"
    :alt="alt"
    :srcset="original ? undefined : srcset"
    decoding="async"
    @error="onError"
  />
  <span
    v-else
    v-bind="$attrs"
    class="image-fallback"
    role="img"
    :aria-label="alt ? `${alt}，图片暂不可用` : '图片暂不可用'"
    ><AppIcon name="image" :size="24" /><span>图片暂不可用</span></span
  >
</template>
