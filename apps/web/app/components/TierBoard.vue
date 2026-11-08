<script setup lang="ts">
import type { TierList } from '~/types/catalog'
import type { Work } from '~/types/forum'
import { tierTextColor } from '~/utils/tier-colors'
const props = defineProps<{ list: TierList; works: Work[] }>()
const byId = computed(() => new Map(props.works.map((work) => [work.rank, work])))
</script>
<template>
  <div class="tier-board" :aria-label="list.title + '分层榜单'">
    <section v-for="row in list.rows" :key="row.id" class="tier-level" :aria-label="row.label + '层'">
      <h3 class="tier-label" :style="{ backgroundColor: row.color, color: tierTextColor(row.color) }">
        {{ row.label }}
      </h3>
      <div class="tier-works">
        <template v-for="id in row.workIds" :key="id"
          ><NuxtLink v-if="byId.get(id)" :to="'/works/' + id" class="tier-work"
            ><WorkCover
              :rank="id"
              :src="id > 12 ? byId.get(id)?.bangumi?.coverUrl || '/images/work-placeholder.svg' : undefined"
              variant="cover"
              :alt="byId.get(id)!.title + '封面'"
              sizes="100px"
            /><span>{{ byId.get(id)!.title }}</span></NuxtLink
          ><span v-else class="tier-work">作品资料暂不可用</span></template
        >
        <p v-if="!row.workIds.length" class="catalog-help">这一层还没有作品。</p>
      </div>
    </section>
  </div>
</template>
