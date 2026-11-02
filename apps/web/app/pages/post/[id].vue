<script setup lang="ts">
import { coverUrl, works } from '~/data/forum'
const route = useRoute()
const { posts, replies, bookmarks, likes, username, toggleBookmark, toggleLike, replyCount, addReply,fetchPost,recordView,reactionPending,notify } = useForum()
const post = computed(() => posts.value.find(item => item.id === route.params.id))
const postReplies = computed(() => replies.value.filter(item => item.postId === post.value?.id))
const relatedWork = computed(() => works.find(work => work.rank === post.value?.image))
const reply = ref('')
const spoilerVisible = ref(false)
const replyInput = ref<HTMLTextAreaElement | null>(null)
const auth=useAuth(),editing=ref(false),editTitle=ref(''),editContent=ref(''),deleteConfirm=ref(false)
const canEdit=computed(()=>!!auth.user.value&&(auth.user.value.id===post.value?.userId||auth.user.value.role!=='member'))
function startEdit(){editTitle.value=post.value?.title||'';editContent.value=post.value?.content.join('\n\n')||'';editing.value=true}
async function saveEdit(){try{await auth.request('/posts/'+post.value!.id,{title:editTitle.value,content:editContent.value},'PATCH');await load(false);editing.value=false;notify('修改已保存。')}catch(e){notify((e as Error).message)}}
async function deletePost(){if(!deleteConfirm.value){deleteConfirm.value=true;return}try{await auth.request('/posts/'+post.value!.id,{status:'deleted'},'PATCH');await navigateTo('/')}catch(e){notify((e as Error).message)}}
watch(() => route.params.id, () => { spoilerVisible.value = false; reply.value = '' })
useSeoMeta({ title: () => `${post.value?.title || '未找到帖子'} · 澄之响` })
async function scrollToReplies(){await nextTick();if(route.hash==='#replies')document.getElementById('replies')?.scrollIntoView({block:'start'})}
async function load(countView=true){const id=String(route.params.id);try{await fetchPost(id);if(String(route.params.id)!==id)return;await scrollToReplies();if(countView)await recordView(id)}catch(e){notify((e as Error).message)}}
onMounted(()=>load())
watch(()=>route.params.id,()=>load())
watch(()=>route.hash,scrollToReplies)
async function submitReply() { if (post.value && reply.value.trim()) { try{await addReply(post.value.id, reply.value); reply.value = ''}catch(e){notify((e as Error).message)} } }
</script>

<template>
  <div v-if="post" class="detail-grid">
    <div><NuxtLink to="/#discussions" class="back-link"><AppIcon name="arrowLeft" :size="16" />回到社区广场</NuxtLink>
      <article class="post-detail"><div class="detail-tags"><span class="post-category">{{ post.category }}</span><span v-if="post.pinned" class="post-label pinned"><AppIcon name="pin" :size="12" />置顶</span><span v-if="post.spoiler" class="post-label spoiler">包含剧透</span></div><h1>{{ post.title }}</h1><div class="detail-author"><UserAvatar class="post-avatar" :class="post.avatarColor" :src="post.userId===auth.user.value?.id?auth.user.value?.avatarUrl:post.avatarUrl" :name="post.author" /><div><strong>{{ post.author }}<span v-if="post.author === '澄之响编辑部'" class="editor-badge">主理人</span></strong><span>{{ post.time }}<span class="meta-dot">·</span>{{ post.views }} 次阅读</span></div><button class="icon-button" :aria-label="bookmarks.includes(post.id) ? '取消收藏' : '收藏帖子'" :aria-pressed="bookmarks.includes(post.id)" :disabled="reactionPending(post.id,'bookmark')" :aria-busy="reactionPending(post.id,'bookmark')" @click="toggleBookmark(post.id)"><AppIcon name="bookmark" /></button></div>
        <div v-if="canEdit" class="detail-actions"><button class="text-link" @click="startEdit">编辑帖子</button><button class="text-link" @click="deletePost">{{ deleteConfirm?'确认删除':'删除帖子' }}</button><button v-if="deleteConfirm" class="text-link" @click="deleteConfirm=false">取消</button></div><form v-if="editing" class="award-form" @submit.prevent="saveEdit"><label>修改标题<input v-model="editTitle" required minlength="4" maxlength="80" /></label><label>修改正文<textarea v-model="editContent" required minlength="10" maxlength="10000" rows="8"></textarea></label><button class="button primary">保存修改</button><button type="button" class="button secondary" @click="editing=false">取消编辑</button></form>
        <div v-if="post.spoiler && !spoilerVisible" class="spoiler-gate"><AppIcon name="eye" :size="28" /><h2>接下来，可能会读到关键剧情。</h2><p>如果还没通关，不妨先把这篇帖子收藏起来。</p><button class="button secondary" @click="spoilerVisible = true">我已知晓，展开正文<AppIcon name="chevronDown" :size="15" /></button></div>
        <div v-else class="post-prose"><img v-if="post.uploadedImage" :src="post.uploadedImage" alt="帖子配图" class="detail-cover" /><img v-if="post.image" :src="coverUrl(post.image)" :alt="relatedWork?.title || '帖子配图'" class="detail-cover" /><p v-for="(paragraph, index) in post.content" :key="index">{{ paragraph }}</p><NuxtLink v-if="post.id === 'orange-awards'" to="/ranking" class="inline-feature-link"><AppIcon name="trophy" />翻开完整的十二橙器书单<AppIcon name="arrowUpRight" :size="17" /></NuxtLink></div>
        <div class="detail-post-tags"><span v-for="tag in post.tags" :key="tag"># {{ tag }}</span></div><div class="detail-actions"><button :class="['button', likes.includes(post.id) ? 'liked' : 'secondary']" :aria-pressed="likes.includes(post.id)" :disabled="reactionPending(post.id,'like')" :aria-busy="reactionPending(post.id,'like')" @click="toggleLike(post.id)"><AppIcon name="heart" :size="17" />{{ likes.includes(post.id) ? '已送出回响' : '送出一声回响' }}<span>{{ post.likes }}</span></button><button class="text-link" :aria-pressed="bookmarks.includes(post.id)" :disabled="reactionPending(post.id,'bookmark')" :aria-busy="reactionPending(post.id,'bookmark')" @click="toggleBookmark(post.id)"><AppIcon name="bookmark" :size="17" />{{ bookmarks.includes(post.id) ? '已收藏' : '收藏这篇故事' }}</button></div>
      </article>
      <section id="replies" class="replies-section"><div class="section-heading"><h2>故事的回响 <span class="reply-total">{{ replyCount(post) }}</span></h2><span class="muted">认真回应，也是一种温柔。</span></div><div v-if="!postReplies.length" class="reply-empty"><AppIcon name="comment" :size="24" /><p>想到了什么？留一句话给作者吧。</p><small>登录后即可参与讨论。</small></div><article v-for="item in postReplies" :key="item.id" class="reply-card"><UserAvatar class="post-avatar orange" :src="item.userId===auth.user.value?.id?auth.user.value?.avatarUrl:item.avatarUrl" :name="item.author" /><div><strong>{{ item.author }}<small>{{ item.time }}</small></strong><p>{{ item.content }}</p></div></article><form class="reply-form" @submit.prevent="submitReply"><label for="reply-content">{{ username || '新来的同好' }}，也来说两句</label><textarea id="reply-content" ref="replyInput" v-model="reply" rows="4" maxlength="3000" required placeholder="把你的感受，接在故事后面……"></textarea><div><span>回复将发布到社区</span><button class="button primary" type="submit" :disabled="!reply.trim()">发布回复<AppIcon name="send" :size="15" /></button></div></form></section>
    </div>
    <aside class="detail-rail"><section v-if="relatedWork" class="rail-card related-work"><p class="eyebrow">STORY IN THIS POST</p><img :src="coverUrl(relatedWork.rank)" :alt="`${relatedWork.title}封面`" /><h2>{{ relatedWork.title }}</h2><p>{{ relatedWork.description }}</p><NuxtLink :to="`/works/${relatedWork.rank}`" class="text-link">前往作品书架<AppIcon name="arrowRight" :size="15" /></NuxtLink></section><section class="rail-card conversation-note"><AppIcon name="leaf" :size="23" /><h2>让讨论，多一点温柔。</h2><p>尊重不同感受，标记关键剧透。<br>我们可以喜欢不同的故事，<br>也可以好好聊聊。</p><NuxtLink to="/post/welcome" class="text-link">社区小约定<AppIcon name="arrowUpRight" :size="14" /></NuxtLink></section></aside>
  </div>
  <div v-else class="empty-state"><AppIcon name="book" :size="36" /><h1>这篇故事暂时找不到了</h1><p>帖子可能已删除或正在审核。</p><NuxtLink to="/" class="button primary">回到社区广场</NuxtLink></div>
</template>
