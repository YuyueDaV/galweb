<script setup lang="ts">
import { clubPromotion as club } from '~/data/club'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const titleId = 'club-promotion-' + useId()
const dialog = ref<HTMLDialogElement | null>(null)
const codeOpen = ref(false)
const copying = ref(false)
const feedback = ref('')
const copyFailed = ref(false)

async function showCode() {
  codeOpen.value = true
  await nextTick()
  dialog.value?.showModal()
}
async function copyGroup() {
  if (copying.value) return
  copying.value = true
  feedback.value = ''
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(club.groupNumber)
    feedback.value = '群号已复制，打开 QQ 搜索群号即可加入。'
  } catch {
    copyFailed.value = true
    feedback.value = '复制失败，请手动复制群号：' + club.groupNumber
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <section class="club-promotion" :class="{ 'club-promotion--compact': compact }" :aria-labelledby="titleId">
    <div class="club-promotion-copy">
      <div class="club-promotion-heading">
        <img
          class="club-promotion-logo"
          :src="club.logo"
          alt="澄之响同好会 Logo"
          width="896"
          height="896"
          loading="lazy"
          decoding="async"
        />
        <div>
          <p class="eyebrow">THE NEXT STORY, TOGETHER</p>
          <h2 :id="titleId">{{ compact ? '来群里，继续聊故事。' : '加入澄之响，让喜欢相遇。' }}</h2>
        </div>
      </div>
      <p class="club-promotion-description">
        作品推荐、阅读感想、社团活动。<br />带着你的喜欢，认识一起聊故事的人。
      </p>
      <p class="club-group-number">
        <span>QQ 群号</span><strong>{{ club.groupNumber }}</strong>
      </p>
      <div class="club-promotion-actions">
        <button type="button" class="button primary" @click="showCode">
          <AppIcon name="image" :size="16" />查看入群二维码
        </button>
        <button type="button" class="button secondary" :disabled="copying" @click="copyGroup">
          <AppIcon name="copy" :size="15" />{{ copying ? '正在复制…' : '复制群号' }}
        </button>
      </div>
      <p
        class="club-copy-feedback"
        :class="{ 'is-error': copyFailed }"
        :role="copyFailed ? 'alert' : 'status'"
        aria-live="polite"
      >
        {{ feedback }}
      </p>
      <p class="club-promotion-hint">使用手机 QQ 扫码，或搜索群号加入。</p>
    </div>
    <figure v-if="!compact" class="club-promotion-code">
      <button type="button" class="club-code-preview" aria-label="放大 QQ 群入群二维码" @click="showCode">
        <img
          :src="club.qrCode"
          :alt="`QQ 群 ${club.groupNumber} 入群二维码，点击放大`"
          :width="club.qrWidth"
          :height="club.qrHeight"
          loading="lazy"
          decoding="async"
        />
      </button>
      <figcaption>点击放大二维码，或保存原图后在 QQ 中识别。</figcaption>
    </figure>
    <dialog
      ref="dialog"
      class="modal club-qr-dialog"
      aria-label="澄之响 QQ 群入群二维码"
      @close="codeOpen = false"
      @click.self="dialog?.close()"
    >
      <div class="club-qr-heading">
        <div>
          <h2>来澄之响，继续我们的故事。</h2>
          <p>QQ 群号：{{ club.groupNumber }}</p>
        </div>
        <button type="button" class="icon-button" aria-label="关闭入群二维码" @click="dialog?.close()">
          <AppIcon name="close" :size="20" />
        </button>
      </div>
      <img
        v-if="codeOpen"
        class="club-qr-poster"
        :src="club.qrCode"
        :alt="`澄之响 QQ 群 ${club.groupNumber} 的原始入群二维码`"
        :width="club.qrWidth"
        :height="club.qrHeight"
      />
      <p class="club-qr-instructions">电脑端用手机 QQ 扫一扫；手机端可保存图片，再到 QQ 中识别。</p>
      <div class="club-qr-actions">
        <a class="button primary" :href="club.qrCode" :download="`澄之响QQ群${club.groupNumber}.png`"
          >保存入群图片</a
        ><a class="button secondary" :href="club.qrCode" target="_blank" rel="noopener noreferrer"
          >打开二维码原图<AppIcon name="arrowUpRight" :size="15"
        /></a>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.club-promotion {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(9rem, 13rem);
  align-items: center;
  gap: 2rem;
  padding: 2rem;
  margin-top: 2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface);
  scroll-margin-top: 8rem;
}
.club-promotion-heading {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.club-promotion-logo {
  width: 4.5rem;
  height: 4.5rem;
  object-fit: contain;
  flex-shrink: 0;
}
.club-promotion .eyebrow {
  font-size: 0.5rem;
  letter-spacing: 0.12em;
}
.club-promotion h2 {
  font-family: var(--serif);
  font-size: 1.45rem;
  font-weight: 500;
  line-height: 1.6;
  margin-top: 0.35rem;
}
.club-promotion-description {
  margin-top: 1rem;
  color: var(--subtle);
  font-size: 0.75rem;
  line-height: 1.9;
}
.club-group-number {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin: 1.2rem 0;
}
.club-group-number > span {
  font-size: 0.65rem;
  color: var(--subtle);
}
.club-group-number > strong {
  font-family: var(--sans);
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  user-select: all;
}
.club-promotion-actions,
.club-qr-actions {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
}
.club-promotion-actions .button {
  font-weight: 500;
}
.club-copy-feedback {
  font-size: 0.65rem;
  color: var(--green);
  line-height: 1.7;
  margin-top: 0.65rem;
  overflow-wrap: anywhere;
}
.club-copy-feedback:empty {
  display: none;
}
.club-copy-feedback.is-error {
  color: #b5432d;
}
.club-promotion-hint {
  color: var(--subtle);
  font-size: 0.6rem;
  line-height: 1.8;
  margin-top: 0.8rem;
}
.club-promotion-code {
  margin: 0;
  text-align: center;
}
.club-code-preview {
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  overflow: hidden;
  background: #fafaff;
  cursor: zoom-in;
}
.club-code-preview img {
  display: block;
  width: 100%;
  height: auto;
}
.club-promotion-code figcaption {
  color: var(--subtle);
  font-size: 0.55rem;
  line-height: 1.7;
  margin-top: 0.5rem;
}
.club-promotion--compact {
  display: block;
  margin-top: 0;
  padding: 1.2rem;
}
.club-promotion--compact .club-promotion-heading {
  gap: 0.65rem;
}
.club-promotion--compact .club-promotion-logo {
  width: 3.25rem;
  height: 3.25rem;
}
.club-promotion--compact h2 {
  font-size: 1rem;
}
.club-promotion--compact .eyebrow {
  font-size: 0.4rem;
}
.club-promotion--compact .club-promotion-description {
  font-size: 0.65rem;
}
.club-promotion--compact .club-group-number {
  margin: 1rem 0;
}
.club-promotion--compact .club-promotion-actions {
  display: grid;
}
.club-promotion--compact .button {
  width: 100%;
  font-size: 0.65rem;
}
.club-qr-dialog {
  width: min(32rem, calc(100% - 1.5rem));
  max-height: 94svh;
  padding: 1rem;
}
.club-qr-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.7rem;
  margin-bottom: 0.6rem;
}
.club-qr-heading h2 {
  font-size: 1rem;
  margin: 0;
}
.club-qr-heading p {
  font-size: 0.65rem;
  color: var(--subtle);
  margin-top: 0.25rem;
}
.club-qr-poster {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 62svh;
  margin: 0 auto;
  object-fit: contain;
  background: #fafaff;
}
.club-qr-instructions {
  color: var(--subtle);
  font-size: 0.6rem;
  text-align: center;
  line-height: 1.8;
  margin: 0.6rem 0;
}
.club-qr-actions {
  justify-content: center;
}
.club-qr-actions .button {
  font-size: 0.65rem;
  font-weight: 500;
}
@media (max-width: 54.6875rem) {
  .club-promotion {
    grid-template-columns: minmax(0, 1fr);
    padding: 1.2rem;
    gap: 1.2rem;
  }
  .club-promotion h2 {
    font-size: 1.15rem;
  }
  .club-promotion-code {
    width: min(100%, 12rem);
    justify-self: center;
  }
  .club-qr-dialog .club-qr-heading h2 {
    font-size: 0.9rem;
  }
}
@media (max-width: 600px) {
  .club-promotion h2 {
    font-size: 1rem;
  }
  .club-group-number > strong {
    font-size: 1rem;
  }
}
</style>
