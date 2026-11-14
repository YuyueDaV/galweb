<script setup lang="ts">
import manifest from '~/data/cover-manifest.json'
import { coverUrl } from '~/data/forum'
type Variant = 'hero' | 'post' | 'rail' | 'cover'
const props = withDefaults(
  defineProps<{
    rank: number
    src?: string
    variant: Variant
    alt?: string
    loading?: 'lazy' | 'eager'
    fetchpriority?: 'high' | 'low' | 'auto'
    sizes?: string
    minWidth?: number
  }>(),
  { alt: '', loading: 'lazy', fetchpriority: 'auto', minWidth: 600 },
)
type Cover = { width: number; height: number; url: string }
const images = computed(() => {
  if (props.src) return []
  const available =
    (manifest as Record<string, Partial<Record<Variant, Cover[]>>>)[String(props.rank)]?.[props.variant] || []
  // Full-size artwork keeps extra sampling detail at the site's preferred 125% zoom.
  return props.variant === 'cover'
    ? available.filter((image) => image.width >= props.minWidth || image === available.at(-1))
    : available
})
const source = computed(
  () =>
    images.value.find(
      (image) => image.width >= { hero: 768, post: 192, rail: 96, cover: 600 }[props.variant],
    ) || images.value.at(-1),
)
const srcset = computed(() => images.value.map((image) => `${image.url} ${image.width}w`).join(', '))
const sizes = computed(
  () =>
    props.sizes ||
    {
      hero: '(max-width: 875px) 280px, 460px',
      post: '(max-width: 875px) 100px, 140px',
      rail: '(max-width: 875px) 40px, 56px',
      cover: '(max-width: 600px) 46vw, (max-width: 1100px) 30vw, 24vw',
    }[props.variant],
)
</script>
<template>
  <SafeImage
    :src="props.src || source?.url || coverUrl(rank)"
    :fallback-src="props.src ? undefined : coverUrl(rank)"
    :srcset="srcset || undefined"
    :sizes="srcset ? sizes : undefined"
    :width="source?.width"
    :height="source?.height"
    :alt="alt"
    :loading="loading"
    :fetchpriority="fetchpriority"
    referrerpolicy="no-referrer"
  />
</template>
