<script setup lang="ts">
import type { ForumPost } from '~/types/forum'
import type { MemberProfile } from '~/types/community'
const route = useRoute(),
  api = useRequestFetch(),
  tab = ref('posts'),
  page = ref(1)
const userId = computed(() => String(route.params.id))
const { data: profile, error } = await useAsyncData(
  () => `member:${userId.value}`,
  () => api<MemberProfile>('/api/users/' + encodeURIComponent(userId.value)),
)
const { data: posts, status: postsStatus } = await useAsyncData(
  () => `member-posts:${userId.value}:${page.value}`,
  () =>
    api<{ items: ForumPost[]; total: number }>(
      `/api/users/${encodeURIComponent(userId.value)}/posts?page=${page.value}`,
    ),
)
const { data: replies, status: repliesStatus } = await useAsyncData(
  () => `member-replies:${userId.value}:${page.value}`,
  () =>
    api<{ items: { id: string; postId: string; title: string; content: string }[]; total: number }>(
      `/api/users/${encodeURIComponent(userId.value)}/replies?page=${page.value}`,
    ),
)
const states = { wish: '想读', reading: '在读', finished: '已读' }
const tabs = [
  { id: 'posts', name: '发表的帖子' },
  { id: 'replies', name: '最近回复' },
  { id: 'library', name: '公开书单' },
]
const contentPending = computed(() =>
  tab.value === 'posts'
    ? postsStatus.value === 'pending'
    : tab.value === 'replies' && repliesStatus.value === 'pending',
)
const contentTotal = computed(() =>
  tab.value === 'posts' ? posts.value?.total || 0 : replies.value?.total || 0,
)
const pageCount = computed(() => Math.max(1, Math.ceil(contentTotal.value / 12)))
watch(tab, () => (page.value = 1))
useSeoMeta({
  title: () => `${profile.value?.nickname || '用户主页'} · 澄之响`,
  description: () => profile.value?.signature || '看看这位同好的故事与公开书单。',
})
</script>
<template>
  <div v-if="profile" class="experience-page member-page">
    <header class="member-hero member-card">
      <UserAvatar
        class="member-avatar"
        :src="profile.avatarUrl"
        :name="profile.nickname"
        size="var(--member-avatar-size)"
      />
      <div class="member-identity">
        <p class="eyebrow">A READER, A STORY</p>
        <h1>{{ profile.nickname }}</h1>
      </div>
      <p class="member-signature">{{ profile.signature || '故事之外，期待与你相遇。' }}</p>
      <dl class="member-stats">
        <div>
          <dt>发表帖子</dt>
          <dd>{{ profile.stats.posts }}<span>篇</span></dd>
        </div>
        <div>
          <dt>参与回复</dt>
          <dd>{{ profile.stats.replies }}<span>条</span></dd>
        </div>
        <div>
          <dt>加入社区</dt>
          <dd class="member-joined">{{ new Date(Number(profile.createdAt)).toLocaleDateString('zh-CN') }}</dd>
        </div>
      </dl>
    </header>

    <nav class="experience-tabs member-tabs" aria-label="用户主页内容">
      <button
        v-for="item in tabs"
        :id="'member-tab-' + item.id"
        :key="item.id"
        type="button"
        :aria-pressed="tab === item.id"
        @click="tab = item.id"
      >
        {{ item.name }}
      </button>
    </nav>

    <div class="member-content member-card" :aria-busy="contentPending">
      <p v-if="contentPending" class="member-loading" role="status">
        正在加载{{ tab === 'posts' ? '帖子' : '回复' }}…
      </p>
      <template v-else>
        <section v-if="tab === 'posts'" aria-labelledby="member-tab-posts">
          <PostCard v-for="post in posts?.items" :key="post.id" :post="post" />
          <p v-if="!posts?.items.length" class="empty-state">还没有公开的帖子。</p>
        </section>
        <section v-if="tab === 'replies'" aria-labelledby="member-tab-replies">
          <article v-for="item in replies?.items" :key="item.id" class="public-reply">
            <h2>
              <NuxtLink :to="'/post/' + item.postId + '#reply-' + item.id">{{ item.title }}</NuxtLink>
            </h2>
            <p>{{ item.content }}</p>
            <NuxtLink :to="'/post/' + item.postId + '#reply-' + item.id" class="member-discussion-link"
              >查看讨论 <AppIcon name="arrowUpRight" :size="16"
            /></NuxtLink>
          </article>
          <p v-if="!replies?.items.length" class="empty-state">还没有公开回复。</p>
        </section>
        <section v-if="tab === 'library'" class="member-library" aria-labelledby="member-tab-library">
          <article v-for="item in profile.library" :key="item.workId" class="member-library-entry">
            <span class="member-reading-state">{{ states[item.state] }}</span>
            <h2>
              <NuxtLink :to="'/works/' + item.workId">{{ item.work.title }}</NuxtLink>
            </h2>
            <p>{{ item.note || '暂未留下短评。' }}</p>
          </article>
          <p v-if="!profile.library.length" class="empty-state">这位同好暂未公开书单。</p>
        </section>
      </template>
      <nav
        v-if="tab !== 'library' && contentTotal > 12"
        class="page-controls member-pagination"
        aria-label="个人空间分页"
      >
        <button type="button" :disabled="contentPending || page === 1" @click="page--">上一页</button>
        <span>{{ page }} / {{ pageCount }}</span>
        <button type="button" :disabled="contentPending || page >= pageCount" @click="page++">下一页</button>
      </nav>
    </div>
  </div>
  <div v-else class="experience-page member-page">
    <section class="member-card member-unavailable">
      <h1>暂时无法打开这个用户主页</h1>
      <p>{{ error ? '用户可能已停用、注销，或服务暂不可用。' : '' }}</p>
      <NuxtLink to="/" class="button secondary">回到社区</NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.member-page {
  --member-avatar-size: 96px;
  max-width: 64rem;
  padding-top: 1rem;
}
.member-card {
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--muted) 30%, transparent);
  border-radius: 24px;
  background: rgb(var(--liquid-rgb) / 95%);
  box-shadow:
    0 8px 32px var(--liquid-shadow),
    inset 0 1px 0 var(--liquid-highlight);
}
.member-page .member-hero {
  display: grid;
  grid-template-columns: var(--member-avatar-size) minmax(0, 1fr);
  align-items: start;
  gap: 12px 24px;
  padding: 28px;
  margin-bottom: 20px;
}
.member-avatar {
  grid-column: 1;
  grid-row: 1 / 4;
  border: 3px solid var(--liquid-edge);
  box-shadow: 0 4px 16px var(--liquid-shadow);
}
.member-identity {
  min-width: 0;
}
.member-identity .eyebrow {
  margin: 0 0 6px;
  color: var(--subtle);
  font-size: 11px;
  letter-spacing: 0.16em;
}
.member-identity h1 {
  margin: 0;
  font-size: clamp(28px, 3vw, 40px);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.member-page .member-signature {
  grid-column: 2;
  margin: 0;
  max-width: none;
  color: var(--subtle);
  font-size: 16px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.member-stats {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 16px 32px;
  padding-top: 16px;
  margin: 0;
  border-top: 1px solid var(--line);
}
.member-stats > div {
  min-width: 0;
}
.member-stats dt {
  font-size: 13px;
  color: var(--subtle);
  margin-bottom: 5px;
}
.member-stats dd {
  margin: 0;
  font-size: 22px;
  color: var(--ink);
  line-height: 1.5;
}
.member-stats dd span {
  font-size: 13px;
  color: var(--subtle);
  margin-left: 5px;
}
.member-stats .member-joined {
  padding-top: 4px;
  font-size: 16px;
}
.member-page .member-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  margin: 0 0 20px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(var(--liquid-rgb) / 95%);
}
.member-page .member-tabs button {
  min-width: 0;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 10px 12px;
  font-size: 16px;
  line-height: 1.5;
  background: transparent;
  box-shadow: none;
  white-space: nowrap;
}
.member-page .member-tabs button[aria-pressed='true'] {
  border-color: color-mix(in srgb, var(--orange) 45%, transparent);
  color: var(--orange);
  background: var(--orange-soft);
  font-weight: 500;
}
.member-content {
  min-height: 12rem;
  padding: 8px 24px;
}
.member-content :deep(.post-card) {
  gap: 14px;
  padding: 24px 0;
}
.member-content :deep(.post-card:last-child) {
  border-bottom: 0;
}
.member-content :deep(.post-meta) {
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  line-height: 1.6;
}
.member-content :deep(.post-author) {
  font-size: 14px;
  color: var(--subtle);
}
.member-content :deep(.post-title h3) {
  font-size: 21px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.member-content :deep(.post-excerpt) {
  font-size: 15px;
  color: var(--subtle);
  overflow-wrap: anywhere;
}
.member-content :deep(.post-bottom) {
  flex-wrap: wrap;
  row-gap: 12px;
}
.member-content :deep(.post-tags) {
  min-width: 0;
}
.member-content :deep(.post-tags > a) {
  max-width: 100%;
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}
.member-content :deep(.post-stats) {
  margin-left: auto;
  gap: 14px;
  font-size: 13px;
}
.member-content :deep(.post-stats button) {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
}
.member-content .public-reply {
  padding: 24px 0;
}
.member-content .public-reply:last-child {
  border: 0;
}
.public-reply h2,
.member-library-entry h2 {
  margin: 0;
  font: 500 21px/1.6 var(--serif);
  overflow-wrap: anywhere;
}
.member-content .public-reply > p,
.member-library-entry > p {
  font-size: 16px;
  line-height: 1.85;
  color: var(--subtle);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.member-discussion-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  font-size: 14px;
  color: var(--orange);
}
.member-content .member-library {
  gap: 16px;
  padding-block: 16px;
}
.member-library-entry {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 18px;
}
.member-reading-state {
  display: inline-block;
  padding: 3px 10px;
  margin-bottom: 10px;
  border-radius: 999px;
  color: var(--orange);
  background: var(--orange-soft);
  font-size: 13px;
}
.member-library .empty-state {
  grid-column: 1 / -1;
}
.member-content .empty-state,
.member-loading {
  padding: 40px 12px;
  text-align: center;
  color: var(--subtle);
  font-size: 16px;
  line-height: 1.8;
}
.member-pagination {
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.member-pagination > button {
  min-width: 80px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background-color: var(--orange-soft);
  font-size: 14px;
}
.member-pagination > span {
  font-size: 14px;
  color: var(--subtle);
}
.member-unavailable {
  padding: 32px;
}
.member-unavailable h1 {
  font-size: 26px;
  line-height: 1.6;
}
.member-unavailable p {
  margin-block: 16px;
  font-size: 16px;
  color: var(--subtle);
}
@media (max-width: 599px) {
  .member-page {
    --member-avatar-size: 72px;
  }
  .member-page .member-hero {
    gap: 16px;
    padding: 20px;
    border-radius: 22px;
  }
  .member-avatar {
    grid-row: 1;
  }
  .member-identity {
    align-self: center;
  }
  .member-identity .eyebrow {
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .member-identity h1 {
    font-size: 28px;
  }
  .member-page .member-signature {
    grid-column: 1 / -1;
    font-size: 15px;
  }
  .member-stats {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr minmax(0, 1.4fr);
    gap: 12px;
  }
  .member-stats dd {
    font-size: 20px;
  }
  .member-stats .member-joined {
    font-size: 14px;
    padding-top: 4px;
  }
  .member-page .member-tabs {
    gap: 4px;
    padding: 5px;
  }
  .member-page .member-tabs button {
    padding-inline: 4px;
    font-size: 14px;
  }
  .member-content {
    padding: 0 16px;
    border-radius: 22px;
  }
  .member-content :deep(.post-card) {
    gap: 10px;
  }
  .member-content :deep(.post-thumbnail) {
    display: none;
  }
  .member-content :deep(.post-meta) {
    font-size: 12px;
  }
  .member-content :deep(.post-category) {
    display: none;
  }
  .member-content :deep(.post-title h3) {
    font-size: 20px;
  }
  .member-library-entry {
    padding: 16px;
  }
}
</style>
