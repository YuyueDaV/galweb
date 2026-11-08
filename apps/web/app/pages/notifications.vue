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
  <div class="experience-page notification-page">
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
      <div v-if="!inbox.items.value.length" class="empty-state notification-empty">暂时没有新的通知。</div>
      <div v-else class="notification-list">
        <article
          v-for="item in inbox.items.value"
          :key="item.id"
          class="inbox-item"
          :class="{ unread: !item.readAt }"
        >
          <header class="notification-meta">
            <span class="notification-kind"
              ><span class="category-dot" :class="item.readAt ? 'green' : 'orange'" aria-hidden="true"></span
              >{{
                { site: '站点通知', activity: '活动通知', reply: '回复消息', nomination: '提名审核' }[
                  item.kind
                ] || '消息通知'
              }}</span
            >
            <span v-if="!item.readAt" class="notification-unread">未读</span>
          </header>
          <div class="notification-copy">
            <button type="button" class="notification-title" @click="open(item.id, item.link)">
              <span>{{ item.title }}</span
              ><small v-if="!item.content && item.excerpt" class="notification-excerpt">{{
                item.excerpt
              }}</small>
            </button>
            <p v-if="item.content" class="notification-body">{{ item.content }}</p>
          </div>
          <footer class="notification-footer">
            <time :datetime="new Date(Number(item.createdAt)).toISOString()">{{
              new Date(Number(item.createdAt)).toLocaleString('zh-CN')
            }}</time>
            <button
              v-if="item.content"
              type="button"
              class="notification-read"
              :disabled="!!item.readAt && !item.link"
              @click="open(item.id, item.link)"
            >
              {{ item.link ? '查看详情 ↗' : item.readAt ? '已读' : '标为已读' }}
            </button>
          </footer>
        </article>
      </div>
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
.notification-page {
  max-width: 64rem;
}
.notification-list {
  display: grid;
  gap: 0.9rem;
  margin: 1.5rem 0;
}
.inbox-item,
.notification-empty {
  min-width: 0;
  display: block;
  padding: 1.25rem 1.4rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow: var(--shadow);
}
.inbox-item.unread {
  border-color: color-mix(in srgb, var(--orange) 35%, var(--line));
  border-left: 3px solid var(--orange);
  padding-left: calc(1.4rem - 2px);
}
.notification-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}
.notification-copy {
  min-width: 0;
}
.inbox-item .notification-title {
  display: block;
  width: 100%;
  text-align: left;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.7;
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
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--subtle);
  font-size: 0.65rem;
}
.notification-unread {
  border-radius: var(--radius-control);
  background: var(--orange-soft);
  color: var(--orange);
  padding: 0.15rem 0.55rem;
  font-size: 0.6rem;
}
.notification-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--subtle);
  font-size: 0.8rem;
  line-height: 1.8;
  margin: 0.65rem 0 0;
}
.notification-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--line);
}
.inbox-item .notification-read {
  flex: 0 0 auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: 0.35rem 0.8rem;
  min-height: 2.2rem;
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--orange);
  background: var(--orange-soft);
}
.inbox-item .notification-read:disabled {
  color: var(--muted);
  background: transparent;
}
.inbox-item .notification-footer time {
  width: auto;
  padding: 0;
  margin: 0;
  font-size: 0.65rem;
  color: var(--subtle);
}
.notification-empty {
  margin: 1.5rem 0;
}
@media (max-width: 600px) {
  .inbox-item {
    padding: 1rem;
  }
  .inbox-item.unread {
    padding-left: calc(1rem - 2px);
  }
  .inbox-item .notification-title {
    font-size: 0.9rem;
  }
  .inbox-item .notification-footer time {
    font-size: 0.6rem;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .inbox-item,
  .notification-empty {
    background: var(--surface);
  }
}
</style>
