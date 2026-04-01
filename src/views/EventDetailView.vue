<template>
  <div v-if="event" class="page event-detail-page">
    <NavBar :title="event.name || '活动详情'" show-back>
      <template #right>
        <button class="nav-icon-btn" type="button" aria-label="编辑活动" @click="router.push(`/events/edit/${event.id}`)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
          </svg>
        </button>
        <button class="nav-icon-btn danger" type="button" aria-label="删除活动" @click="showDeleteDialog = true">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6H21" />
            <path d="M8 6V4H16V6" />
            <path d="M19 6L18 20H6L5 6" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main class="page-body">
      <section class="detail-shell">
        <aside class="media-column">
          <section class="cover-stage">
            <div class="cover-card" :class="{ 'cover-card--empty': !event.coverImage }">
              <img v-if="event.coverImage" :src="event.coverImage" :alt="event.name" class="cover-card__img" />
              <div v-else class="cover-card__fallback">{{ coverFallback }}</div>
            </div>

            <div v-if="event.photos?.length" class="gallery-card">
              <EventPhotoGrid :photos="event.photos" @preview="openPhotoPreview" />
            </div>
          </section>
        </aside>

        <section class="content-column">
          <section class="hero-card">
            <div class="hero-card__meta">
              <span class="hero-chip" :class="typeChipClass">{{ typeLabel }}</span>
              <span v-if="event.tags?.length" class="hero-chip hero-chip--tag">{{ event.tags[0] }}</span>
              <span v-if="event.location" class="hero-date">{{ event.location }}</span>
              <span v-if="event.startDate" class="hero-date">{{ dateDisplay }}</span>
            </div>

            <h1 class="hero-title">{{ event.name }}</h1>

            <div class="hero-price">
              <span class="hero-price__label">票务</span>
              <p class="hero-price__value">
                <span class="hero-price__currency">¥</span>
                <span class="hero-price__amount">{{ ticketPriceAmount }}</span>
              </p>
            </div>
          </section>

          <section class="info-section">
            <div class="section-head">
              <p class="section-label">信息卡片</p>
              <h2 class="section-title">活动信息</h2>
            </div>

            <div class="info-card">
              <article class="info-tile">
                <span class="info-label">活动类型</span>
                <strong class="info-value">{{ typeLabel }}</strong>
              </article>

              <article class="info-tile">
                <span class="info-label">开始日期</span>
                <strong class="info-value">{{ event.startDate || '未填写' }}</strong>
              </article>

              <article class="info-tile">
                <span class="info-label">结束日期</span>
                <strong class="info-value">{{ event.endDate || event.startDate || '未填写' }}</strong>
              </article>

              <article class="info-tile">
                <span class="info-label">活动地点</span>
                <strong class="info-value">{{ event.location || '未填写' }}</strong>
              </article>

              <article class="info-tile">
                <span class="info-label">票价</span>
                <strong class="info-value">¥{{ ticketPriceAmount }}</strong>
              </article>

              <article class="info-tile">
                <span class="info-label">活动照片</span>
                <strong class="info-value">{{ event.photos?.length || 0 }} 张</strong>
              </article>

              <article class="info-tile">
                <span class="info-label">关联谷子</span>
                <strong class="info-value">{{ linkedGoodsList.length }} 件</strong>
              </article>

              <article class="info-tile">
                <span class="info-label">标签</span>
                <strong class="info-value">{{ tagsDisplay }}</strong>
              </article>
            </div>
          </section>

          <section v-if="event.description" class="note-section">
            <div class="section-head">
              <p class="section-label">附加信息</p>
              <h2 class="section-title">备注</h2>
            </div>

            <article class="note-card">
              <p class="note-body">{{ event.description }}</p>
            </article>
          </section>

          <section v-if="linkedGoodsList.length > 0" class="linked-section">
            <div class="section-head">
              <p class="section-label">Linked Goods</p>
              <h2 class="section-title">关联谷子</h2>
            </div>

            <div class="linked-goods-grid">
              <RouterLink
                v-for="goods in linkedGoodsList"
                :key="goods.id"
                :to="`/detail/${goods.id}`"
                class="linked-goods-card"
              >
                <img v-if="goods.coverImage" :src="goods.coverImage" :alt="goods.name" class="linked-goods-card__img" />
                <div v-else class="linked-goods-card__placeholder">{{ goods.name?.trim()?.charAt(0) || '谷' }}</div>
                <span class="linked-goods-card__name">{{ goods.name }}</span>
              </RouterLink>
            </div>
          </section>
        </section>
      </section>
    </main>

    <Transition name="dialog-fade">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="dialog-card">
          <h3 class="dialog-title">删除活动</h3>
          <p class="dialog-message">确认删除“{{ event.name }}”吗？删除后将无法恢复。</p>
          <div class="dialog-actions">
            <button class="dialog-btn" type="button" @click="showDeleteDialog = false">取消</button>
            <button class="dialog-btn danger" type="button" @click="handleDelete">删除</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="dialog-fade">
      <div v-if="previewPhotoIndex >= 0" class="photo-preview-overlay" @click.self="closePhotoPreview">
        <button class="photo-preview__close" type="button" @click="closePhotoPreview">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18" />
            <path d="M6 6L18 18" />
          </svg>
        </button>
        <img
          v-if="event.photos[previewPhotoIndex]?.uri"
          class="photo-preview__img"
          :src="event.photos[previewPhotoIndex].uri"
          :alt="event.photos[previewPhotoIndex]?.caption || `照片 ${previewPhotoIndex + 1}`"
        />
      </div>
    </Transition>
  </div>

  <div v-else class="page event-detail-page">
    <NavBar title="活动详情" show-back />
    <main class="page-body">
      <section class="empty-wrap">
        <EmptyState
          icon="✨"
          title="活动不存在"
          description="这条记录可能已经被删除，或者还没有同步到本地。"
          action-text="返回活动列表"
          @action="router.push('/events')"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeMount, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useGoodsStore } from '@/stores/goods'
import EmptyState from '@/components/common/EmptyState.vue'
import NavBar from '@/components/common/NavBar.vue'
import EventPhotoGrid from '@/components/events/EventPhotoGrid.vue'
import { usePageScrollRestore } from '@/composables/scroll/usePageScrollRestore'

defineOptions({ name: 'EventDetailView' })

const props = defineProps({
  id: { type: String, default: '' }
})

const router = useRouter()
const route = useRoute()
const eventsStore = useEventsStore()
const goodsStore = useGoodsStore()

const { setWindowScrollTop } = usePageScrollRestore()

const EVENT_ADD_SCROLL_LOCK_CLASS = 'event-add-scroll-lock'

function syncEventScrollLock(active) {
  document.documentElement.classList.toggle(EVENT_ADD_SCROLL_LOCK_CLASS, active)
  document.body.classList.toggle(EVENT_ADD_SCROLL_LOCK_CLASS, active)
}

const showDeleteDialog = ref(false)
const previewPhotoIndex = ref(-1)

const eventId = computed(() => props.id || route.params.id)
const event = computed(() => eventsStore.getById(eventId.value))

const TYPE_MAP = {
  exhibition: { label: '展会', cls: 'type-exhibition' },
  concert: { label: '音乐会', cls: 'type-concert' },
  other: { label: '其他', cls: 'type-other' }
}

const typeInfo = computed(() => TYPE_MAP[event.value?.type] || TYPE_MAP.other)
const typeLabel = computed(() => typeInfo.value.label)
const typeChipClass = computed(() => typeInfo.value.cls)
const coverFallback = computed(() => event.value?.name?.trim()?.charAt(0) || '活')
const dateDisplay = computed(() => {
  if (!event.value?.startDate) return '未填写'
  if (!event.value.endDate || event.value.endDate === event.value.startDate) return event.value.startDate
  return `${event.value.startDate} - ${event.value.endDate}`
})
const linkedGoodsList = computed(() =>
  (event.value?.linkedGoodsIds || []).map((id) => goodsStore.getById(id)).filter(Boolean)
)
const tagsDisplay = computed(() => (
  event.value?.tags?.length ? event.value.tags.join('、') : '未填写'
))
const ticketPriceAmount = computed(() => {
  const value = Number.parseFloat(String(event.value?.ticketPrice || '').trim())
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '0'
})

async function refresh() {
  await eventsStore.refreshList()
  if (!goodsStore.isReady) {
    await goodsStore.init()
  } else {
    await goodsStore.refreshList()
  }
}

onBeforeMount(() => {
  setWindowScrollTop(0)
})

onMounted(async () => {
  syncEventScrollLock(true)
  if (!eventsStore.isReady) {
    await eventsStore.init()
  }
  await refresh()
})

onBeforeUnmount(() => {
  syncEventScrollLock(false)
})

onActivated(refresh)

function openPhotoPreview(index) {
  previewPhotoIndex.value = index
}

function closePhotoPreview() {
  previewPhotoIndex.value = -1
}

async function handleDelete() {
  if (!event.value) return
  await eventsStore.removeEventRecord(event.value.id)
  showDeleteDialog.value = false
  router.replace('/events')
}
</script>

<style scoped>
.event-detail-page {
  background: var(--app-bg-gradient);
}

.page-body {
  width: min(100%, 2048px);
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 16px) var(--page-padding) 120px;
}

.detail-shell {
  display: grid;
  gap: 24px;
}

.hero-card,
.info-card,
.note-card,
.gallery-card,
.linked-goods-card,
.dialog-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.cover-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cover-card {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 34px;
  overflow: hidden;
  background: linear-gradient(180deg, #2a2d35, #1d2028);
  box-shadow: var(--app-shadow);
}

.cover-card--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #2c2f38, #242731);
}

.cover-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-card__fallback {
  color: rgba(255, 255, 255, 0.88);
  font-size: 84px;
  font-weight: 700;
  letter-spacing: -0.06em;
}

.gallery-card {
  padding: 16px;
  border-radius: 24px;
}

.hero-card {
  padding: 28px;
  border-radius: 32px;
}

.hero-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.type-exhibition { background: rgba(90, 120, 250, 0.12); color: #355be0; }
.type-market { background: rgba(250, 149, 90, 0.14); color: #d26f20; }
.type-exchange { background: rgba(50, 200, 140, 0.14); color: #188f63; }
.type-other { background: rgba(142, 142, 147, 0.14); color: #6a6e77; }

.hero-chip--tag {
  background: rgba(120, 100, 255, 0.1);
  color: #7864ff;
}

.hero-date {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.04em;
}

.hero-price {
  margin-top: 18px;
}

.hero-price__label,
.section-label,
.info-label {
  color: var(--app-text-tertiary);
}

.hero-price__label {
  font-size: 13px;
}

.hero-price__value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 8px;
}

.hero-price__currency {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
}

.hero-price__amount {
  color: var(--app-text);
  font-size: 42px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.info-section,
.note-section,
.linked-section {
  margin-top: 18px;
}

.section-head {
  margin-bottom: 14px;
}

.section-label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.info-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border-radius: 28px;
}

.info-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--app-surface-soft) 74%, white);
}

.info-label {
  font-size: 13px;
}

.info-value {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  word-break: break-word;
}

.note-card {
  padding: 24px;
  border-radius: 28px;
}

.note-body {
  color: var(--app-text-secondary);
  font-size: 15px;
  line-height: 1.85;
  white-space: pre-wrap;
}

.linked-goods-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.linked-goods-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 20px;
  text-decoration: none;
  color: var(--app-text);
}

.linked-goods-card:active {
  transform: scale(0.96);
}

.linked-goods-card__img,
.linked-goods-card__placeholder {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 14px;
}

.linked-goods-card__img {
  object-fit: cover;
}

.linked-goods-card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #2c2f38, #242731);
  color: rgba(255, 255, 255, 0.82);
  font-size: 22px;
  font-weight: 700;
}

.linked-goods-card__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
}

.nav-icon-btn.danger {
  color: #d15353;
}

.nav-icon-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 20, 22, 0.24);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.dialog-card {
  width: 100%;
  max-width: 340px;
  padding: 24px;
  border-radius: 24px;
  text-align: center;
}

.dialog-title {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.dialog-message {
  margin: 0 0 20px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  gap: 10px;
}

.dialog-btn {
  flex: 1;
  height: 46px;
  border: none;
  border-radius: 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.dialog-btn.danger {
  background: #16171b;
  color: #ffffff;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.photo-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.88);
}

.photo-preview__close {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 12px);
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-preview__close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
}

.photo-preview__img {
  max-width: 90vw;
  max-height: 82vh;
  object-fit: contain;
  border-radius: 10px;
}

.empty-wrap {
  padding-top: 40px;
}

@media (min-width: 900px) {
  .detail-shell {
    grid-template-columns: 580px minmax(0, 1fr);
    align-items: start;
    column-gap: 30px;
  }

  .media-column {
    position: sticky;
    top: calc(env(safe-area-inset-top) + 20px);
  }

  .info-card {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 899px) {
  .cover-card {
    aspect-ratio: 16 / 10;
  }
}

@media (max-width: 720px) {
  .info-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .linked-goods-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .info-card {
    grid-template-columns: 1fr;
  }
}
</style>
