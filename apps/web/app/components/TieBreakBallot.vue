<script setup lang="ts">
import { validateTieBreakBallot } from '~/utils/awards'

defineProps<{ enabled: boolean }>()
const awards = useAwards()
const { notify } = useForum()
const groups = computed(() => awards.campaign.value.tieBreakGroups || [])
const choices = ref<Record<number, string>>({})
const selected = computed(() => Object.values(choices.value).filter(Boolean))
const busy = ref(false)
const error = ref('')
const title = (id: string) => awards.candidates.value.find((item) => item.id === id)?.title || '候选作品'
const score = (id: string) =>
  awards.results.value
    .find((item) => item.id === id)
    ?.tieBreakScores?.find((item) => item.round === awards.campaign.value.votingRound)?.votes || 0
watch(
  [awards.myBallot, () => awards.campaign.value.votingRound],
  () => {
    choices.value = Object.fromEntries(
      groups.value.map((group) => [
        group.rank,
        group.candidateIds.find((id) => awards.myBallot.value?.candidateIds.includes(id)) || '',
      ]),
    )
    error.value = ''
  },
  { immediate: true, deep: true },
)
async function save() {
  if (busy.value) return
  error.value = validateTieBreakBallot(selected.value, groups.value)
  if (error.value) return
  busy.value = true
  try {
    await awards.saveBallot(selected.value)
    notify('同票加赛选票已保存。')
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
async function withdraw() {
  if (busy.value) return
  busy.value = true
  try {
    await awards.withdrawBallot()
    notify('已撤回本轮加赛选票。')
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section id="award-tie-break" class="award-admin-card tie-break-ballot" aria-label="同票加赛选票">
    <h2>同票加赛 · 第 {{ awards.campaign.value.votingRound }} 轮</h2>
    <p>
      每组每人最多选择一部作品，每票计 1
      票，可以对部分组弃权。加赛仅决定组内名次，其他名次与原始得分保留；仍同票的作品将继续加赛。
    </p>
    <form @submit.prevent="enabled && save()">
      <fieldset :disabled="busy || !enabled">
        <div v-for="group in groups" :key="group.rank" class="tie-break-group">
          <label
            >第 {{ group.rank }}–{{ group.rank + group.candidateIds.length - 1 }} 名加赛<select
              v-model="choices[group.rank]"
            >
              <option value="">本组暂不投票</option>
              <option v-for="id in group.candidateIds" :key="id" :value="id">{{ title(id) }}</option>
            </select></label
          >
          <p v-for="id in group.candidateIds" :key="id">
            {{ title(id) }} <strong>{{ score(id) }} 票</strong>
          </p>
        </div>
        <div class="tie-break-actions">
          <button v-if="awards.myBallot.value" type="button" class="button secondary" @click="withdraw">
            撤回加赛选票
          </button>
          <button type="submit" class="button primary" :disabled="!selected.length">
            {{ busy ? '保存中…' : awards.myBallot.value ? '保存加赛选票修改' : '提交加赛选票' }}
          </button>
        </div>
      </fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="!enabled">本轮选票已锁定或尚未开放，无法修改。</p>
      <p v-else-if="awards.myBallot.value" role="status">已提交，投票结束前可以修改或撤回。</p>
    </form>
  </section>
</template>

<style scoped>
.tie-break-ballot {
  margin: 1.5rem 0;
  scroll-margin-top: 8rem;
}
.tie-break-ballot h2 {
  font-family: var(--serif);
  font-size: 1.4rem;
}
.tie-break-ballot p,
.tie-break-ballot label {
  font-size: max(14px, 0.75rem);
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.tie-break-ballot p {
  margin: 0.6rem 0;
  color: var(--subtle);
}
.tie-break-ballot fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
}
.tie-break-group {
  padding: 1rem 0;
  border-top: 1px solid var(--line);
}
.tie-break-group label {
  display: grid;
  gap: 0.6rem;
}
.tie-break-group select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--ink);
}
.tie-break-group p {
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
}
.tie-break-group strong {
  flex-shrink: 0;
  color: var(--orange);
}
.tie-break-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
</style>
