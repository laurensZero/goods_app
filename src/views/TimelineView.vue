<template>
  <div class="timeline-page">
    <main class="page-body">
      <!-- 页眉 -->
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">按时间整理 / Timeline</p>
        </div>
      </section>

      <!-- 总览统计 -->
      <section v-if="store.collectionList.length > 0" class="stats-section">
        <div class="field-card stats-card">
          <div class="stat-item">
            <span class="stat-value">{{ datedCount }}</span>
            <span class="stat-label">件有日期</span>
          </div>
          <div class="stat-divider" />
          <div class="stat-item">
            <span class="stat-value">{{ formatPrice(datedTotalSpend) }}</span>
            <span class="stat-label">记录花费</span>
          </div>
          <div class="stat-divider" />
          <div class="stat-item">
            <span class="stat-value">{{ monthGroups.length }}</span>
            <span class="stat-label">个月份</span>
          </div>
        </div>
      </section>

      <!-- 月份分组 -->
      <template v-for="group in monthGroups" :key="group.yearMonth">
        <section class="month-section">
          <div class="section-head">
            <p class="section-label">{{ group.year }} 年</p>
            <div class="section-title-row">
              <h2 class="section-title">
                {{ group.month }} 月<span class="goods-count"> {{ group.count }} 件</span>
              </h2>
              <span v-if="group.totalSpend > 0" class="month-spend">{{ formatPrice(group.totalSpend) }}</span>
            </div>
          </div>
          <div class="field-card thumb-card">
            <div class="thumb-grid">
              <button
                v-for="item in group.items"
                :key="item.id"
                type="button"
                class="thumb-btn"
                @click="router.push(`/detail/${item.id}`)"
              >
                <img
                  v-if="item.coverImage"
                  class="thumb-img"
                  :src="item.coverImage"
                  :alt="item.name"
                  loading="lazy"
                />
                <div v-else class="thumb-empty">✦</div>
              </button>
            </div>
          </div>
        </section>
      </template>

      <!-- 日期未知分组 -->
      <section v-if="unknownItems.length > 0" class="month-section">
        <div class="section-head">
          <p class="section-label">其他</p>
          <h2 class="section-title">
            日期未知<span class="goods-count"> {{ unknownItems.length }} 件</span>
          </h2>
        </div>
        <div class="field-card thumb-card">
          <div class="thumb-grid">
            <button
              v-for="item in unknownItems"
              :key="item.id"
              type="button"
              class="thumb-btn"
              @click="router.push(`/detail/${item.id}`)"
            >
              <img
                v-if="item.coverImage"
                class="thumb-img"
                :src="item.coverImage"
                :alt="item.name"
                loading="lazy"
              />
              <div v-else class="thumb-empty">✦</div>
            </button>
          </div>
        </div>
      </section>

      <!-- 空状态 -->
      <section v-if="store.collectionList.length === 0" class="empty-wrap">
        <EmptyState
          icon="✦"
          title="还没有收藏记录"
          description="添加谷子后，将按购买日期在这里整理展示。"
          action-text="添加第一件"
          @action="router.push('/add')"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { formatPrice } from '@/utils/format'
import EmptyState from '@/components/EmptyState.vue'

defineOptions({ name: 'TimelineView' })

const router = useRouter()
const store = useGoodsStore()

async function refresh() {
  await store.refreshList()
}

onMounted(refresh)
onActivated(refresh)

// ── 数据分组 ──
const monthGroups = computed(() => {
  const grouped = {}
  for (const item of store.collectionList) {
    if (!item.acquiredAt) continue
    const ym = String(item.acquiredAt).slice(0, 7) // 'YYYY-MM'
    if (ym.length < 7 || !/^\d{4}-\d{2}$/.test(ym)) continue
    if (!grouped[ym]) grouped[ym] = []
    grouped[ym].push(item)
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a)) // 新日期在前
    .map(([ym, items]) => {
      const [year, month] = ym.split('-')
      const totalSpend = items.reduce((sum, g) => {
        const p = parseFloat(g.price)
        return sum + (isNaN(p) ? 0 : p)
      }, 0)
      return {
        yearMonth: ym,
        year,
        month: String(parseInt(month, 10)), // 去掉前导零
        count: items.length,
        totalSpend,
        items,
      }
    })
})

const unknownItems = computed(() =>
  store.collectionList.filter((item) => {
    if (!item.acquiredAt) return true
    const ym = String(item.acquiredAt).slice(0, 7)
    return ym.length < 7 || !/^\d{4}-\d{2}$/.test(ym)
  }),
)

const datedCount = computed(() =>
  monthGroups.value.reduce((sum, g) => sum + g.count, 0),
)

const datedTotalSpend = computed(() =>
  monthGroups.value.reduce((sum, g) => sum + g.totalSpend, 0),
)
</script>

<style scoped>
/* ── 基础页面 ── */
.timeline-page {
  position: relative;
}

.page-body {
  padding-top: calc(env(safe-area-inset-top) + 20px);
  padding-bottom: calc(var(--tabbar-height, 94px) + env(safe-area-inset-bottom, 0px) + 20px);
}

/* ── Hero ── */
.hero-section {
  padding: 0 var(--page-padding);
}

.hero-copy {
  max-width: 296px;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ── 统计卡片 ── */
.stats-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.stats-card {
  display: flex !important;
  flex-direction: row !important;
  gap: 0 !important;
  align-items: center;
  padding: 16px !important;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.stat-value {
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 11px;
  color: var(--app-text-tertiary);
  font-weight: 400;
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: var(--app-border, rgba(0, 0, 0, 0.07));
  flex-shrink: 0;
}

/* ── 月份区段 ── */
.month-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

.section-head {
  margin-bottom: 14px;
}

.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.section-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.goods-count {
  font-size: 16px;
  font-weight: 400;
  color: var(--app-text-tertiary);
  margin-left: 4px;
}

.month-spend {
  font-size: 14px;
  font-weight: 500;
  color: rgba(32, 112, 192, 0.9);
  flex-shrink: 0;
}

/* ── 缩略图卡片 ── */
.field-card {
  background: var(--app-surface, #fff);
  box-shadow: var(--app-shadow);
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
}

.thumb-card {
  padding: 12px !important;
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

@media (min-width: 600px) {
  .thumb-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}

@media (min-width: 900px) {
  .thumb-grid {
    grid-template-columns: repeat(8, 1fr);
  }
}

@media (min-width: 1200px) {
  .thumb-grid {
    grid-template-columns: repeat(10, 1fr);
  }
}

.thumb-btn {
  aspect-ratio: 1;
  border: none;
  background: none;
  padding: 0;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
  display: block;
}

.thumb-btn:active {
  transform: scale(0.94);
  opacity: 0.8;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 10px;
}

.thumb-empty {
  width: 100%;
  height: 100%;
  background: var(--app-surface-soft, #eeeff2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 16px;
  aspect-ratio: 1;
}

/* ── 空状态 ── */
.empty-wrap {
  padding: 40px var(--page-padding);
}
</style>
