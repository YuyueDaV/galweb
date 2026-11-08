<script setup lang="ts">
import type { LiquidGlassProps } from '~/types/liquid-glass'

const props = withDefaults(defineProps<LiquidGlassProps>(), {
  as: 'div',
  radius: 999,
  bevelDepth: 14,
  scale: 48,
  aberration: 4,
  frost: 0.4,
  tint: 0.12,
})
const root = ref<HTMLElement | null>(null)
watch(
  () => [props.radius, props.bevelDepth, props.scale, props.aberration, props.frost],
  () => {
    root.value?.dispatchEvent(new Event('liquid-glass:refresh', { bubbles: true }))
  },
  { flush: 'post' },
)
const finite = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
const glassStyle = computed(() => ({
  borderRadius: `${finite(props.radius, 0, 999)}px`,
  '--liquid-depth': finite(props.bevelDepth, 1, 64),
  '--liquid-scale': finite(props.scale, 0, 64),
  '--liquid-aberration': finite(props.aberration, 0, 16),
  '--liquid-frost': finite(props.frost, 0, 12),
  '--liquid-tint': finite(props.tint, 0, 1),
}))
</script>
<template>
  <component :is="as" ref="root" data-liquid-glass-custom :style="glassStyle">
    <div v-if="contentClassName" :class="contentClassName"><slot /></div>
    <slot v-else />
  </component>
</template>
