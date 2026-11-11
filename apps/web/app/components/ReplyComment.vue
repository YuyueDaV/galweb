<script setup lang="ts">
import type { Reply } from '~/types/forum'
defineProps<{ item: Reply; compact?: boolean }>()
defineEmits<{ reply: [item: Reply] }>()
const auth = useAuth()
const route = useRoute()
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
</script>

<template>
  <article
    :id="'reply-' + item.id"
    class="reply-card"
    :class="{ 'is-target': mounted && route.hash === '#reply-' + item.id, 'is-compact': compact }"
  >
    <NuxtLink v-if="item.userId" :to="'/user/' + item.userId" :aria-label="'查看' + item.author + '的主页'">
      <UserAvatar
        :size="compact ? '1.25rem' : '2.25rem'"
        :src="item.userId === auth.user.value?.id ? auth.user.value?.avatarUrl : item.avatarUrl"
        :name="item.author"
      />
    </NuxtLink>
    <div class="reply-main">
      <div class="reply-copy">
        <NuxtLink v-if="item.userId" :to="'/user/' + item.userId" class="reply-author">{{
          item.author
        }}</NuxtLink>
        <span v-else class="reply-author">{{ item.author }}</span>
        <span v-if="item.parentId" class="reply-context"
          >回复
          <span v-if="item.parentUnavailable">原留言（已隐藏或删除）</span>
          <a v-else :href="'#reply-' + item.parentId">{{ item.parentAuthor || '这位同好' }}</a
          >：
        </span>
        <p class="reply-content">{{ item.content }}</p>
      </div>
      <div class="reply-meta">
        <time>{{ new Date(Number(item.createdAt)).toLocaleString('zh-CN') }}</time>
        <button type="button" class="text-link" aria-label="回复这条留言" @click="$emit('reply', item)">
          回复
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.reply-card {
  border: 0;
  padding: 1.15rem 0.4rem;
  gap: 0.85rem;
  border-radius: 0.4rem;
  scroll-margin-top: 8rem;
}
.reply-card > a {
  flex-shrink: 0;
}
.reply-card.is-target {
  animation: reply-target-fade 1s ease-out both;
}
@keyframes reply-target-fade {
  0%,
  15% {
    background-color: var(--orange-soft);
    box-shadow: inset 3px 0 var(--orange);
  }
  100% {
    background-color: transparent;
    box-shadow: inset 3px 0 transparent;
  }
}
.reply-main {
  min-width: 0;
}
.reply-copy {
  overflow-wrap: anywhere;
}
.reply-author {
  display: block;
  color: var(--subtle);
  font-size: 0.7rem;
  font-weight: 500;
  margin-bottom: 0.35rem;
}
.reply-card .reply-content {
  font-size: 0.8rem;
  line-height: 1.85;
  color: var(--ink);
  margin: 0;
  white-space: pre-wrap;
}
.reply-card .reply-context {
  font-size: 0.7rem;
  color: var(--muted);
  line-height: 1.8;
}
.reply-context a {
  color: var(--orange);
  text-underline-offset: 0.2em;
}
.reply-context a:hover {
  text-decoration: underline;
}
.reply-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
  color: var(--muted);
  font-size: 0.6rem;
  line-height: 1.8;
}
.reply-card .reply-meta .text-link {
  margin: 0;
  padding: 0.1rem 0;
  font-size: inherit;
  color: var(--muted);
}
.reply-card .reply-meta .text-link:hover {
  color: var(--orange);
}
.reply-card.is-compact {
  padding: 0.5rem 0.4rem;
  gap: 0.55rem;
}
.is-compact .reply-author {
  display: inline;
  margin: 0 0.45rem 0 0;
  font-size: 0.65rem;
}
.reply-card.is-compact .reply-content {
  display: inline;
  font-size: 0.75rem;
}
.is-compact .reply-context {
  font-size: 0.65rem;
}
.is-compact .reply-meta {
  margin-top: 0.25rem;
}
@media (max-width: 600px) {
  .reply-card {
    gap: 0.65rem;
  }
  .reply-card.is-compact {
    gap: 0.45rem;
  }
  .reply-meta {
    gap: 0.75rem;
    font-size: 11px;
  }
}
</style>
