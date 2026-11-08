<script setup lang="ts">
const value = defineModel<string>({ default: '' })
const props = defineProps<{ target: HTMLTextAreaElement | null; disabled?: boolean }>()
const open = ref(false),
  error = ref(''),
  trigger = ref<HTMLButtonElement | null>(null)
const emojis = [
  ['😀', '开心'],
  ['😊', '微笑'],
  ['😂', '笑哭'],
  ['🥰', '喜爱'],
  ['😍', '心动'],
  ['🤔', '思考'],
  ['😭', '大哭'],
  ['🥹', '感动'],
  ['😅', '汗颜'],
  ['😎', '酷'],
  ['😴', '困了'],
  ['😮', '惊讶'],
  ['👍', '赞'],
  ['👏', '鼓掌'],
  ['🙏', '感谢'],
  ['💪', '加油'],
  ['❤️', '爱心'],
  ['💔', '心碎'],
  ['✨', '闪光'],
  ['🎉', '庆祝'],
  ['🌸', '樱花'],
  ['🍊', '橙子'],
  ['☕', '咖啡'],
  ['🎮', '游戏'],
]
function insert(emoji: string) {
  if (props.disabled) return
  const start = props.target?.selectionStart ?? value.value.length,
    end = props.target?.selectionEnd ?? start
  const next = value.value.slice(0, start) + emoji + value.value.slice(end)
  if (next.length > 3000) {
    error.value = '回复最多 3000 字符。'
    return
  }
  value.value = next
  open.value = false
  error.value = ''
  nextTick(() => {
    props.target?.focus()
    props.target?.setSelectionRange(start + emoji.length, start + emoji.length)
  })
}
function close() {
  open.value = false
  trigger.value?.focus()
}
</script>
<template>
  <section class="emoji-picker" @keydown.esc.stop.prevent="close">
    <button ref="trigger" type="button" :disabled="disabled" :aria-expanded="open" @click="open = !open">
      😊 表情
    </button>
    <div v-if="open" class="emoji-options" role="group" aria-label="选择回复表情">
      <button
        v-for="[emoji, label] in emojis"
        :key="emoji"
        type="button"
        :aria-label="label + ' ' + emoji"
        :disabled="disabled"
        @mousedown.prevent
        @click="insert(emoji!)"
      >
        {{ emoji }}
      </button>
    </div>
    <p v-if="error" role="status">{{ error }}</p>
  </section>
</template>
<style scoped>
.emoji-picker {
  margin: 0.6rem 0;
  position: relative;
}
.emoji-picker > button {
  font-size: 0.8rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  color: var(--ink);
  background: var(--surface);
}
.emoji-options {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  width: min(100%, 23rem);
  gap: 0.2rem;
  padding: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: var(--surface-solid);
  margin-top: 0.4rem;
}
.emoji-options button {
  font-size: 1.4rem;
  min-height: 2.5rem;
  border-radius: 0.4rem;
}
.emoji-options button:hover,
.emoji-options button:focus-visible {
  background: var(--orange-soft);
}
.emoji-picker p {
  font-size: 0.75rem;
  color: var(--orange);
}
</style>
