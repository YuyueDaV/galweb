<script setup lang="ts">
import { MAX_POST_TOPICS, MAX_TOPIC_LENGTH, normalizeTopic, topicKey, validTopic } from '~/utils/topics'
const selected = defineModel<string[]>({ required: true })
const props = defineProps<{ disabled?: boolean }>()
const { topics, load, error: loadError } = useTopics()
const input = ref(''),
  error = ref('')
const inputId = useId()
const suggestions = computed(() =>
  topics.value
    .filter(
      (topic) =>
        !selected.value.some((tag) => topicKey(tag) === topicKey(topic.name)) &&
        topicKey(topic.name).includes(topicKey(input.value)),
    )
    .slice(0, 8),
)
function add(value: string) {
  if (props.disabled) return
  const name = normalizeTopic(value)
  if (!validTopic(name)) {
    error.value = `话题须为 1–${MAX_TOPIC_LENGTH} 个字符，不能包含 #、尖括号或控制字符。`
    return
  }
  if (selected.value.some((tag) => topicKey(tag) === topicKey(name))) {
    error.value = '已选择这个话题。'
    return
  }
  if (selected.value.length >= MAX_POST_TOPICS) {
    error.value = '每篇帖子最多选择 5 个话题。'
    return
  }
  selected.value = [...selected.value, name]
  input.value = ''
  error.value = ''
}
onMounted(load)
</script>
<template>
  <div class="topic-picker">
    <label :for="inputId"
      ># 话题 <span>可选，最多 {{ MAX_POST_TOPICS }} 个</span></label
    >
    <div v-if="selected.length" class="selected-topics">
      <button
        v-for="tag in selected"
        :key="tag"
        type="button"
        :disabled="disabled"
        :aria-label="'移除话题 ' + tag"
        @click="selected = selected.filter((item) => item !== tag)"
      >
        <span># {{ tag }}</span
        ><AppIcon name="close" :size="12" />
      </button>
    </div>
    <div class="topic-entry">
      <input
        :id="inputId"
        v-model="input"
        :disabled="disabled || selected.length >= MAX_POST_TOPICS"
        maxlength="100"
        placeholder="输入话题，或选择下方已有话题"
        @keydown.enter.prevent="add(input)"
      /><button
        type="button"
        class="button secondary"
        :disabled="disabled || !input.trim() || selected.length >= MAX_POST_TOPICS"
        @click="add(input)"
      >
        添加话题
      </button>
    </div>
    <div v-if="suggestions.length && selected.length < MAX_POST_TOPICS" class="suggested-topics">
      <button
        v-for="topic in suggestions"
        :key="topic.name"
        type="button"
        :disabled="disabled"
        :aria-label="'选择话题 ' + topic.name"
        @click="add(topic.name)"
      >
        <span># {{ topic.name }}</span
        ><small>{{ topic.count }}</small>
      </button>
    </div>
    <p v-if="loadError" class="muted">
      已有话题暂时无法加载，仍可输入新话题。<button
        type="button"
        class="text-link"
        :disabled="disabled"
        @click="load()"
      >
        重试
      </button>
    </p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.topic-picker {
  display: grid;
  gap: 12px;
  margin: 22px 0;
  font-size: 14px;
}
.topic-picker label {
  display: flex;
  gap: 12px;
  align-items: center;
}
.topic-picker label span {
  font-size: 12px;
  color: var(--subtle);
}
.topic-entry {
  display: flex;
  gap: 10px;
}
.topic-entry input {
  min-width: 0;
  flex: 1;
  padding: 0.65rem 0.8rem;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  color: var(--ink);
}
.topic-entry .button {
  white-space: nowrap;
  padding: 10px 14px;
}
.selected-topics,
.suggested-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.selected-topics button,
.suggested-topics button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 7px 10px;
  background: var(--surface);
  font-size: 12px;
}
.selected-topics button,
.suggested-topics button {
  max-width: 100%;
  text-align: left;
}
.selected-topics button span,
.suggested-topics button span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.selected-topics button .app-icon,
.suggested-topics small {
  flex-shrink: 0;
}
.selected-topics button {
  color: var(--orange);
}
.suggested-topics small {
  opacity: 0.6;
}
.topic-picker p {
  margin: 0;
  font-size: 12px;
}
@media (max-width: 480px) {
  .topic-picker label {
    flex-wrap: wrap;
  }
  .topic-entry {
    flex-wrap: wrap;
  }
  .topic-entry input {
    flex-basis: 100%;
  }
}
</style>
