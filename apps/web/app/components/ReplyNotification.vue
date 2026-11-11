<script setup lang="ts">
import type { InboxItem } from '~/types/community'
import { coverUrl } from '~/data/forum'
const props = defineProps<{ item: InboxItem }>()
defineEmits<{ open: []; reply: [] }>()
const action = computed(() =>
  props.item.parentId
    ? props.item.replyToMe
      ? '回复了我的评论'
      : '回复了' + (props.item.parentAuthor || '其他同好') + '的评论'
    : '评论了我的帖子',
)
const cover = computed(() => {
  if (/^\/api\/assets\/[a-f0-9-]{36}$/i.test(props.item.postCoverUrl || '')) return props.item.postCoverUrl!
  const image = Number(props.item.postImage)
  return Number.isInteger(image) && image >= 1 && image <= 12 ? coverUrl(image) : ''
})
</script>

<template>
  <div class="reply-notification">
    <NuxtLink
      v-if="item.replyAuthorId"
      :to="'/user/' + item.replyAuthorId"
      class="notification-avatar"
      :aria-label="'查看' + item.replyAuthor + '的主页'"
    >
      <UserAvatar :src="item.replyAvatarUrl" :name="item.replyAuthor || '同好'" size="2.25rem" />
    </NuxtLink>
    <UserAvatar v-else :src="item.replyAvatarUrl" :name="item.replyAuthor || '同好'" size="2.25rem" />
    <div class="reply-notification-main">
      <div class="reply-notification-heading">
        <NuxtLink v-if="item.replyAuthorId" :to="'/user/' + item.replyAuthorId" class="notification-sender">{{
          item.replyAuthor
        }}</NuxtLink>
        <span v-else class="notification-sender">{{ item.replyAuthor || '一位同好' }}</span>
        <span class="notification-action">{{ action }}</span>
        <span v-if="!item.readAt" class="notification-unread">未读</span>
      </div>
      <button type="button" class="notification-open" aria-label="查看回复" @click="$emit('open')">
        <span class="notification-excerpt">{{ item.excerpt }}</span>
      </button>
      <div v-if="item.parentId" class="notification-context">
        <span class="notification-context-label">{{
          item.replyToMe ? '我的评论' : (item.parentAuthor || '同好') + '的评论'
        }}</span>
        <span class="notification-quote">{{ item.parentExcerpt || '原留言已隐藏或删除。' }}</span>
      </div>
      <div class="reply-notification-meta">
        <time :datetime="new Date(Number(item.createdAt)).toISOString()">{{
          new Date(Number(item.createdAt)).toLocaleString('zh-CN')
        }}</time>
        <button
          v-if="item.replyId"
          type="button"
          class="notification-reply"
          aria-label="回复这条消息"
          @click="$emit('reply')"
        >
          <AppIcon name="comment" :size="13" />回复
        </button>
      </div>
    </div>
    <a
      :href="item.link"
      class="notification-source"
      :class="{ 'has-cover': cover }"
      :aria-label="'查看帖子：' + item.postTitle"
      @click.prevent="$emit('open')"
    >
      <SafeImage v-if="cover" :src="cover" :alt="item.postTitle || '帖子配图'" loading="lazy" />
      <span v-else class="notification-source-kicker">来自帖子</span>
      <span class="notification-source-title">{{ item.postTitle }}</span>
    </a>
  </div>
</template>

<style scoped>
.reply-notification {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 7rem;
  gap: 0.85rem;
  align-items: start;
}
.reply-notification-main {
  min-width: 0;
}
.reply-notification-heading {
  display: flex;
  align-items: baseline;
  gap: 0.35rem 0.55rem;
  flex-wrap: wrap;
  font-size: 0.7rem;
  line-height: 1.7;
}
.notification-sender {
  font-weight: 500;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.notification-action {
  color: var(--subtle);
}
.notification-unread {
  color: var(--orange);
  background: var(--orange-soft);
  border-radius: 999px;
  font-size: 0.55rem;
  padding: 0.05rem 0.4rem;
}
.notification-open {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.25rem 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  color: var(--ink);
}
.notification-excerpt {
  display: block;
  color: var(--ink);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.8rem;
  line-height: 1.85;
}
.notification-context {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
  flex-wrap: wrap;
  margin-top: 0.25rem;
  padding: 0.3rem 0.55rem;
  background: var(--bg);
  border-left: 2px solid var(--line);
  border-radius: 0.2rem;
  line-height: 1.7;
}
.notification-context-label {
  color: var(--muted);
  font-size: 0.6rem;
}
.notification-quote {
  color: var(--subtle);
  font-size: 0.65rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.reply-notification-meta {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-top: 0.55rem;
  color: var(--muted);
  font-size: 0.6rem;
  line-height: 1.8;
}
.reply-notification-meta time {
  width: auto;
  padding: 0;
  margin: 0;
  color: inherit;
  font-size: inherit;
}
.notification-reply {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0;
  font-size: inherit;
  color: var(--muted);
}
.notification-reply:hover {
  color: var(--orange);
}
.notification-source {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 0.6rem;
  line-height: 1.6;
}
.notification-source :deep(img),
.notification-source :deep(.image-fallback) {
  width: 4rem;
  height: 3.2rem;
  object-fit: cover;
  border-radius: 0.25rem;
}
.notification-source-title {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.notification-source:hover {
  color: var(--orange);
}
.notification-source-kicker {
  font-size: 0.5rem;
  color: var(--muted);
}
@media (max-width: 600px) {
  .reply-notification {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.6rem;
  }
  .notification-source {
    grid-column: 2;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .notification-source-title {
    -webkit-line-clamp: 2;
  }
  .notification-source-kicker {
    flex-shrink: 0;
  }
  .notification-source :deep(img),
  .notification-source :deep(.image-fallback) {
    width: 2.2rem;
    height: 1.7rem;
    flex-shrink: 0;
  }
  .reply-notification-meta {
    font-size: 11px;
  }
}
</style>
