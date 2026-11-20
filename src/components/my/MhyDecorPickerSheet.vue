<template>
  <!-- 选中挂件即生效（点击直接 emit + 落库），点遮罩退出不会丢选择，无需二次确认 -->
  <AppSheet
    :model-value="modelValue"
    sheet-class="pendant-sheet"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @closed="handleClosed"
  >
    <div class="pendant-sheet__head">
      <h3 class="pendant-sheet__title">{{ t('my.pendant.title') }}</h3>
      <div class="pendant-sheet__head-actions">
        <!-- 手动刷新：跳过 6h TTL 直接拉云端；in-flight 置灰防连点 -->
        <button
          type="button"
          class="pendant-sheet__refresh"
          :class="{ 'pendant-sheet__refresh--busy': refreshing }"
          :disabled="refreshing"
          :aria-label="t('my.pendant.refresh')"
          @click="refreshCatalog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
        <span class="pendant-sheet__count">{{ t('my.pendant.count', { n: filteredItems.length }) }}</span>
      </div>
    </div>

    <!-- IP 筛选 chips：一行横滚，顺序按 constants/mhyDecor.js 的 canonical 清单 -->
    <div v-if="games.length" class="pendant-sheet__chips" role="tablist">
      <button
        v-for="game in ['__all__', ...games]"
        :key="game"
        type="button"
        :class="['pendant-chip', { 'pendant-chip--active': activeGame === game }]"
        @click="activeGame = game"
      >
        {{ game === '__all__' ? t('my.pendant.all') : game }}
      </button>
    </div>

    <div class="pendant-sheet__search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        v-model="search"
        type="text"
        :placeholder="t('my.pendant.searchPlaceholder')"
        :aria-label="t('my.pendant.searchPlaceholder')"
      >
    </div>

    <div class="pendant-sheet__scroll">
      <!-- 加载态：灰块骨架，避免 588 条目录首拉时的空白闪一下 -->
      <div v-if="loading" class="pendant-sheet__skeleton" aria-hidden="true">
        <span v-for="n in 8" :key="n" class="pendant-skeleton__tile" />
      </div>

      <!-- 空态：目录拉取失败或云端还没有数据 -->
      <p v-else-if="!filteredItems.length" class="pendant-sheet__empty">{{ t('my.pendant.empty') }}</p>

      <div v-else class="pendant-sheet__grid">
        <!-- 第一个 tile 固定为「无挂件」：清空当前挂件 -->
        <button
          type="button"
          :class="['pendant-tile', { 'pendant-tile--active': !selectedId }]"
          @click="choose(null)"
        >
          <span class="pendant-tile__preview">
            <MhyAvatarFrame :size="56">
              <!-- 与评论装扮的「无装扮」用同一个图标，两个选择器的一致性 -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                <path d="M6.5 6.5l11 11" />
              </svg>
            </MhyAvatarFrame>
          </span>
          <span class="pendant-tile__name">{{ t('my.pendant.none') }}</span>
        </button>

        <button
          v-for="item in filteredItems"
          :key="item.i"
          type="button"
          :class="['pendant-tile', { 'pendant-tile--active': item.i === selectedId }]"
          @click="choose(item)"
        >
          <span class="pendant-tile__preview">
            <!-- 列表里也播动图：动图按 128px 动画 webp 出图（约 750KB/条，懒加载 + 持久缓存） -->
            <MhyAvatarFrame
              :frame="item.u"
              :frame-mirror="item.m"
              :frame-thumb="item.t"
              :animated="item.a"
              :play-animation="item.a"
              :size="56"
            />
          </span>
          <span class="pendant-tile__name">{{ item.n }}</span>
          <span v-if="item.a" class="pendant-tile__badge">{{ t('my.pendant.animatedTag') }}</span>
        </button>
      </div>
    </div>

    <div class="pendant-sheet__footer">
      <button class="pendant-sheet__done" type="button" @click="close">{{ t('my.pendant.done') }}</button>
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
import MhyAvatarFrame from '@/components/common/MhyAvatarFrame.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { useToast } from '@/composables/useToast'
import { loadPendantCatalog } from '@/services/mhyDecor/catalog'
import { MHY_DECOR_GAMES, normDecorName } from '@/constants/mhyDecor'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 当前选中挂件（目录紧凑项，null = 无挂件） */
  pendant: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'select'])

const loading = ref(false)
const items = ref([])
const activeGame = ref('__all__')
const search = ref('')
/** 选中条目 id，空串 = 无挂件 */
const selectedId = ref('')
/** 手动刷新进行中（按钮置灰防连点） */
const refreshing = ref(false)
const { toastMsg, showToast } = useToast()

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    selectedId.value = props.pendant?.i || ''
    void loadCatalog()
  }
)

/** 目录只在打开时拉一次（服务层自带内存 + 6h 磁盘缓存，重复开弹窗开销极小） */
async function loadCatalog() {
  if (loading.value || items.value.length) return
  loading.value = true
  try {
    items.value = await loadPendantCatalog()
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
    items.value = await loadPendantCatalog({ force: true })
    showToast(t('my.pendant.refreshDone'))
  } catch {
    showToast(t('my.pendant.refreshFailed'))
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
 * 搜索匹配：先按原文包含，再按归一化名（去掉「头像框/主题/挂件」等后缀）包含。
 * 查询归一化后为空（比如搜的就是「挂件」两个字）时只走原文匹配，
 * 避免空串 includes 恒为 true 把全目录都放出来。
 */
const filteredItems = computed(() => {
  const game = activeGame.value
  const query = search.value.trim().toLowerCase()
  const normQuery = normDecorName(query)
  if (!game || game === '__all__') {
    return matchByQuery(items.value, query, normQuery)
  }
  return matchByQuery(items.value.filter((item) => item.g === game), query, normQuery)
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
  emit('select', item ? { i: item.i, u: item.u, t: item.t, m: item.m, a: item.a, n: item.n } : null)
}
</script>

<style scoped>
.pendant-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  flex-shrink: 0;
}

.pendant-sheet__title {
  margin: 0;
  font-size: var(--font-title-lg);
  font-weight: 700;
  color: var(--app-text);
}

.pendant-sheet__count {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: var(--font-small);
  font-weight: 600;
}

.pendant-sheet__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pendant-sheet__refresh {
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

.pendant-sheet__refresh svg {
  width: 15px;
  height: 15px;
}

/* 刷新中：转圈 + 置灰防连点 */
.pendant-sheet__refresh--busy svg {
  animation: pendant-refresh-spin 0.9s linear infinite;
}

.pendant-sheet__refresh:disabled {
  opacity: 0.55;
  cursor: default;
}

@keyframes pendant-refresh-spin {
  to { transform: rotate(360deg); }
}

/* IP chips：一行横滚，不换行 */
.pendant-sheet__chips {
  display: flex;
  gap: 8px;
  padding-bottom: 12px;
  overflow-x: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  flex-shrink: 0;
}

.pendant-sheet__chips::-webkit-scrollbar {
  display: none;
}

.pendant-chip {
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

.pendant-chip--active {
  border-color: transparent;
  background: var(--app-primary);
  color: var(--app-surface);
}

.pendant-sheet__search {
  position: relative;
  flex-shrink: 0;
  padding-bottom: 12px;
}

.pendant-sheet__search svg {
  position: absolute;
  left: 12px;
  top: 11px;
  width: 16px;
  height: 16px;
  color: var(--app-text-tertiary);
  pointer-events: none;
}

.pendant-sheet__search input {
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

.pendant-sheet__search input:focus {
  border-color: var(--app-primary);
}

.pendant-sheet__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  /* 不显示滚动条（与 AppSheet 外层及其他弹层一致），滚动仍走滚轮/触控/拖拽 */
  scrollbar-width: none;
}

.pendant-sheet__scroll::-webkit-scrollbar {
  display: none;
}

.pendant-sheet__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
  padding-bottom: 16px;
}

.pendant-skeleton__tile {
  aspect-ratio: 1;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  animation: pendant-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes pendant-skeleton-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

.pendant-sheet__empty {
  margin: 4px 0 16px;
  padding: 22px 16px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: var(--font-body);
  text-align: center;
}

.pendant-sheet__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
  padding-bottom: 16px;
}

.pendant-tile {
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

.pendant-tile--active {
  border-color: var(--app-primary);
}

.pendant-tile__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 72px;
}

/* 无挂件 tile 里的占位图标 */
.pendant-tile__preview svg {
  width: 26px;
  height: 26px;
  color: var(--app-text-tertiary);
}

.pendant-tile__name {
  max-width: 100%;
  color: var(--app-text);
  font-size: var(--font-caption);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pendant-tile__badge {
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

.pendant-sheet__footer {
  display: flex;
  padding-top: 8px;
  flex-shrink: 0;
}

.pendant-sheet__done {
  flex: 1;
  padding: 14px 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-primary);
  color: var(--app-surface);
  font-size: var(--font-body-lg);
  font-weight: 700;
}

html.theme-dark .pendant-sheet__done {
  color: #101014;
}
</style>
