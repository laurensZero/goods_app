<template>
  <div class="page page--transition leaderboard-page" :class="{ 'page--leaving': isPageLeaving }">
    <main class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Character Ranking</p>
          <h1 class="hero-title">角色排行榜</h1>
          <p class="hero-desc">支持按总数量和总金额切换统计口径。</p>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-kicker">已记录角色</span>
            <strong class="summary-value">{{ characterStats.length }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">未设角色</span>
            <strong class="summary-value">{{ uncategorizedCharacterCount }}</strong>
          </article>
        </div>
      </section>

      <section class="metric-section">
        <button
          v-for="metric in metrics"
          :key="metric.value"
          type="button"
          class="metric-chip"
          :class="{ 'metric-chip--active': selectedMetric === metric.value }"
          @click="selectedMetric = metric.value"
        >
          {{ metric.label }}
        </button>
      </section>

      <section v-if="topThree.length > 0" class="podium-section">
        <article
          v-for="(entry, index) in topThree"
          :key="entry.name"
          class="podium-card"
          :class="`podium-card--${index + 1}`"
        >
          <span class="podium-rank">#{{ index + 1 }}</span>
          <p class="podium-name">{{ entry.name }}</p>
          <p v-if="entry.ip" class="podium-meta">{{ entry.ip }}</p>
          <strong class="podium-value">{{ formatMetricValue(entry) }}</strong>
        </article>
      </section>

      <section class="list-section">
        <div class="section-head">
          <p class="section-label">完整榜单</p>
          <h2 class="section-title">角色排行</h2>
        </div>

        <div v-if="sortedStats.length > 0" class="ranking-list">
          <article v-for="(entry, index) in sortedStats" :key="entry.name" class="ranking-item">
            <div class="ranking-index">{{ index + 1 }}</div>

            <div class="ranking-body">
              <div class="ranking-main">
                <p class="ranking-name">{{ entry.name }}</p>
                <p class="ranking-value">{{ formatMetricValue(entry) }}</p>
              </div>

              <div class="ranking-meta">
                <span v-if="entry.ip" class="ranking-chip">{{ entry.ip }}</span>
                <span class="ranking-chip">{{ entry.quantity }} 个</span>
                <span class="ranking-chip">¥{{ entry.totalValue.toFixed(2) }}</span>
              </div>
            </div>
          </article>
        </div>

        <EmptyState
          v-else
          icon="✦"
          title="还没有角色数据"
          description="先给谷子设置角色，排行榜才会开始累计。"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import EmptyState from '@/components/EmptyState.vue'

const store = useGoodsStore()
const presets = usePresetsStore()
const { isPageLeaving } = usePageLeaveAnimation()

const metrics = [
  { value: 'quantity', label: '总数量' },
  { value: 'totalValue', label: '总金额' }
]

const selectedMetric = ref('quantity')

const characterStats = computed(() => {
  const map = new Map()
  const presetIpMap = new Map(
    presets.characters.map((character) => [character.name, character.ip || ''])
  )

  for (const item of store.viewList) {
    if (!Array.isArray(item.characters) || item.characters.length === 0) continue

    for (const rawName of item.characters) {
      const name = String(rawName || '').trim()
      if (!name) continue

      const current = map.get(name) || {
        name,
        ip: '',
        quantity: 0,
        totalValue: 0,
        latestAcquiredTime: 0
      }

      current.ip = current.ip || item.ip || presetIpMap.get(name) || ''
      current.quantity += item.quantityNumber
      current.totalValue += item.totalValueNumber
      current.latestAcquiredTime = Math.max(current.latestAcquiredTime, item.acquiredTime || 0)
      map.set(name, current)
    }
  }

  return [...map.values()]
})

const uncategorizedCharacterCount = computed(() =>
  store.viewList.filter((item) => !Array.isArray(item.characters) || item.characters.length === 0).length
)

const sortedStats = computed(() => {
  const metric = selectedMetric.value

  return [...characterStats.value].sort((a, b) => {
    const diff = Number(b[metric] || 0) - Number(a[metric] || 0)
    if (diff !== 0) return diff

    if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue
    if (b.quantity !== a.quantity) return b.quantity - a.quantity
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
})

const topThree = computed(() => sortedStats.value.slice(0, 3))

function formatMetricValue(entry) {
  if (selectedMetric.value === 'totalValue') {
    return `¥${entry.totalValue.toFixed(2)}`
  }

  return `${entry.quantity} 个`
}
</script>

<style scoped>
.page-body {
  padding-top: calc(env(safe-area-inset-top) + 20px);
}

.leaderboard-page {
  background: var(--app-bg);
}

.hero-section,
.metric-section,
.podium-section,
.list-section {
  padding: 0 var(--page-padding);
}

.hero-section,
.metric-section,
.podium-section,
.list-section {
  margin-top: var(--section-gap);
}

.hero-section {
  display: grid;
  gap: 14px;
}

.hero-label,
.section-label {
  
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title,
.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.summary-kicker {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.summary-value {
  display: block;
  margin-top: 10px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.metric-section {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.metric-section::-webkit-scrollbar {
  display: none;
}

.metric-chip {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  box-shadow: var(--app-shadow);
  font-size: 14px;
  font-weight: 600;
}

.metric-chip--active {
  background: #141416;
  color: #ffffff;
}

.podium-section {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.podium-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 152px;
  padding: 16px;
  border-radius: 22px;
  box-shadow: var(--app-shadow);
  color: #fff;
}

.podium-card--1 {
  background: linear-gradient(145deg, #111318 0%, #41321f 100%);
}

.podium-card--2 {
  background: linear-gradient(145deg, #2b2f39 0%, #4a5567 100%);
}

.podium-card--3 {
  background: linear-gradient(145deg, #332219 0%, #80553b 100%);
}

.podium-rank {
  display: inline-flex;
  width: fit-content;
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 12px;
  font-weight: 700;
}

.podium-name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}

.podium-meta {
  color: rgba(255, 255, 255, 0.66);
  font-size: 12px;
}

.podium-value {
  margin-top: auto;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.section-head {
  margin-bottom: 14px;
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ranking-item {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.ranking-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: rgba(20, 20, 22, 0.06);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}

.ranking-body {
  flex: 1;
  min-width: 0;
}

.ranking-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.ranking-name {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
}

.ranking-value {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}

.ranking-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.ranking-chip {
  border-radius: 999px;
  padding: 5px 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
}

@media (max-width: 640px) {
  .podium-section {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .podium-card {
    min-height: 132px;
    padding: 12px;
    border-radius: 18px;
  }

  .podium-rank {
    padding: 4px 8px;
    font-size: 11px;
  }

  .podium-name {
    font-size: 14px;
  }

  .podium-meta {
    font-size: 11px;
  }

  .podium-value {
    font-size: 18px;
  }

  .ranking-main {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
