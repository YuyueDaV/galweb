<script setup lang="ts">
import type { SiteBackground } from '~/utils/site-background'
import { DEFAULT_BACKGROUND_IMAGE } from '~/utils/site-background'
const background = defineModel<SiteBackground>({ required: true })
const props = defineProps<{ disabled?: boolean; savedBackground?: SiteBackground }>()
const saved = computed(() => JSON.stringify(props.savedBackground) === JSON.stringify(background.value))
const emit = defineEmits<{ busy: [value: boolean] }>()
const auth = useAuth(),
  input = ref<HTMLInputElement | null>(null),
  uploading = ref(false),
  error = ref(''),
  notice = ref(''),
  previewDark = ref(false),
  failed = ref('')
const src = computed(() =>
  background.value.assetId ? '/api/assets/' + background.value.assetId : DEFAULT_BACKGROUND_IMAGE,
)
const presets = [
  { name: '暖白', color: '#f7f6f2', darkColor: '#1d201c' },
  { name: '米杏', color: '#f4e8dc', darkColor: '#29231f' },
  { name: '浅绿', color: '#e9efe5', darkColor: '#1d2822' },
  { name: '雾蓝', color: '#e8eef5', darkColor: '#1b2532' },
  { name: '淡紫', color: '#eee9f4', darkColor: '#272131' },
]
function preset(value: (typeof presets)[number]) {
  background.value = { ...background.value, color: value.color, darkColor: value.darkColor }
}
watch(src, () => (failed.value = ''))
async function upload(event: Event) {
  const node = event.target as HTMLInputElement,
    file = node.files?.[0]
  node.value = ''
  if (!file || props.disabled || uploading.value) return
  error.value = ''
  notice.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = '请选择 JPG、PNG 或 WebP 背景图片。'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = '背景图片不能超过 5 MB。'
    return
  }
  uploading.value = true
  emit('busy', true)
  try {
    const body = new FormData()
    body.append('file', file)
    const image = await auth.request<{ id: string; url: string }>('/uploads', body)
    background.value = { ...background.value, mode: 'image', assetId: image.id }
    notice.value = '背景图片已上传，保存配置后对所有访客生效。'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    uploading.value = false
    emit('busy', false)
  }
}
</script>
<template>
  <section class="background-editor" aria-labelledby="background-title">
    <h2 id="background-title">网站背景</h2>
    <div class="background-modes" role="group" aria-label="背景类型">
      <button
        v-for="mode in [
          { id: 'image', name: '图片背景' },
          { id: 'solid', name: '纯色背景' },
        ] as const"
        :key="mode.id"
        type="button"
        class="button secondary"
        :aria-pressed="background.mode === mode.id"
        :disabled="disabled || uploading"
        @click="background = { ...background, mode: mode.id }"
      >
        {{ mode.name }}
      </button>
    </div>
    <template v-if="background.mode === 'image'">
      <input
        ref="input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="网站背景图片文件"
        :disabled="disabled || uploading"
        @change="upload"
      />
      <div class="background-upload">
        <button
          type="button"
          class="button secondary"
          :disabled="disabled || uploading"
          @click="input?.click()"
        >
          <AppIcon name="image" :size="16" />{{ uploading ? '上传中…' : '上传背景图片' }}</button
        ><button
          type="button"
          class="text-link"
          :disabled="disabled || uploading || !background.assetId"
          @click="background = { ...background, assetId: null }"
        >
          使用默认插画
        </button>
      </div>
      <p class="catalog-help">支持 JPG、PNG、WebP，最大 5 MB。建议使用清晰的横向图片。</p>
    </template>
    <p class="catalog-help">选择配色预设，或分别设置浅色、深色模式下的背景底色。</p>
    <div class="background-presets" role="group" aria-label="背景配色预设">
      <button
        v-for="item in presets"
        :key="item.name"
        type="button"
        :disabled="disabled || uploading"
        :aria-pressed="background.color === item.color && background.darkColor === item.darkColor"
        @click="preset(item)"
      >
        <span :style="{ background: item.color }" aria-hidden="true"></span>{{ item.name }}
      </button>
    </div>
    <div class="background-colors">
      <label
        >浅色模式背景色<input
          v-model="background.color"
          type="color"
          :disabled="disabled || uploading"
        /><span>{{ background.color }}</span></label
      ><label
        >深色模式背景色<input
          v-model="background.darkColor"
          type="color"
          :disabled="disabled || uploading"
        /><span>{{ background.darkColor }}</span></label
      >
    </div>
    <div class="background-preview-toolbar">
      <span>背景预览</span
      ><button
        type="button"
        class="text-link"
        :aria-pressed="previewDark"
        @click="previewDark = !previewDark"
      >
        {{ previewDark ? '预览浅色模式' : '预览深色模式' }}
      </button>
    </div>
    <div
      class="background-preview"
      :class="{ 'preview-dark': previewDark }"
      :style="{ background: previewDark ? background.darkColor : background.color }"
    >
      <img
        v-if="background.mode === 'image' && failed !== src"
        :src="src"
        alt="网站背景预览"
        @error="failed = src"
      />
      <div class="background-preview-card">
        <strong>故事之外，总有新的回响。</strong
        ><span>{{ background.mode === 'image' ? '图片背景' : '纯色背景' }}</span>
      </div>
    </div>
    <p v-if="failed === src && background.mode === 'image'" class="form-error" role="alert">
      背景图片无法加载，请重新上传或使用默认插画。
    </p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-success" role="status">{{ saved ? '背景设置已保存。' : notice }}</p>
  </section>
</template>
<style scoped>
.background-editor {
  border-block: 1px solid var(--line);
  margin: 1.5rem 0;
  padding: 1rem 0;
}
.background-modes,
.background-upload,
.background-presets,
.background-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.7rem;
  margin: 0.8rem 0;
}
.background-modes .button[aria-pressed='true'],
.background-presets button[aria-pressed='true'] {
  border-color: var(--orange);
  background: var(--orange-soft);
  color: var(--ink);
}
.background-presets button {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.7rem;
}
.background-presets span {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 1px solid var(--line);
}
.background-colors label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  flex-wrap: wrap;
}
.background-colors input {
  width: 2.3rem;
  height: 2rem;
  border: 1px solid var(--line);
  background: var(--surface);
  padding: 0.1rem;
  border-radius: 0.3rem;
}
.background-colors label > span {
  font-size: 0.6rem;
  color: var(--subtle);
}
.background-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  font-size: 0.7rem;
  margin: 1rem 0 0.5rem;
}
.background-preview {
  position: relative;
  min-height: 12rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.background-preview > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 40%;
  opacity: 0.7;
}
.background-preview-card {
  position: relative;
  display: grid;
  gap: 0.6rem;
  border: 1px solid #ffffffb3;
  background: #fffefaeb;
  border-radius: 0.7rem;
  padding: 1.2rem;
  backdrop-filter: blur(8px);
  color: #33352f;
  max-width: 100%;
}
.background-preview-card strong {
  font-size: 0.9rem;
  font-weight: 500;
}
.background-preview-card span {
  font-size: 0.65rem;
}
.preview-dark .background-preview-card {
  background: #242820e8;
  color: #e3e2d7;
  border-color: #d7e1cb3d;
}
@media (max-width: 480px) {
  .background-modes .button {
    flex: 1;
    padding-inline: 0.5rem;
  }
  .background-preview-toolbar {
    flex-wrap: wrap;
  }
}
</style>
