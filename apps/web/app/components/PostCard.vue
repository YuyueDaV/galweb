<script setup lang="ts">
import type { ForumPost } from '~/types/forum'

const props=defineProps<{ post: ForumPost }>()
const { bookmarks, toggleBookmark, replyCount, reactionPending } = useForum()
const auth=useAuth()
const failedImage=ref('')
const uploadedThumbnail=computed(()=>props.post.uploadedImage&&props.post.uploadedImage!==failedImage.value?props.post.uploadedImage:null)
</script>

<template>
  <article class="post-card" :class="{ 'pinned-post': post.pinned }">
    <NuxtLink v-if="post.userId" :to="'/user/'+post.userId" :aria-label="'查看'+post.author+'的主页'"><UserAvatar class="post-avatar" :class="post.avatarColor" :src="post.userId===auth.user.value?.id?auth.user.value?.avatarUrl:post.avatarUrl" :name="post.author" /></NuxtLink>
    <UserAvatar v-else class="post-avatar" :class="post.avatarColor" :src="post.userId===auth.user.value?.id?auth.user.value?.avatarUrl:post.avatarUrl" :name="post.author" />
    <div class="post-body">
      <div class="post-meta"><NuxtLink v-if="post.userId" :to="'/user/'+post.userId" class="post-author">{{ post.author }}</NuxtLink><span v-else class="post-author">{{ post.author }}</span><span v-if="post.author === '澄之响编辑部'" class="editor-badge">主理人</span><span class="meta-dot">·</span><span>{{ post.time }}</span><span class="post-category">{{ post.category }}</span></div>
      <NuxtLink :to="`/post/${post.id}`" class="post-title"><span v-if="post.pinned" class="post-label pinned"><AppIcon name="pin" :size="11" />置顶</span><span v-else-if="post.featured" class="post-label featured">精选</span><h3>{{ post.title }}</h3><span v-if="post.spoiler" class="post-label spoiler">剧透</span></NuxtLink>
      <p class="post-excerpt">{{ post.excerpt }}</p>
      <div class="post-bottom"><div class="post-tags"><NuxtLink v-for="tag in post.tags" :key="tag" :to="{ path: '/', query: { tag }, hash: '#discussions' }"># {{ tag }}</NuxtLink></div><div class="post-stats"><span :title="`${post.views} 次浏览`" :aria-label="`${post.views} 次浏览`"><AppIcon name="eye" :size="14" />{{ post.views }}</span><NuxtLink :to="`/post/${post.id}#replies`" :aria-label="`${replyCount(post)} 条回复`" title="查看回复"><AppIcon name="comment" :size="14" />{{ replyCount(post) }}</NuxtLink><button :class="{ saved: bookmarks.includes(post.id) }" :aria-label="bookmarks.includes(post.id) ? '取消收藏帖子' : '收藏帖子'" :aria-pressed="bookmarks.includes(post.id)" :disabled="reactionPending(post.id,'bookmark')" :aria-busy="reactionPending(post.id,'bookmark')" @click="toggleBookmark(post.id)"><AppIcon name="bookmark" :size="15" /></button></div></div>
    </div>
    <NuxtLink v-if="uploadedThumbnail||(!post.pinned&&post.image)" :to="`/post/${post.id}`" class="post-thumbnail" tabindex="-1" aria-hidden="true"><img v-if="uploadedThumbnail" :src="uploadedThumbnail" alt="" loading="lazy" @error="failedImage=post.uploadedImage||''" /><WorkCover v-else-if="post.image" :rank="post.image" variant="post" alt="" /></NuxtLink>
  </article>
</template>
<style scoped>.post-thumbnail>img{display:block;width:100%;height:100%;object-fit:cover}</style>
