<script setup lang="ts">
import type { AwardCandidate, AwardResult, AwardPublicRecommendation } from '~/types/awards'
import { nominationDisplayName } from '~/utils/awards'
const props = defineProps<{
  results: AwardResult[]
  candidates: AwardCandidate[]
  weighted: boolean
  ended: boolean
  archived: boolean
  updatedAt: number
  busy: boolean
  error: string
  query: string
  recommendations?: AwardPublicRecommendation[]
}>()
defineEmits<{ refresh: [] }>()
const rows = computed<(AwardResult & { recorded: boolean })[]>(() => {
  const known = new Set(props.results.map((result) => result.id))
  return [
    ...props.results.map((result) => ({ ...result, recorded: true })),
    ...props.candidates
      .filter((candidate) => !known.has(candidate.id))
      .map((candidate) => ({ ...candidate, rank: 0, votes: 0, recorded: false })),
  ]
    .filter((item) => `${item.title} ${item.studio}`.toLowerCase().includes(props.query.trim().toLowerCase()))
    .sort(
      (a, b) =>
        (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title, 'zh-CN'),
    )
})
const timestamp = computed(() =>
  props.updatedAt
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(props.updatedAt)
    : '—',
)
</script>
<template>
  <section class="live-ranking" aria-labelledby="live-ranking-title">
    <header>
      <div>
        <p class="eyebrow">LIVE RANKING</p>
        <h3 id="live-ranking-title">{{ ended ? '已公布排名' : '实时分数排名' }}</h3>
        <p>
          {{
            ended
              ? '已公布分数和名次保持不变。'
              : '每 5 秒更新，按本届计票与加赛规则展示名次；补充投票保留首轮入选顺序。'
          }}
        </p>
      </div>
      <button type="button" class="button secondary" :disabled="busy" @click="$emit('refresh')">
        {{ busy ? '正在更新…' : '刷新排名' }}
      </button>
    </header>
    <p class="ranking-updated">
      <span :class="{ 'is-live': !archived }" />北京时间 {{ timestamp }} 更新{{ archived ? ' · 已归档' : '' }}
    </p>
    <p v-if="error" class="form-error" role="alert">{{ error }}，当前保留上次成功更新的数据。</p>
    <ol v-if="rows.length" class="ranking-list">
      <li
        v-for="item in rows"
        :key="item.id"
        :data-candidate-id="item.id"
        :class="{ 'ranking-leading': item.rank > 0 && item.rank <= 3 && item.votes > 0 }"
      >
        <span class="ranking-place">{{
          item.votes > 0 && item.rank ? String(item.rank).padStart(2, '0') : '—'
        }}</span>
        <div class="ranking-work">
          <h4>{{ item.title }}</h4>
          <p>{{ item.studio || '制作组待补充' }}</p>
          <small>提名人：{{ item.nominations.map(nominationDisplayName).join('、') || '历史记录' }}</small
          ><small v-if="ended && !item.recorded">结果公布后补录 · 不计入历史排名</small>
        </div>
        <div class="ranking-points">
          <small v-for="score in item.tieBreakScores?.slice(-1)" :key="score.round"
            >第 {{ score.round }} 轮加赛 {{ score.votes }} 票</small
          >
          <strong>{{ item.votes }}</strong
          ><span>{{ weighted ? '分' : '票' }}</span
          ><small
            v-if="item.votes > 0 && rows.some((other) => other.id !== item.id && other.rank === item.rank)"
            >并列</small
          >
        </div>
        <AwardRecommendationList
          :items="recommendations?.filter((entry) => entry.candidateId === item.id) || []"
        />
      </li>
    </ol>
    <p v-else class="empty-state">{{ query ? '没有匹配的作品。' : '暂时没有排名数据。' }}</p>
  </section>
</template>
<style scoped>
.ranking-list li > .award-recommendations {
  grid-column: 1 / -1;
}
.live-ranking {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
  padding: 24px;
  min-width: 0;
}
.live-ranking header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.live-ranking h3 {
  font-family: var(--serif);
  font-size: 26px;
  margin: 6px 0 10px;
}
.live-ranking header p:not(.eyebrow),
.ranking-updated {
  font-size: 14px;
  line-height: 1.8;
  color: var(--subtle);
}
.live-ranking header .button {
  min-height: 44px;
  flex-shrink: 0;
  font-size: 14px;
  border-radius: 999px;
}
.ranking-updated {
  margin: 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ranking-updated > span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}
.ranking-updated > span.is-live {
  background: var(--orange);
}
.ranking-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.ranking-list li {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px 16px;
}
.ranking-place {
  font-family: var(--serif);
  font-size: 26px;
  color: var(--subtle);
}
.ranking-leading .ranking-place,
.ranking-points {
  color: var(--orange);
}
.ranking-work h4 {
  font-family: var(--serif);
  font-size: 20px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.ranking-work p,
.ranking-work small {
  display: block;
  font-size: 14px;
  color: var(--subtle);
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.ranking-points {
  white-space: nowrap;
  text-align: right;
}
.ranking-points strong {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
}
.ranking-points > span {
  font-size: 14px;
  margin-left: 4px;
}
.ranking-points small {
  display: block;
  font-size: 13px;
}
.live-ranking .eyebrow {
  font-size: 11px;
}
@media (max-width: 599px) {
  .live-ranking {
    padding: 16px;
  }
  .live-ranking header {
    flex-wrap: wrap;
  }
  .ranking-list li {
    grid-template-columns: 30px minmax(0, 1fr) auto;
    gap: 10px;
    padding: 16px 12px;
  }
  .ranking-work h4 {
    font-size: 18px;
  }
  .ranking-place {
    font-size: 22px;
  }
  .ranking-points strong {
    font-size: 24px;
  }
}
</style>
