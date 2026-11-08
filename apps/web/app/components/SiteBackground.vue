<script setup lang="ts">
import { DEFAULT_BACKGROUND_IMAGE, DEFAULT_BACKGROUND_MOBILE } from '~/utils/site-background'
const { settings, load } = useSiteSettings()
const background = computed(() => settings.value.background)
const customSource = computed(() =>
  background.value.assetId ? '/api/assets/' + background.value.assetId : '',
)
const customFailed = ref(false),
  defaultFailed = ref(false)
const source = computed(() =>
  customSource.value && !customFailed.value ? customSource.value : DEFAULT_BACKGROUND_IMAGE,
)
watch(customSource, () => {
  customFailed.value = false
  defaultFailed.value = false
})
function imageFailed() {
  if (source.value === customSource.value) customFailed.value = true
  else defaultFailed.value = true
}
let timer: ReturnType<typeof setInterval> | undefined
function refresh() {
  if (document.visibilityState === 'visible') void load().catch(() => {})
}
onMounted(() => {
  timer = setInterval(refresh, 60000)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('focus', refresh)
  document.removeEventListener('visibilitychange', refresh)
})
const colors = computed(() => ({
  '--site-background-light': background.value.color,
  '--site-background-dark': background.value.darkColor,
}))
</script>
<template>
  <div
    class="site-background"
    :style="colors"
    :class="{ 'solid-background': background.mode === 'solid' }"
    aria-hidden="true"
  >
    <picture v-if="background.mode === 'image' && !defaultFailed" class="header-artwork">
      <source
        v-if="source === DEFAULT_BACKGROUND_IMAGE"
        media="(max-width:899px)"
        :srcset="DEFAULT_BACKGROUND_MOBILE"
      />
      <img
        :src="source"
        alt=""
        width="1920"
        height="1356"
        decoding="async"
        fetchpriority="low"
        @error="imageFailed"
      />
    </picture>
  </div>
</template>
<style>
:root {
  --site-background-light: #f7f6f2;
  --site-background-dark: #1d201c;
}
.site-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--site-background-light);
  pointer-events: none;
}
html[data-theme='dark'] .site-background {
  background: var(--site-background-dark);
}
.site-background .header-artwork {
  display: block;
  inset: 0;
  height: 100%;
  width: 100%;
}
.site-background .header-artwork img {
  object-position: center 40%;
}
.site-background .header-artwork::after {
  background: linear-gradient(
    90deg,
    var(--site-background-light),
    transparent 48%,
    transparent 85%,
    var(--site-background-light)
  );
}
html[data-theme='dark'] .site-background .header-artwork::after {
  background: linear-gradient(
    90deg,
    var(--site-background-dark),
    transparent 48%,
    transparent 85%,
    var(--site-background-dark)
  );
}
</style>
