<script setup lang="ts">
const auth = useAuth(),
  inbox = useNotifications(),
  { loginOpen } = useForum()
const page = ref(1),
  error = ref(''),
  busy = ref(false)
async function load() {
  await auth.initialize()
  error.value = ''
  try {
    await inbox.load(page.value)
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function readAll() {
  busy.value = true
  error.value = ''
  try {
    await inbox.read()
    page.value = 1
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function open(id: string, link: string) {
  error.value = ''
  try {
    await inbox.read(id)
    if (link) await navigateTo(link)
    else await inbox.load(page.value)
  } catch (e) {
    error.value = (e as Error).message
  }
}
watch(page, load)
watch(
  () => auth.user.value?.id,
  () => {
    page.value = 1
    void load()
  },
)
onMounted(load)
useSeoMeta({ title: '消息通知 · 澄之响', robots: 'noindex,nofollow' })
</script>

<template>
  <div class="experience-page">
    <header class="experience-heading">
      <div>
        <p class="eyebrow">STORIES ANSWERED</p>
        <h1>故事有了回响<span>。</span></h1>
        <p>站点通知、活动消息、回复与提名审核结果会出现在这里。</p>
      </div>
      <button
        v-if="auth.user.value"
        class="button secondary"
        :disabled="busy || !inbox.unread.value"
        @click="readAll"
      >
        全部标为已读
      </button>
    </header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <template v-if="auth.user.value">
      <div v-if="!inbox.items.value.length" class="empty-state">暂时没有新的通知。</div>
      <article
        v-for="item in inbox.items.value"
        :key="item.id"
        class="inbox-item"
        :class="{ unread: !item.readAt }"
      >
        <span class="category-dot" :class="item.readAt ? 'green' : 'orange'"></span>
        <div class="notification-copy">
          <small v-if="item.kind === 'site' || item.kind === 'activity'" class="notification-kind">{{
            item.kind === 'site' ? '站点通知' : '活动通知'
          }}</small>
          <button @click="open(item.id, item.link)">
            <span>{{ item.title }}</span
            ><small v-if="!item.content && item.excerpt" class="notification-excerpt">{{
              item.excerpt
            }}</small>
          </button>
          <p v-if="item.content" class="notification-body">{{ item.content }}</p>
          <button v-if="item.content" class="text-link notification-read" @click="open(item.id, item.link)">
            {{ item.link ? '查看详情 ↗' : item.readAt ? '已读' : '标为已读' }}
          </button>
        </div>
        <time>{{ new Date(Number(item.createdAt)).toLocaleString('zh-CN') }}</time>
      </article>
      <div class="page-controls">
        <button :disabled="page === 1" @click="page--">上一页</button><span>{{ page }}</span
        ><button :disabled="page * 20 >= inbox.total.value" @click="page++">下一页</button>
      </div>
    </template>
    <div v-else class="empty-state">
      <p>登录后查看你的通知。</p>
      <button class="button primary" @click="loginOpen = true">登录</button>
    </div>
  </div>
</template>

<style scoped>
.notification-copy {
  flex: 1;
  min-width: 0;
}
.notification-copy > button {
  display: block;
  width: 100%;
  text-align: left;
  overflow-wrap: anywhere;
}
.notification-excerpt {
  display: block;
  color: var(--subtle);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin-top: 0.3rem;
}
.notification-kind {
  display: block;
  color: var(--orange);
  font-size: 0.65rem;
  margin-bottom: 0.45rem;
}
.notification-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--subtle);
  font-size: 0.8rem;
  line-height: 1.8;
  margin: 0.65rem 0;
}
.notification-copy > .notification-read {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--orange);
}
.inbox-item {
  align-items: flex-start;
}
.inbox-item .category-dot {
  margin-top: 0.5rem;
}
.inbox-item time {
  flex-shrink: 0;
}
@media (max-width: 600px) {
  .inbox-item {
    flex-wrap: wrap;
  }
  .inbox-item time {
    margin-left: 1.4rem;
    width: 100%;
  }
}
</style>
