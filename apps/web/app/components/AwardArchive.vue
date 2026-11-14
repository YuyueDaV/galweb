<script setup lang="ts">
import type { AwardArchiveEntry } from '~/types/award-archive'
import { NuxtLink } from '#components'
import { coverUrl } from '~/data/forum'

const props = defineProps<{
  edition: number
  entries: AwardArchiveEntry[]
  ballotCount?: number
  winnerCount?: number
  weighted?: boolean
  pendingTies?: boolean
}>()
const editionName = computed(() => (props.edition === 1 ? '第一届' : `第 ${props.edition} 届`))
const volume = computed(() => String(props.edition).padStart(2, '0'))
// Keep the edition's planned theme; pending ties must not rename “十二种”.
const countLabel = computed(() => {
  const count = props.winnerCount ?? 12
  return count === 12 ? '十二' : `${count} `
})
const scoreUnit = computed(() => (props.weighted ? '分' : '票'))
</script>

<template>
  <div class="ranking-page">
    <div class="award-archive-strip">
      <span
        ><AppIcon name="trophy" :size="16" />{{ editionName }} ·
        {{ pendingTies ? '待加赛' : edition === 1 ? '已公布' : '已归档' }}的评选档案</span
      >
      <NuxtLink v-if="edition === 1" to="/awards"
        >前往新一届十二橙器<AppIcon name="arrowUpRight" :size="15"
      /></NuxtLink>
      <NuxtLink v-else to="/ranking">回顾第一届十二橙器<AppIcon name="arrowUpRight" :size="15" /></NuxtLink>
    </div>
    <header class="ranking-hero">
      <div class="ranking-grid-art" aria-hidden="true"></div>
      <p class="eyebrow">
        {{ edition === 1 ? 'THE FIRST CHENG ZHI XIANG AWARDS' : `CHENG ZHI XIANG AWARDS / VOL. ${volume}` }}
      </p>
      <span class="ranking-top-note">由热爱提名，为感动加冕。</span>
      <h1>
        十二<span class="orange-fruit"
          >橙<svg viewBox="0 0 45 27" aria-hidden="true">
            <path d="M5 23C6 7 22 2 40 4 39 18 24 26 5 23Z" fill="currentColor" /></svg></span
        >器<span class="ranking-star" aria-hidden="true"><DecorativeSpark /></span>
      </h1>
      <p class="ranking-subtitle">{{ countLabel }}部作品，{{ countLabel }}种难以忘记的感动。</p>
      <p class="ranking-description">{{ editionName }}澄之响 Galgame 评选 · 同好会成员共同推荐</p>
      <div class="ranking-hero-bottom">
        <span>南京工程学院 · 澄之响视觉小说同好会</span><span>VOL. {{ volume }} / OUR COLLECTIVE MEMORY</span>
      </div>
    </header>
    <p v-if="pendingTies" class="archive-pending-ties" role="status">
      本届存在尚未分出位次的同票作品，需由管理员开启同票加赛。下方未决名次暂标为「待加赛」，加赛完成后更新结果。
    </p>
    <div id="award-results" class="ranking-intro">
      <div>
        <p class="eyebrow">A BOOKSHELF MADE BY US</p>
        <h2>因为有人喜欢，所以值得被看见。</h2>
      </div>
      <p v-if="edition === 1">
        每一段推荐词背后，都是一次认真读完的旅程。<br />这份名单来自原有评选项目，也欢迎你写下自己的答案。
      </p>
      <p v-else>
        每一段推荐词背后，都是一次认真读完的旅程。<br />{{ ballotCount ?? 0 }} 份选票，留下了这
        {{ entries.length }} 部共同喜欢的故事。
      </p>
    </div>
    <div v-if="!entries.length" class="empty-state">
      <AppIcon name="trophy" :size="30" />
      <h3>本届暂无入选作品</h3>
      <p>本届没有有效得票结果。</p>
    </div>
    <template v-else>
      <div class="ranking-top-three">
        <component
          :is="entry.to ? NuxtLink : 'article'"
          v-for="entry in entries.slice(0, 3)"
          :key="entry.id"
          :to="entry.to"
          class="rank-feature"
        >
          <div class="rank-feature-cover">
            <WorkCover
              :rank="entry.coverRank || 0"
              :src="
                entry.coverRank && entry.coverUrl === coverUrl(entry.coverRank) ? undefined : entry.coverUrl
              "
              variant="cover"
              :min-width="192"
              sizes="(max-width: 875px) 120px, (max-width: 975px) 150px, (max-width: 1275px) 30vw, 380px"
              loading="eager"
              :alt="`${entry.title}封面`"
            />
            <span class="rank-feature-number" :class="{ 'is-pending': entry.tied }"
              >{{ entry.tied ? '待加赛' : String(entry.rank).padStart(2, '0')
              }}<small v-if="!entry.tied">/ {{ entries.length }}</small></span
            >
            <span class="rank-feature-badge"
              ><AppIcon name="trophy" :size="13" />{{
                entry.badge ||
                `${entry.tieBreakSummary ? '原得分 ' : ''}${entry.votes} ${scoreUnit}${entry.tied ? ' · 待加赛' : entry.tieBreakSummary ? ' · 加赛定序' : ''}`
              }}</span
            >
          </div>
          <div class="rank-feature-body">
            <span>{{ entry.subtitle }}</span>
            <h3>{{ entry.title }}<AppIcon v-if="entry.to" name="arrowUpRight" :size="20" /></h3>
            <p>{{ entry.description }}</p>
            <span v-if="entry.tieBreakSummary" class="archive-recommendation-author">{{
              entry.tieBreakSummary
            }}</span>
            <span v-if="entry.recommendationAuthor" class="archive-recommendation-author"
              >推荐 / {{ entry.recommendationAuthor }}</span
            >
            <small>提名 / {{ entry.nominator || '同好会成员' }}</small>
          </div>
        </component>
      </div>
      <div v-if="entries.length > 3" class="ranking-rest">
        <component
          :is="entry.to ? NuxtLink : 'article'"
          v-for="entry in entries.slice(3)"
          :key="entry.id"
          :to="entry.to"
          class="rank-row"
        >
          <span class="rank-row-number" :class="{ 'is-pending': entry.tied }">{{
            entry.tied ? '待加赛' : String(entry.rank).padStart(2, '0')
          }}</span>
          <span class="rank-row-cover"
            ><WorkCover
              :rank="entry.coverRank || 0"
              :src="
                entry.coverRank && entry.coverUrl === coverUrl(entry.coverRank) ? undefined : entry.coverUrl
              "
              variant="rail"
              sizes="(max-width: 875px) 60px, 95px"
              :alt="`${entry.title}封面`"
              loading="lazy"
          /></span>
          <div class="rank-row-copy">
            <h3>{{ entry.title }}</h3>
            <p>{{ entry.studio }}<template v-if="entry.tied"> · 待同票加赛</template></p>
            <p v-if="entry.tieBreakSummary">{{ entry.tieBreakSummary }}</p>
          </div>
          <span class="rank-row-nominator">提名 / {{ entry.nominator || '同好会成员' }}</span>
          <strong v-if="entry.votes !== undefined" class="archive-row-score"
            ><small v-if="entry.tieBreakSummary">原得分 </small>{{ entry.votes
            }}<small>{{ scoreUnit }}</small></strong
          >
          <AppIcon v-if="entry.to" name="arrowUpRight" :size="18" />
        </component>
      </div>
      <p v-if="edition !== 1" class="award-small-note archive-result-note">
        同票作品持续加赛直至分出唯一位次；原始得分保留，加赛仅决定组内顺序。<template
          v-if="winnerCount && entries.length < winnerCount"
          >本届入选 {{ entries.length }} 部，少于计划的 {{ winnerCount }} 部，按实际结果归档。</template
        >
      </p>
    </template>
    <div class="ranking-afterword">
      <span aria-hidden="true"><DecorativeSpark /></span>
      <h2>你的喜欢，也有它的位置。</h2>
      <p>书单之外，还有无数值得相遇的故事。</p>
      <NuxtLink
        :to="edition === 1 ? '/post/orange-awards' : '/?category=作品讨论#discussions'"
        class="button primary"
        >{{ edition === 1 ? '参与十二橙器讨论' : '聊聊喜欢的作品' }}<AppIcon name="arrowUpRight" :size="16"
      /></NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.archive-pending-ties {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--orange-soft);
  color: var(--subtle);
  font-size: max(14px, 0.75rem);
  line-height: 1.9;
}
.rank-feature-number.is-pending {
  font-size: 1.2rem;
}
.rank-row-number.is-pending {
  flex-shrink: 0;
  width: 3rem;
  font-size: 0.75rem;
}
.rank-feature-body > .archive-recommendation-author {
  display: block;
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.625rem;
}
.archive-row-score {
  flex-shrink: 0;
  color: var(--orange);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.archive-row-score small {
  margin-left: 0.25rem;
  font-size: 0.75em;
  font-weight: 400;
}
.archive-result-note {
  margin-top: 1rem;
}
.rank-feature-body,
.rank-row-copy {
  min-width: 0;
  overflow-wrap: anywhere;
}
.rank-feature-body > p {
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.rank-feature-cover > .image-fallback {
  width: 100%;
  height: 100%;
}
@media (max-width: 54.6875rem) {
  .rank-row {
    gap: 0.5rem;
  }
  .archive-row-score {
    margin-left: auto;
    font-size: 0.75rem;
  }
  .rank-row > .app-icon {
    margin-left: 0;
    flex-shrink: 0;
  }
}
</style>
