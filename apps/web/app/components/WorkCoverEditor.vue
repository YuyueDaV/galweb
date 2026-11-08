<script setup lang="ts">
import type { Work } from '~/types/forum'
const props = defineProps<{ work: Work }>(),
  emit = defineEmits<{ updated: [work: Work] }>()
const auth = useAuth(),
  busy = ref(false),
  error = ref(''),
  success = ref('')
async function change(id: string | null) {
  const work = await auth.request<Work>(
    '/works/' + props.work.rank + '/cover',
    { coverAssetId: id, version: props.work.version || 0 },
    'PATCH',
  )
  emit('updated', work)
  success.value = '作品封面已更新。'
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  error.value = ''
  success.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    error.value = '请选择 JPG、PNG 或 WebP，最大 5 MB。'
    return
  }
  busy.value = true
  try {
    const data = new FormData()
    data.append('file', file)
    const image = await auth.request<{ id: string }>('/uploads', data)
    await change(image.id)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function reset() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await change(null)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="experience-card">
    <h2>作品封面</h2>
    <label class="community-field"
      >更换作品封面<input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        :disabled="busy"
        @change="upload"
    /></label>
    <p class="catalog-help">JPG、PNG、WebP，最大 5 MB。添加人和管理员可以更换封面。</p>
    <button v-if="work.coverUrl" type="button" class="button secondary" :disabled="busy" @click="reset">
      {{ work.bangumi ? '恢复 Bangumi 封面' : '清除自选封面' }}
    </button>
    <p v-if="busy" role="status">正在更新封面…</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="success" class="form-success" role="status">{{ success }}</p>
  </section>
</template>
