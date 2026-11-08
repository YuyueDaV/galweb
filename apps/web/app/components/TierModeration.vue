<script setup lang="ts">
import type { TierList } from '~/types/catalog'
const auth = useAuth(),
  items = ref<TierList[]>([]),
  error = ref(''),
  busy = ref('')
async function load() {
  try {
    items.value = await auth.request<TierList[]>('/admin/tier-moderation')
  } catch (cause) {
    error.value = (cause as Error).message
  }
}
async function moderate(item: TierList) {
  if (busy.value) return
  busy.value = item.id
  error.value = ''
  try {
    await auth.request(
      '/admin/tier-lists/' + item.id + '/moderation',
      { version: item.version, blocked: !item.blocked },
      'PATCH',
    )
    await load()
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = ''
  }
}
onMounted(load)
</script>
<template>
  <section class="experience-card">
    <h2>用户个人榜内容审核</h2>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <article v-for="item in items" :key="item.id" class="catalog-actions">
      <span>{{ item.author?.name }} · {{ item.title }} · {{ item.blocked ? '已下架' : '公开' }}</span
      ><NuxtLink v-if="!item.blocked" :to="'/tiers/' + item.id">查看榜单</NuxtLink
      ><button class="button secondary" :disabled="!!busy" @click="moderate(item)">
        {{ item.blocked ? '恢复展示' : '下架个人榜单' }}
      </button>
    </article>
    <p v-if="!items.length" class="catalog-help">暂无公开的用户个人榜。</p>
  </section>
</template>
