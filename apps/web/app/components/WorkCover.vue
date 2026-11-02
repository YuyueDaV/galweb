<script setup lang="ts">
import manifest from '~/data/cover-manifest.json'
import {coverUrl} from '~/data/forum'
const props=withDefaults(defineProps<{rank:number;variant:'hero'|'post'|'rail';alt?:string;loading?:'lazy'|'eager';fetchpriority?:'high'|'low'|'auto'}>(),{alt:'',loading:'lazy',fetchpriority:'auto'})
type Cover={width:number;height:number;url:string}
const images=computed(()=> (manifest as Record<string,Partial<Record<'hero'|'post'|'rail',Cover[]>>>)[String(props.rank)]?.[props.variant]||[])
const source=computed(()=>images.value.find(image=>image.width>=({hero:768,post:192,rail:96}[props.variant]))||images.value.at(-1))
const srcset=computed(()=>images.value.map(image=>`${image.url} ${image.width}w`).join(', '))
const sizes=computed(()=>({hero:'(max-width: 875px) 280px, 460px',post:'(max-width: 875px) 100px, 140px',rail:'(max-width: 875px) 40px, 56px'}[props.variant]))
</script>
<template><img :src="source?.url||coverUrl(rank)" :srcset="srcset||undefined" :sizes="srcset?sizes:undefined" :width="source?.width" :height="source?.height" :alt="alt" :loading="loading" :fetchpriority="fetchpriority" decoding="async" /></template>
