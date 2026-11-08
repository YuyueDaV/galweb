<script setup lang="ts">
import type { SiteSettings } from '~/types/community'
const auth = useAuth(),
  site = useSiteSettings(),
  { loginOpen } = useForum(),
  allowed = computed(() => auth.user.value && auth.user.value.role !== 'member')
const clone = (value: SiteSettings): SiteSettings => JSON.parse(JSON.stringify(value))
const form = ref<SiteSettings>(clone(site.settings.value)),
  busy = ref(false),
  uploading = ref(false),
  loading = ref(true),
  error = ref(''),
  success = ref('')
watch(
  form,
  () => {
    success.value = ''
  },
  { deep: true, flush: 'sync' },
)
let loadVersion = 0
async function load() {
  await auth.initialize()
  const run = ++loadVersion,
    viewer = auth.user.value?.id
  if (!allowed.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    await site.load()
    if (run !== loadVersion || viewer !== auth.user.value?.id) return
    form.value = clone(site.settings.value)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    if (run === loadVersion) loading.value = false
  }
}
async function save() {
  if (busy.value || uploading.value || loading.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const data = await auth.request<SiteSettings>('/admin/site-settings', form.value, 'PUT')
    site.settings.value = data
    form.value = clone(data)
    success.value = '站点配置已保存，网站背景、首页与社团介绍已更新。'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
onMounted(load)
watch(() => auth.user.value?.id, load)
useSeoMeta({ title: '站点配置 · 澄之响', robots: 'noindex,nofollow' })
</script>
<template>
  <div class="experience-page">
    <header class="experience-heading">
      <div>
        <p class="eyebrow">OUR LITTLE CLUB</p>
        <h1>站点配置<span>。</span></h1>
        <p>设置网站背景、首页文案、公告和入社方式。</p>
      </div>
      <NuxtLink to="/admin">返回社区管理</NuxtLink>
    </header>
    <form v-if="allowed" class="experience-card settings-form" @submit.prevent="save">
      <p v-if="loading" role="status" class="catalog-help">正在加载站点配置…</p>
      <fieldset class="plain-fieldset" :disabled="busy || uploading || loading">
        <SiteBackgroundEditor
          v-model="form.background"
          :saved-background="site.settings.value.background"
          :disabled="busy || loading"
          @busy="uploading = $event"
        /><label class="community-field"
          >网站与社团名称<input v-model="form.title" required maxlength="60" /></label
        ><label class="community-field"
          >首页介绍<textarea v-model="form.description" maxlength="300" rows="3"></textarea></label
        ><label class="community-field"
          >首页公告<textarea
            v-model="form.announcement"
            maxlength="500"
            rows="3"
            placeholder="留空则不显示公告"
          ></textarea></label
        ><label class="community-field"
          >入社方式与说明<textarea v-model="form.joinInfo" maxlength="1000" rows="5"></textarea></label
        ><label class="community-field"
          >公开联系方式<input
            v-model="form.contact"
            maxlength="200"
            placeholder="仅填写愿意公开的社团联系方式"
        /></label>
        <h2>友情链接</h2>
        <div v-for="(link, index) in form.links" :key="index" class="link-edit-row">
          <input v-model="link.name" aria-label="友链名称" required maxlength="40" placeholder="名称" /><input
            v-model="link.url"
            aria-label="友链地址"
            type="url"
            required
            maxlength="500"
            placeholder="https://"
          /><button type="button" @click="form.links.splice(index, 1)">移除</button>
        </div>
        <button
          type="button"
          class="text-link"
          :disabled="form.links.length >= 20"
          @click="form.links.push({ name: '', url: '' })"
        >
          添加友情链接
        </button>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <p v-if="success" class="form-success" role="status">{{ success }}</p>
        <button class="button primary" :disabled="busy || uploading">
          {{ busy ? '保存中…' : '保存配置' }}
        </button>
      </fieldset>
    </form>
    <div v-else class="empty-state">
      <p>需要管理员账号。</p>
      <button class="button primary" @click="loginOpen = true">登录</button>
    </div>
  </div>
</template>
