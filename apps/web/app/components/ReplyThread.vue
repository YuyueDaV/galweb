<script setup lang="ts">
import type { Reply } from '~/types/forum'
import type { ReplyThread } from '~/utils/reply-threads'
const props = defineProps<{ thread: ReplyThread }>()
defineEmits<{ reply: [item: Reply] }>()
const route = useRoute(),
  expanded = ref(false)
const visible = computed(() => (expanded.value ? props.thread.children : props.thread.children.slice(0, 3)))
function revealTarget() {
  if (props.thread.children.slice(3).some((item) => route.hash === '#reply-' + item.id)) expanded.value = true
}
onMounted(revealTarget)
watch([() => route.hash, () => props.thread.children], revealTarget)
</script>

<template>
  <section
    class="reply-thread"
    :data-thread-id="thread.id"
    :aria-label="thread.root ? thread.root.author + '的评论及回复' : '原留言及回复'"
  >
    <ReplyComment v-if="thread.root" :item="thread.root" @reply="$emit('reply', $event)" />
    <p v-else :id="'reply-' + thread.id" class="reply-unavailable">
      原留言已隐藏、删除或暂不可用，以下回复仍可查看。
    </p>
    <div
      v-if="thread.children.length"
      class="reply-children"
      :aria-label="'这条留言下的' + thread.children.length + '条回复'"
    >
      <ReplyComment
        v-for="item in visible"
        :key="item.id"
        :item="item"
        compact
        @reply="$emit('reply', $event)"
      />
      <button
        v-if="thread.children.length > 3"
        type="button"
        class="reply-more"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起回复' : '共 ' + thread.children.length + ' 条回复，点击查看' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.reply-thread {
  padding: 0.2rem 0 0.9rem;
  border-bottom: 1px solid var(--line);
  min-width: 0;
}
.reply-children {
  margin-left: 3.1rem;
  min-width: 0;
}
.reply-unavailable {
  padding: 1rem 0;
  font-size: 0.7rem;
  line-height: 1.8;
  color: var(--muted);
  scroll-margin-top: 8rem;
}
.reply-more {
  margin-top: 0.3rem;
  padding: 0.3rem 0;
  color: var(--muted);
  font-size: 0.65rem;
  text-align: left;
}
.reply-more:hover {
  color: var(--orange);
}
@media (max-width: 600px) {
  .reply-children {
    margin-left: 2.2rem;
  }
}
</style>
