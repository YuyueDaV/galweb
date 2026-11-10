<script setup lang="ts">
import { ballotRules, loveChoices, validateWeightedBallot } from '~/utils/awards'
const props = defineProps<{ enabled: boolean }>()
const awards = useAwards(),
  { notify } = useForum()
const rules = computed(() => ballotRules(awards.campaign.value))
const loves = ref<string[]>([]),
  likes = ref<string[]>([]),
  texts = ref<Record<string, string>>({}),
  busy = ref(false),
  error = ref('')
const selected = computed(() => [...loves.value, ...likes.value].filter(Boolean))
const payload = computed(() => ({
  loveId: loves.value.filter(Boolean)[0] || null,
  loveIds: loves.value.filter(Boolean),
  likeIds: likes.value.filter(Boolean),
  recommendations: selected.value.flatMap((candidateId) =>
    texts.value[candidateId]?.trim() ? [{ candidateId, text: texts.value[candidateId]!.trim() }] : [],
  ),
}))
function restore() {
  const ballot = awards.myBallot.value
  const oldLoves = ballot ? loveChoices({ loveId: ballot.loveId || null, loveIds: ballot.loveIds }) : []
  loves.value = Array.from({ length: rules.value.loveLimit }, (_, i) => oldLoves[i] || '')
  likes.value = Array.from({ length: rules.value.likeLimit }, (_, i) => ballot?.likeIds?.[i] || '')
  texts.value = Object.fromEntries((ballot?.recommendations || []).map((r) => [r.candidateId, r.text]))
  error.value = ''
}
watch(() => awards.myBallot.value, restore, { immediate: true, deep: true })
function changed() {
  for (const id of Object.keys(texts.value)) if (!selected.value.includes(id)) delete texts.value[id]
}
async function save() {
  if (busy.value || !props.enabled) return
  error.value = validateWeightedBallot(payload.value, awards.votingCandidates.value, rules.value)
  if (error.value) return
  busy.value = true
  try {
    await awards.saveWeightedBallot(payload.value)
    notify('选票与推荐词已保存，欢迎投票！')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function withdraw() {
  if (busy.value || !props.enabled) return
  busy.value = true
  try {
    await awards.withdrawBallot()
    restore()
    notify('选票及推荐词已撤回。')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="weighted-ballot award-admin-card" aria-label="真爱与喜爱选票">
    <h2>欢迎投票，把喜欢留给故事。</h2>
    <p>
      真爱票最多 {{ rules.loveLimit }} 张（各 {{ rules.lovePoints }} 分），喜爱票最多
      {{ rules.likeLimit }} 张（各 {{ rules.likePoints }} 分）。同一作品只能选择一次，票数不必用满。
    </p>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || !enabled">
        <label v-for="index in rules.loveLimit" :key="'love' + index"
          >真爱票 {{ index }} · {{ rules.lovePoints }} 分<select v-model="loves[index - 1]" @change="changed">
            <option value="">暂不投这张真爱票</option>
            <option
              v-for="work in awards.votingCandidates.value"
              :key="work.id"
              :value="work.id"
              :disabled="likes.includes(work.id) || loves.some((id, i) => id === work.id && i !== index - 1)"
            >
              {{ work.title }}
            </option>
          </select></label
        >
        <label v-for="index in rules.likeLimit" :key="'like' + index"
          >喜爱票 {{ index }} · {{ rules.likePoints }} 分<select v-model="likes[index - 1]" @change="changed">
            <option value="">暂不投这张喜爱票</option>
            <option
              v-for="work in awards.votingCandidates.value"
              :key="work.id"
              :value="work.id"
              :disabled="loves.includes(work.id) || likes.some((id, i) => id === work.id && i !== index - 1)"
            >
              {{ work.title }}
            </option>
          </select></label
        >
        <p>
          推荐词选填，仅限自己投票的作品；每个作品最多一份，每份额外加
          {{ rules.recommendationPoints }} 分，每人最多
          {{ rules.recommendationLimit }} 份。提名阶段的说明不参与加分。
        </p>
        <label v-for="id in rules.recommendationLimit ? selected : []" :key="id"
          >给《{{ awards.candidates.value.find((c) => c.id === id)?.title }}》的推荐词 · 选填<textarea
            v-model="texts[id]"
            maxlength="600"
            rows="3"
            placeholder="说说你为什么推荐它，最多 600 字。"
          ></textarea>
        </label>
        <p class="ballot-score">
          本次合计
          {{
            loves.filter(Boolean).length * rules.lovePoints +
            likes.filter(Boolean).length * rules.likePoints +
            payload.recommendations.length * rules.recommendationPoints
          }}
          分
        </p>
        <div class="ballot-actions">
          <button v-if="awards.myBallot.value" type="button" class="button secondary" @click="withdraw">
            撤回选票</button
          ><button type="submit" class="button primary" :disabled="!selected.length">
            {{ busy ? '保存中…' : awards.myBallot.value ? '保存选票修改' : '提交我的选票' }}
          </button>
        </div>
      </fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="!enabled">当前投票时间已结束或尚未开始，选票不可修改。</p>
      <p v-else-if="awards.myBallot.value" role="status">已提交，投票结束前可以修改；以最后提交为准。</p>
    </form>
  </section>
</template>
<style scoped>
.weighted-ballot {
  margin: 1.5rem 0;
}
.weighted-ballot h2 {
  font-family: var(--serif);
  font-size: 1.4rem;
}
.weighted-ballot p {
  font-size: 0.8rem;
  line-height: 1.8;
  color: var(--subtle);
  margin: 0.7rem 0;
}
.weighted-ballot fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
}
.weighted-ballot label {
  display: grid;
  gap: 0.5rem;
  font-size: 0.8rem;
  margin: 1rem 0;
}
.weighted-ballot select,
.weighted-ballot textarea {
  width: 100%;
  min-width: 0;
  padding: 0.7rem;
  background: var(--bg);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 0.5rem;
}
.weighted-ballot .ballot-score {
  color: var(--orange);
}
.ballot-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
</style>
