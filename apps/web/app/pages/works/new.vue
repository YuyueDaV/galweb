<script setup lang="ts">
import type { Work } from '~/types/forum'
import type { BangumiSubject } from '~/types/catalog'
import { normalizeWorkTitle } from '~/utils/awards'
const auth = useAuth(),
  route = useRoute(),
  { loginOpen } = useForum(),
  api = useRequestFetch()
const { data: works } = await useAsyncData('contribution-works', () => api<Work[]>('/api/works'))
const subject = ref<BangumiSubject | null>(null),
  title = ref(''),
  subtitle = ref(''),
  studio = ref(''),
  description = ref(''),
  cover = ref<{ id: string; url: string } | null>(null),
  busy = ref(false),
  uploading = ref(false),
  ready = ref(false),
  error = ref('')
const created = ref<Work | null>(null),
  completionOpen = ref(false),
  searchVersion = ref(0)
async function continueAdding() {
  created.value = null
  subject.value = null
  title.value = ''
  subtitle.value = ''
  studio.value = ''
  description.value = ''
  cover.value = null
  error.value = ''
  searchVersion.value++
  if (Object.keys(route.query).length) await navigateTo('/works/new', { replace: true })
  await nextTick()
  document.getElementById('bangumi-query')?.focus()
}
async function viewCreated() {
  if (created.value) await navigateTo('/works/' + created.value.rank)
}
const duplicate = computed(() => {
  const keys = [title.value, subtitle.value, subject.value?.title, subject.value?.originalTitle]
    .filter(Boolean)
    .map((s) => normalizeWorkTitle(s!))
    .filter(Boolean)
  return works.value?.find(
    (work) =>
      (subject.value && work.bangumi?.id === subject.value.id) ||
      [work.title, work.subtitle, work.bangumi?.title, work.bangumi?.originalTitle]
        .filter(Boolean)
        .some((s) => keys.includes(normalizeWorkTitle(s!))),
  )
})
function select({ subject: item }: { subject: BangumiSubject }) {
  subject.value = item
  title.value = item.title
  subtitle.value = item.originalTitle
  studio.value = item.studio
  description.value = item.summary
  error.value = ''
}
onMounted(async () => {
  await auth.initialize()
  const id = Number(route.query.bangumi)
  if (Number.isSafeInteger(id) && id > 0)
    try {
      select({
        subject: await $fetch<BangumiSubject>(
          '/api/bangumi/subjects/' + id + (route.query.restricted === '1' ? '?includeRestricted=true' : ''),
        ),
      })
    } catch (e) {
      error.value =
        (e as { data?: { message?: string } }).data?.message ||
        '未能加载 Bangumi 资料，可重新搜索或手动填写。'
    } finally {
      ready.value = true
    }
  else ready.value = true
})
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file || uploading.value) return
  error.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    error.value = '封面请选择 JPG、PNG 或 WebP，最大 5 MB。'
    return
  }
  uploading.value = true
  try {
    const data = new FormData()
    data.append('file', file)
    cover.value = await auth.request<{ id: string; url: string }>('/uploads', data)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    uploading.value = false
  }
}
async function save() {
  if (busy.value || uploading.value || duplicate.value || created.value) return
  busy.value = true
  error.value = ''
  try {
    const work = await auth.request<Work>('/works', {
      subjectId: subject.value?.id || null,
      title: title.value,
      subtitle: subtitle.value,
      studio: studio.value,
      description: description.value,
      coverAssetId: cover.value?.id || null,
    })
    works.value = [...(works.value || []).filter((item) => item.rank !== work.rank), work]
    created.value = work
    completionOpen.value = true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
useSeoMeta({ title: '添加书库作品 · 澄之响', robots: 'noindex,nofollow' })
</script>
<template>
  <div class="experience-page contribution-page">
    <NuxtLink to="/works" class="back-link">← 回到作品书架</NuxtLink>
    <header class="experience-heading">
      <div>
        <p class="eyebrow">SHARE YOUR NEXT STORY</p>
        <h1>把喜欢的作品，放上书架。</h1>
        <p>从 Bangumi 搜索资料，或手动填写；添加人会自动记录。</p>
      </div>
    </header>
    <p v-if="!ready" role="status">正在准备添加作品…</p>
    <div v-else-if="!auth.user.value" class="empty-state">
      <p>登录后即可添加作品和上传封面。</p>
      <button class="button primary" @click="loginOpen = true">登录后添加</button>
    </div>
    <section v-else-if="created" class="experience-card" role="status">
      <h2>作品已添加</h2>
      <p>《{{ created.title }}》已加入书库，要继续添加吗？</p>
      <div class="catalog-actions">
        <button type="button" class="button primary" @click="continueAdding">继续添加</button>
        <button type="button" class="button secondary" @click="viewCreated">查看作品</button>
      </div>
    </section>
    <template v-else
      ><BangumiSearch
        :key="searchVersion"
        :works="works || []"
        selectable
        selection-label="使用这部作品资料"
        @selected="select"
      />
      <form class="experience-card" @submit.prevent="save">
        <fieldset class="plain-fieldset" :disabled="busy || uploading">
          <p v-if="subject" class="catalog-help">
            已选择 Bangumi #{{ subject.id
            }}<button type="button" class="text-link" @click="subject = null">取消关联</button>
          </p>
          <label class="community-field">作品名称<input v-model="title" required maxlength="160" /></label
          ><label class="community-field">原文名／其他名称<input v-model="subtitle" maxlength="160" /></label
          ><label class="community-field">制作组<input v-model="studio" maxlength="200" /></label
          ><label class="community-field"
            >作品介绍<textarea v-model="description" rows="6" maxlength="8000"></textarea></label
          ><label class="community-field"
            >上传作品封面<input type="file" accept="image/jpeg,image/png,image/webp" @change="upload"
          /></label>
          <p class="catalog-help">JPG、PNG、WebP，最大 5 MB；不上传时使用 Bangumi 封面。</p>
          <SafeImage
            v-if="cover || subject?.coverUrl"
            class="contribution-cover"
            :src="cover?.url || subject!.coverUrl"
            alt="作品封面预览"
          /><button v-if="cover" type="button" class="text-link" @click="cover = null">移除自选封面</button>
          <p v-if="duplicate" class="duplicate-notice" role="status">
            书库已存在《{{ duplicate.title }}》，不能重复添加。<NuxtLink :to="'/works/' + duplicate.rank"
              >查看已有作品 ↗</NuxtLink
            >
          </p>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button primary" type="submit" :disabled="busy || uploading || !!duplicate">
            {{ busy ? '正在添加…' : uploading ? '正在上传…' : '添加到书库' }}
          </button>
        </fieldset>
      </form></template
    >
    <ActionDialog
      v-model="completionOpen"
      title="作品添加成功"
      :message="`《${created?.title || ''}》已加入书库，要继续添加下一部作品吗？`"
      primary="继续添加"
      secondary="查看作品"
      @primary="continueAdding"
      @secondary="viewCreated"
    />
  </div>
</template>
<style scoped>
.contribution-page {
  max-width: 64rem;
}
.contribution-cover {
  display: block;
  max-width: 12rem;
  max-height: 18rem;
  object-fit: contain;
  margin: 1rem 0;
}
.duplicate-notice {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: var(--orange-soft);
}
.duplicate-notice a {
  display: block;
  color: var(--orange);
}
.contribution-page .text-link {
  margin: 0.5rem;
}
.contribution-page .button {
  margin-top: 1rem;
}
</style>
