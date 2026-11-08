<script setup lang="ts">
const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    title: string
    message: string
    primary: string
    secondary: string
    tone?: 'success' | 'confirm'
  }>(),
  { tone: 'success' },
)
const emit = defineEmits<{ primary: []; secondary: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const id = useId()
function sync() {
  if (open.value && !dialog.value?.open) dialog.value?.showModal()
  else if (!open.value && dialog.value?.open) dialog.value.close()
}
watch(open, sync, { flush: 'post' })
onMounted(sync)
function choose(action: 'primary' | 'secondary') {
  open.value = false
  if (action === 'primary') emit('primary')
  else emit('secondary')
}
function backdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    open.value = false
}
</script>
<template>
  <dialog
    ref="dialog"
    class="modal action-dialog"
    :aria-labelledby="id + '-title'"
    :aria-describedby="id + '-message'"
    @cancel.prevent="open = false"
    @close="open = false"
    @click="backdrop"
  >
    <button type="button" class="icon-button modal-close" aria-label="关闭提示" @click="open = false">
      <AppIcon name="close" />
    </button>
    <div class="action-dialog-icon">
      <AppIcon :name="props.tone === 'success' ? 'check' : 'info'" :size="26" />
    </div>
    <h2 :id="id + '-title'">{{ title }}</h2>
    <p :id="id + '-message'">{{ message }}</p>
    <div class="action-dialog-buttons">
      <button
        type="button"
        class="button secondary"
        :autofocus="tone === 'confirm'"
        @click="choose('secondary')"
      >
        {{ secondary }}
      </button>
      <button type="button" class="button primary" :autofocus="tone === 'success'" @click="choose('primary')">
        {{ primary }}
      </button>
    </div>
  </dialog>
</template>
<style scoped>
.action-dialog {
  width: min(24rem, calc(100% - 2rem));
  padding: 2rem 1.5rem 1.5rem;
  text-align: center;
}
.action-dialog-icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: var(--orange-soft);
  color: var(--orange);
}
.action-dialog h2 {
  font-family: var(--serif);
  font-size: 1.4rem;
  font-weight: 500;
  line-height: 1.5;
}
.action-dialog p {
  margin: 0.75rem 0 1.5rem;
  color: var(--subtle);
  font-size: 0.8rem;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.action-dialog-buttons {
  display: flex;
  justify-content: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}
.action-dialog-buttons .button {
  flex: 1;
  min-width: 7rem;
}
</style>
