<template>
  <div class="page detail-page">
    <NavBar :title="item ? (item.isWishlist ? '心愿详情' : '收藏详情') : '详情'" show-back>
      <template #right>
        <button class="nav-icon-btn" type="button" aria-label="编辑" @click="router.push('/edit/' + props.id)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 20H21" />
            <path d="M16.5 3.5A2.12 2.12 0 0 1 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" />
          </svg>
        </button>
        <button class="nav-icon-btn danger" type="button" aria-label="删除" @click="handleDelete">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6H21" />
            <path d="M8 6V4H16V6" />
            <path d="M19 6L18 20H6L5 6" />
            <path d="M10 11V17" />
            <path d="M14 11V17" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main v-if="item" ref="pageBodyRef" class="page-body">
      <section class="detail-shell">
        <section class="cover-stage">
          <div class="cover-glow" />
          <div class="cover-card" :style="cachedImgSrc ? {} : { background: coverBg }">
            <img v-if="cachedImgSrc" :src="cachedImgSrc" :alt="item.name" class="cover-img" />
            <div v-else class="cover-fallback">
              <span class="cover-initial">{{ coverInitial }}</span>
            </div>
          </div>
        </section>

        <section class="hero-card">
          <div class="hero-meta">
            <span v-if="item.isWishlist" class="hero-chip wish-chip">心愿单</span>
            <span v-if="item.category" class="hero-chip">{{ item.category }}</span>
            <span v-if="item.ip" class="hero-chip ip-chip">{{ item.ip }}</span>
            <span v-for="ch in item.characters || []" :key="ch" class="hero-chip char-chip">{{ ch }}</span>
            <span v-for="tag in item.tags || []" :key="tag" class="hero-chip tag-chip">#{{ tag }}</span>
            <span v-if="item.acquiredAt" class="hero-date">{{ item.isWishlist ? '计划于' : '购入于' }} {{ item.acquiredAt }}</span>
          </div>

          <h1 class="hero-name">{{ item.name }}</h1>

          <div class="hero-price">
            <span class="price-label">{{ item.isWishlist ? '目标价格' : '购入价格' }}</span>
            <p class="price-value">
              <span class="price-currency">¥</span>
              <span class="price-amount">{{ item.price || '—' }}</span>
              <span v-if="item.points" class="price-points">+{{ item.points }}积分</span>
            </p>
          </div>

          <button v-if="item.isWishlist" class="hero-action-btn" type="button" @click="markAsOwned">
            标记为已入手
          </button>
        </section>

        <section class="info-section">
          <div class="section-head">
            <p class="section-label">信息卡片</p>
            <h2 class="section-title">收藏信息</h2>
          </div>

          <div class="info-card">
            <article class="info-tile">
              <span class="info-label">分类</span>
              <strong class="info-value">{{ item.category || '未填写' }}</strong>
            </article>

            <article v-if="item.ip" class="info-tile">
              <span class="info-label">IP</span>
              <strong class="info-value">{{ item.ip }}</strong>
            </article>

            <article v-if="item.characters && item.characters.length" class="info-tile">
              <span class="info-label">角色名</span>
              <strong class="info-value">{{ item.characters.join('、') }}</strong>
            </article>

            <article v-if="item.tags && item.tags.length" class="info-tile">
              <span class="info-label">自定义标签</span>
              <strong class="info-value">{{ item.tags.map((tag) => `#${tag}`).join('、') }}</strong>
            </article>

            <article class="info-tile">
              <span class="info-label">{{ item.isWishlist ? '预计入手日期' : '购入日期' }}</span>
              <strong class="info-value">{{ item.acquiredAt || '未填写' }}</strong>
            </article>

            <article v-if="item.storageLocation" class="info-tile">
              <span class="info-label">收纳位置</span>
              <strong class="info-value">{{ item.storageLocation }}</strong>
            </article>

            <article v-if="variantText" class="info-tile">
              <span class="info-label">款式</span>
              <strong class="info-value">{{ variantText }}</strong>
            </article>

            <article v-if="!item.isWishlist && holdingDays !== null" class="info-tile">
              <span class="info-label">持有时长</span>
              <strong class="info-value">{{ holdingDays }} 天</strong>
            </article>

            <article v-if="item.quantity > 1" class="info-tile">
              <span class="info-label">数量</span>
              <strong class="info-value">{{ item.quantity }} 件</strong>
            </article>
          </div>
        </section>

        <section v-if="item.note" class="note-section">
          <div class="section-head">
            <p class="section-label">附加信息</p>
            <h2 class="section-title">备注</h2>
          </div>

          <article class="note-card">
            <p class="note-body">{{ item.note }}</p>
          </article>
        </section>
      </section>
    </main>

    <EmptyState
      v-else
      icon="✦"
      title="找不到这件收藏"
      description="它可能已被删除，或者当前数据还没有完成同步。"
    />

    <Transition name="dialog-fade">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click="closeDeleteDialog">
        <div class="dialog-card" @click.stop>
          <div class="dialog-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6H21" />
              <path d="M8 6V4H16V6" />
              <path d="M19 6L18 20H6L5 6" />
              <path d="M10 11V17" />
              <path d="M14 11V17" />
            </svg>
          </div>

          <h2 class="dialog-title">移到回收站？</h2>
          <p class="dialog-desc">{{ item?.name || '该收藏' }} 会先进入回收站，之后仍然可以恢复。</p>

          <div class="dialog-actions">
            <button class="dialog-btn dialog-btn--ghost" type="button" @click="closeDeleteDialog">取消</button>
            <button class="dialog-btn dialog-btn--danger" type="button" @click="confirmDelete">移入回收站</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeMount, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { getCachedImage } from '@/utils/imageCache'
import { formatDate } from '@/utils/format'
import { getGoodsVariant } from '@/utils/goodsIdentity'
import NavBar from '@/components/NavBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const store = useGoodsStore()
const pageBodyRef = ref(null)

const item = computed(() => store.getById(props.id))
const showDeleteDialog = ref(false)

const colorMap = {
  手办: ['#2c2c2e', '#3a3a3c'],
  挂件: ['#1c3a5e', '#2a5298'],
  徽章: ['#3a1c5e', '#6a3d9a'],
  卡片: ['#1c4a3a', '#2e7d5c'],
  'CD/专辑': ['#4a2c1c', '#8b4513'],
  周边服饰: ['#4a3a1c', '#8b6914'],
  其他: ['#3a3a3a', '#5a5a5a']
}

const coverBg = computed(() => {
  const [from, to] = colorMap[item.value?.category] ?? ['#2c2c2e', '#3a3a3c']
  return `linear-gradient(135deg, ${from}, ${to})`
})

const coverInitial = computed(() => (item.value?.name ?? '?').trim().charAt(0).toUpperCase() || '?')
const variantText = computed(() => getGoodsVariant(item.value))

const cachedImgSrc = ref('')
const DETAIL_SCROLL_LOCK_CLASS = 'detail-route-scroll-lock'

function setDetailWindowScrollLock(locked) {
  document.documentElement.classList.toggle(DETAIL_SCROLL_LOCK_CLASS, locked)
  document.body.classList.toggle(DETAIL_SCROLL_LOCK_CLASS, locked)
}

function setWindowScrollTop(top = 0) {
  try { document.documentElement.scrollTop = top } catch {}
  try { document.body.scrollTop = top } catch {}
  try { window.scrollTo(0, top) } catch {}
}

function resetScrollPosition() {
  const pageBody = pageBodyRef.value
  setWindowScrollTop(0)
  if (!pageBody) return

  pageBody.scrollTop = 0
  window.requestAnimationFrame(() => {
    setWindowScrollTop(0)
    pageBody.scrollTop = 0
  })
  window.setTimeout(() => {
    setWindowScrollTop(0)
    pageBody.scrollTop = 0
  }, 32)
}

async function prepareDetailLayout() {
  await nextTick()
  resetScrollPosition()
}

watch(
  () => item.value?.image,
  async (url) => {
    cachedImgSrc.value = url ? await getCachedImage(url) : ''
  },
  { immediate: true }
)

const holdingDays = computed(() => {
  const date = item.value?.acquiredAt
  if (!date) return null

  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  return days >= 0 ? days : null
})

function handleDelete() {
  showDeleteDialog.value = true
}

function closeDeleteDialog() {
  showDeleteDialog.value = false
}

async function confirmDelete() {
  await store.removeGoods(props.id)
  showDeleteDialog.value = false
  router.back()
}

async function markAsOwned() {
  if (!item.value) return
  await store.updateGoods(props.id, {
    isWishlist: false,
    acquiredAt: item.value.acquiredAt || formatDate(new Date(), 'YYYY-MM-DD')
  })
}

onBeforeMount(() => {
  setDetailWindowScrollLock(true)
  setWindowScrollTop(0)
})

onMounted(async () => {
  await prepareDetailLayout()
})

watch(
  () => props.id,
  async () => {
    setWindowScrollTop(0)
    await prepareDetailLayout()
  }
)

onBeforeUnmount(() => {
  setDetailWindowScrollLock(false)
})

</script>

<style scoped>
.detail-shell {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: 6px var(--page-padding) 32px;
}

.nav-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.84);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, background 0.16s ease;
}

.nav-icon-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-icon-btn:active {
  transform: scale(0.96);
}

.nav-icon-btn.danger {
  color: #c74444;
}

.cover-stage {
  position: relative;
}

.cover-glow {
  position: absolute;
  inset: 20px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.05);
  filter: blur(22px);
}

.cover-card {
  position: relative;
  width: 100%;
  aspect-ratio: 1.08;
  border-radius: var(--radius-large);
  overflow: hidden;
  box-shadow: var(--app-shadow);
  background: linear-gradient(180deg, var(--app-surface-soft), var(--app-surface-muted));
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.cover-initial {
  color: rgba(255, 255, 255, 0.88);
  font-size: 92px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.06em;
}

.hero-card,
.info-card,
.note-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.hero-card {
  padding: 22px;
  border-radius: var(--radius-large);
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: #141416;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.hero-chip.ip-chip {
  background: #1c3558;
  color: #8ab4f8;
}

.hero-chip.wish-chip {
  background: #c7375d;
  color: #fff1f4;
}

.hero-chip.char-chip {
  background: #1e3a2f;
  color: #5de2a0;
}

.hero-chip.tag-chip {
  background: #4b315d;
  color: #f1dcff;
}

.hero-date {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-name {
  margin-top: 14px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.03em;
}

.hero-price {
  margin-top: 18px;
}

.hero-action-btn {
  margin-top: 16px;
  min-height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  background: #141416;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
}

.price-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.price-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 8px;
}

.price-currency {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
}

.price-amount {
  color: var(--app-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.price-points {
  margin-left: 6px;
  color: var(--app-text-tertiary);
  font-size: 15px;
  font-weight: 500;
  align-self: flex-end;
  margin-bottom: 3px;
}

.section-head {
  margin-bottom: 14px;
}

.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.info-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-card);
}

.info-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.info-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.info-value {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.note-card {
  padding: 18px;
  border-radius: var(--radius-card);
}

.note-body {
  color: var(--app-text-secondary);
  font-size: 16px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 20, 22, 0.22);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.dialog-card {
  width: min(100%, 360px);
  padding: 22px;
  border-radius: 24px;
  background: var(--app-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
}

.dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

.dialog-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dialog-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.dialog-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.dialog-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.dialog-btn:active {
  transform: scale(0.96);
}

.dialog-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.dialog-btn--danger {
  background: #141416;
  color: #ffffff;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 180ms ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

/* ── 平板 / 大屏适配：左封面 + 右详情双栏布局 ── */
@media (min-width: 900px) {
  .detail-shell {
    display: grid;
    grid-template-columns: clamp(280px, 42%, 480px) 1fr;
    column-gap: 28px;
    padding-top: 24px;
    align-items: start;
  }

  /* 封面固定在左列，粘性定位跟随滚动 */
  .cover-stage {
    grid-column: 1;
    grid-row: 1 / 10;
    position: sticky;
    top: 16px;
  }

  /* 右列：hero / info / note 依次叠放 */
  .hero-card,
  .info-section,
  .note-section {
    grid-column: 2;
  }

  /* 信息卡扩展到 3 列 */
  .info-card {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (prefers-color-scheme: dark) {
  .cover-glow {
    background: rgba(255, 255, 255, 0.04);
  }

  .cover-card {
    background: linear-gradient(180deg, #242428, #1a1a1d);
  }

  .dialog-btn--ghost {
    background: var(--app-surface-soft);
  }

  .dialog-btn--danger {
    background: #f5f5f7;
    color: #d32f2f;
  }

  .hero-chip {
    background: rgba(255, 255, 255, 0.12);
  }

  .hero-chip.ip-chip {
    background: rgba(74, 122, 236, 0.22);
  }

  .hero-chip.char-chip {
    background: rgba(93, 226, 160, 0.15);
  }

  .hero-chip.tag-chip {
    background: rgba(201, 148, 255, 0.18);
    color: #f1dcff;
  }

  .nav-icon-btn {
    background: var(--app-glass);
  }
}
</style>
