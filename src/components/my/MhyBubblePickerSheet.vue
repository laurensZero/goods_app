<template>
  <!-- 选中气泡即生效（点击直接 emit + 落库），点遮罩退出不会丢选择，无需二次确认 -->
  <AppSheet
    :model-value="modelValue"
    sheet-class="bubble-sheet"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @closed="handleClosed"
  >
    <div class="bubble-sheet__head">
      <h3 class="bubble-sheet__title">{{ title }}</h3>
      <div class="bubble-sheet__head-actions">
        <!-- 手动刷新：跳过 6h TTL 直接拉云端；in-flight 置灰防连点 -->
        <button
          type="button"
          class="bubble-sheet__refresh"
          :class="{ 'bubble-sheet__refresh--busy': refreshing }"
          :disabled="refreshing"
          :aria-label="t('my.bubble.refresh')"
          @click="refreshCatalog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
        <span class="bubble-sheet__count">{{ t('my.bubble.count', { n: filteredItems.length }) }}</span>
      </div>
    </div>

    <!-- IP 筛选 chips：一行横滚，顺序按 constants/mhyDecor.js 的 canonical 清单 -->
    <div v-if="games.length" class="bubble-sheet__chips" role="tablist">
      <button
        v-for="game in ['__all__', ...games]"
        :key="game"
        type="button"
        :class="['bubble-chip', { 'bubble-chip--active': activeGame === game }]"
        @click="activeGame = game"
      >
        {{ game === '__all__' ? t('my.bubble.all') : game }}
      </button>
    </div>

    <div class="bubble-sheet__search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        v-model="search"
        type="text"
        :placeholder="t('my.bubble.searchPlaceholder')"
        :aria-label="t('my.bubble.searchPlaceholder')"
      >
    </div>

    <div class="bubble-sheet__scroll">
      <!-- 加载态：灰块骨架，避免首拉目录时的空白闪一下 -->
      <div v-if="loading" class="bubble-sheet__skeleton" aria-hidden="true">
        <span v-for="n in 8" :key="n" class="bubble-skeleton__tile" />
      </div>

      <!-- 空态：目录拉取失败或云端还没有数据 -->
      <p v-else-if="!filteredItems.length" class="bubble-sheet__empty">{{ t('my.bubble.empty') }}</p>

      <div v-else class="bubble-sheet__grid">
        <!-- 第一个 tile 固定为「无气泡」：清空当前页气泡 -->
        <button
          type="button"
          :class="['bubble-tile', { 'bubble-tile--active': !selectedId }]"
          @click="choose(null)"
        >
          <span class="bubble-tile__preview bubble-tile__preview--none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              <path d="M6.5 6.5l11 11" />
            </svg>
          </span>
          <span class="bubble-tile__name">{{ t('my.bubble.none') }}</span>
        </button>

        <button
          v-for="item in filteredItems"
          :key="item.i"
          type="button"
          :class="['bubble-tile', { 'bubble-tile--active': item.i === selectedId }]"
          @click="choose(item)"
        >
          <span class="bubble-tile__preview">
            <!-- 选择器只看静态底图：动图 tile 不播 gif（省流量，预览意义不大） -->
            <LazyCachedImage
              :src="previewSrc(item)"
              :alt="item.n"
              class="bubble-tile__img"
            />
          </span>
          <span class="bubble-tile__name">{{ item.n }}</span>
          <span v-if="item.a && item.gif" class="bubble-tile__badge">{{ t('my.bubble.animatedTag') }}</span>
        </button>
      </div>
    </div>

    <div class="bubble-sheet__footer">
      <button class="bubble-sheet__done" type="button" @click="close">{{ t('my.bubble.done') }}</button>
    </div>

    <!-- 刷新结果轻提示：fixed 定位，不占弹层布局 -->
    <AppToast :message="toastMsg" />
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import AppToast from '@/components/common/AppToast.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { useToast } from '@/composables/useToast'
import { loadBubbleCatalog } from '@/services/mhyDecor/bubbles'
import { MHY_DECOR_GAMES, normDecorName } from '@/constants/mhyDecor'
import { resolveBubbleSrc } from '@/utils/mhyDecor/cdn'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 当前选中气泡（目录紧凑项，null = 无气泡） */
  bubble: { type: Object, default: null },
  /** 页面 key（home/wishlist/events/recharge/my），标题用来区分正在编辑哪一页 */
  pageKey: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'select'])

/** pageKey → 标题里的页面短词 key；未知 key 兜底用「我的」 */
const PAGE_WORD_KEYS = Object.freeze({
  home: 'pageHome',
  wishlist: 'pageWishlist',
  events: 'pageEvents',
  recharge: 'pageRecharge',
  my: 'pageMy'
})

const title = computed(() => {
  const wordKey = PAGE_WORD_KEYS[props.pageKey] || 'pageMy'
  return t('my.bubble.title', { page: t(`my.bubble.${wordKey}`) })
})

const loading = ref(false)
const items = ref([])
const activeGame = ref('__all__')
const search = ref('')
/** 选中条目 id，空串 = 无气泡 */
const selectedId = ref('')
/** 手动刷新进行中（按钮置灰防连点） */
const refreshing = ref(false)
const { toastMsg, showToast } = useToast()

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    selectedId.value = props.bubble?.i || ''
    void loadCatalog()
  }
)

/** 目录只在打开时拉一次（服务层自带内存 + 6h 磁盘缓存，重复开弹窗开销极小） */
async function loadCatalog() {
  if (loading.value || items.value.length) return
  loading.value = true
  try {
    items.value = await loadBubbleCatalog()
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 手动刷新：force 跳过内存/TTL 缓存直接拉云端。
 * 服务层失败时自己兜底旧缓存并抛错，这里只负责提示（旧列表保持不动）。
 */
async function refreshCatalog() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    items.value = await loadBubbleCatalog({ force: true })
    showToast(t('my.bubble.refreshDone'))
  } catch {
    showToast(t('my.bubble.refreshFailed'))
  } finally {
    refreshing.value = false
  }
}

/** 目录里实际出现的 IP，按 canonical 顺序排；清单外漏网的兜底追加在尾部 */
const games = computed(() => {
  const present = new Set(items.value.map((item) => item.g))
  const ordered = MHY_DECOR_GAMES.filter((game) => present.has(game))
  for (const game of present) {
    if (!ordered.includes(game)) ordered.push(game)
  }
  return ordered
})

/**
 * 搜索匹配：先按原文包含，再按归一化名（去掉「气泡/主题/挂件」等后缀）包含。
 * 查询归一化后为空（比如搜的就是「气泡」两个字）时只走原文匹配，
 * 避免空串 includes 恒为 true 把全目录都放出来。
 */
const filteredItems = computed(() => {
  const game = activeGame.value
  const query = search.value.trim().toLowerCase()
  const normQuery = normDecorName(query)
  const scope = (!game || game === '__all__')
    ? items.value
    : items.value.filter((item) => item.g === game)
  return matchByQuery(scope, query, normQuery)
})

function matchByQuery(list, query, normQuery) {
  if (!query) return list
  return list.filter((item) => {
    if (item.n.toLowerCase().includes(query)) return true
    if (!normQuery) return false
    const name = normDecorName(item.n)
    return !!name && name.includes(normQuery)
  })
}

/** tile 预览：有 gif 就直出 gif（列表里也动起来），静态才按 96px 走静态链 */
function previewSrc(item) {
  return resolveBubbleSrc(item, item.a && item.gif ? { playAnimation: true } : { width: 96 })
}

function close() {
  emit('update:modelValue', false)
}

function handleClosed() {
  search.value = ''
  activeGame.value = '__all__'
  selectedId.value = ''
}

/**
 * 点 tile 立即生效：更新选中态并向上 emit，由宿主负责落库（本地 + 云端）。
 * 与当前选中相同的点击不重复 emit，免得白打一次云端请求。
 */
function choose(item) {
  const nextId = item?.i || ''
  if (nextId === selectedId.value) return
  selectedId.value = nextId
  emit('select', item ? { i: item.i, u: item.u, bg: item.bg, gif: item.gif, a: item.a, t: item.t, m: item.m, n: item.n } : null)
}
</script>

<style scoped>
.bubble-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  flex-shrink: 0;
}

.bubble-sheet__title {
  margin: 0;
  font-size: var(--font-title-lg);
  font-weight: 700;
  color: var(--app-text);
}

.bubble-sheet__count {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: var(--font-small);
  font-weight: 600;
}

.bubble-sheet__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.bubble-sheet__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  transition: opacity 0.16s ease;
}

.bubble-sheet__refresh svg {
  width: 15px;
  height: 15px;
}

/* 刷新中：转圈 + 置灰防连点 */
.bubble-sheet__refresh--busy svg {
  animation: bubble-refresh-spin 0.9s linear infinite;
}

.bubble-sheet__refresh:disabled {
  opacity: 0.55;
  cursor: default;
}

@keyframes bubble-refresh-spin {
  to { transform: rotate(360deg); }
}

/* IP chips：一行横滚，不换行 */
.bubble-sheet__chips {
  display: flex;
  gap: 8px;
  padding-bottom: 12px;
  overflow-x: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  flex-shrink: 0;
}

.bubble-sheet__chips::-webkit-scrollbar {
  display: none;
}

.bubble-chip {
  flex-shrink: 0;
  padding: 6px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-pill);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: var(--font-small);
  font-weight: 600;
  white-space: nowrap;
}

.bubble-chip--active {
  border-color: transparent;
  background: var(--app-primary);
  color: var(--app-surface);
}

.bubble-sheet__search {
  position: relative;
  flex-shrink: 0;
  padding-bottom: 12px;
}

.bubble-sheet__search svg {
  position: absolute;
  left: 12px;
  top: 11px;
  width: 16px;
  height: 16px;
  color: var(--app-text-tertiary);
  pointer-events: none;
}

.bubble-sheet__search input {
  width: 100%;
  height: 40px;
  padding: 0 14px 0 38px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: var(--font-body);
  outline: none;
  transition: border-color 0.16s ease;
}

.bubble-sheet__search input:focus {
  border-color: var(--app-primary);
}

.bubble-sheet__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  /* 不显示滚动条（与 AppSheet 外层及其他弹层一致），滚动仍走滚轮/触控/拖拽 */
  scrollbar-width: none;
}

.bubble-sheet__scroll::-webkit-scrollbar {
  display: none;
}

.bubble-sheet__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
  padding-bottom: 16px;
}

.bubble-skeleton__tile {
  aspect-ratio: 1;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  animation: bubble-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes bubble-skeleton-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

.bubble-sheet__empty {
  margin: 4px 0 16px;
  padding: 22px 16px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: var(--font-body);
  text-align: center;
}

.bubble-sheet__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
  padding-bottom: 16px;
}

.bubble-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px 8px;
  border: 2px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.bubble-tile--active {
  border-color: var(--app-primary);
}

.bubble-tile__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 72px;
}

/* 无气泡 tile 里的占位图标 */
.bubble-tile__preview--none svg {
  width: 26px;
  height: 26px;
  color: var(--app-text-tertiary);
}

/* 气泡是异形透明 PNG，contain 完整显示（LazyCachedImage 默认 cover 会裁边） */
.bubble-tile__img :deep(.lazy-image-element) {
  object-fit: contain;
}

.bubble-tile__name {
  max-width: 100%;
  color: var(--app-text);
  font-size: var(--font-caption);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bubble-tile__badge {
  position: absolute;
  right: 4px;
  top: 4px;
  min-width: 16px;
  padding: 1px 4px;
  border-radius: var(--radius-pill);
  background: rgba(20, 20, 22, 0.5);
  color: #fff;
  font-size: var(--font-caption);
  font-weight: 700;
}

.bubble-sheet__footer {
  display: flex;
  padding-top: 8px;
  flex-shrink: 0;
}

.bubble-sheet__done {
  flex: 1;
  padding: 14px 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-primary);
  color: var(--app-surface);
  font-size: var(--font-body-lg);
  font-weight: 700;
}

html.theme-dark .bubble-sheet__done {
  color: #101014;
}
</style>
