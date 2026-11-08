<script setup lang="ts">
import type { Work } from '~/types/forum'
const props = defineProps<{ work: Work; embedded?: boolean; disabled?: boolean }>(),
  emit = defineEmits<{ updated: [work: Work]; busy: [value: boolean] }>()
const auth = useAuth(),
  busy = ref(false),
  error = ref(''),
  success = ref('')
watch(busy, (value) => emit('busy', value), { flush: 'sync' })
const resetOpen = ref(false)
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
  if (!file || busy.value || props.disabled) return
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
  if (busy.value || props.disabled) return
  busy.value = true
  error.value = ''
  success.value = ''
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
  <section class="work-cover-editor" :class="embedded ? 'embedded' : 'experience-card'">
    <h2>作品封面</h2>
    <div class="work-cover-layout">
      <WorkCover
        v-if="embedded"
        class="work-cover-preview"
        :rank="work.rank"
        :src="
          work.coverUrl ||
          (work.rank > 12 ? work.bangumi?.coverUrl || '/images/work-placeholder.svg' : undefined)
        "
        variant="cover"
        :alt="work.title + '当前封面'"
      />
      <div class="work-cover-controls">
        <label class="community-field"
          >更换作品封面<input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            :disabled="busy || disabled"
            @change="upload"
        /></label>
        <p class="catalog-help">JPG、PNG、WebP，最大 5 MB。添加人和管理员可以更换封面。</p>
        <button
          v-if="work.coverUrl"
          type="button"
          class="button secondary"
          :disabled="busy || disabled"
          @click="resetOpen = true"
        >
          {{ work.rank <= 12 ? '恢复默认封面' : work.bangumi ? '恢复 Bangumi 封面' : '清除自选封面' }}
        </button>
      </div>
    </div>
    <p v-if="busy" role="status">正在更新封面…</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="success" class="form-success" role="status">{{ success }}</p>
    <p v-else-if="embedded && !busy" class="catalog-help">选择图片后立即更新封面。</p>
    <ActionDialog
      v-model="resetOpen"
      title="恢复作品封面？"
      :message="`将移除《${work.title}》的自选封面，恢复默认图片。作品资料不会改变。`"
      primary="确认恢复"
      secondary="保留当前封面"
      tone="confirm"
      @primary="reset"
    />
  </section>
</template>
<style scoped>
.embedded {
  padding-bottom: 1rem;
  margin: 1rem 0;
  border-bottom: 1px solid var(--line);
}
.work-cover-layout {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.work-cover-preview {
  width: 5rem;
  height: 7rem;
  object-fit: contain;
  background: var(--hero);
  border-radius: 0.4rem;
  flex-shrink: 0;
}
.work-cover-controls {
  min-width: 0;
  flex: 1;
}
@media (max-width: 35rem) {
  .work-cover-layout {
    align-items: flex-start;
    flex-direction: column;
  }
  .work-cover-controls {
    width: 100%;
  }
}
</style>
