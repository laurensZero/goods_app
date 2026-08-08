<template>
  <div class="page monitor-page">
    <NavBar :title="t('nav.mihoyoStockMonitor')" show-back />

    <main class="page-body">
      <section v-if="!authStore.isLoggedIn" class="state-card state-card--empty">
        <span class="state-card__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h2 class="state-card__title">{{ t('mihoyoStock.needLogin') }}</h2>
        <p class="state-card__desc">{{ t('mihoyoStock.needLoginDesc') }}</p>
        <button class="primary-btn" type="button" @click="goToLogin">{{ t('mihoyoStock.goToLogin') }}</button>
      </section>

      <section v-else>
        <section class="hero-card">
          <div class="hero-card__copy">
            <p class="hero-card__label">Stock Monitor</p>
            <h1 class="hero-card__title">{{ t('mihoyoStock.title') }}</h1>
            <p class="hero-card__desc">{{ t('mihoyoStock.desc') }}</p>
          </div>
          <div class="hero-card__stats">
            <article class="stat-pill">
              <span class="stat-pill__value">{{ monitorStore.count }}</span>
              <span class="stat-pill__label">{{ t('mihoyoStock.monitored') }}</span>
            </article>
            <article class="stat-pill">
              <span class="stat-pill__value stat-pill__value--stock">{{ inStockCount }}</span>
              <span class="stat-pill__label">{{ t('mihoyoStock.inStock') }}</span>
            </article>
          </div>
        </section>

        <section class="add-card">
          <div class="add-card__copy">
            <p class="add-card__label">{{ t('mihoyoStock.addLabel') }}</p>
            <p class="add-card__desc">{{ t('mihoyoStock.addDesc') }}</p>
          </div>
          <div class="add-card__row">
            <input
              v-model="inputValue"
              class="add-input"
              type="text"
              :placeholder="t('mihoyoStock.addPlaceholder')"
              :disabled="adding || loading"
              @keyup.enter="handleAdd"
            />
            <button
              class="add-btn"
              type="button"
              :disabled="adding || loading || !inputValue.trim()"
              @click="handleAdd"
            >
              <svg v-if="adding" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>{{ t('mihoyoStock.add') }}</span>
            </button>
          </div>
        </section>

        <section class="list-card">
          <div class="list-card__head">
            <div class="list-card__copy">
              <p class="list-card__label">Records</p>
              <h2 class="list-card__title">
                {{ monitorStore.items.length > 0 ? t('mihoyoStock.monitorCount', { count: monitorStore.items.length }) : t('mihoyoStock.empty') }}
              </h2>
            </div>
            <button class="refresh-btn" type="button" :disabled="loading" @click="loadList">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              <span>{{ t('mihoyoStock.refresh') }}</span>
            </button>
          </div>

          <section v-if="loading && monitorStore.items.length === 0" class="state-card state-card--loading">
            <span class="spinner" />
            <p class="state-card__desc">{{ t('common.loading') }}</p>
          </section>

          <section v-else-if="loadError" class="state-card state-card--empty">
            <span class="state-card__icon state-card__icon--danger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5" />
                <path d="M12 16h.01" />
              </svg>
            </span>
            <h2 class="state-card__title">{{ loadError }}</h2>
            <button class="primary-btn" type="button" @click="loadList">{{ t('mihoyoStock.retry') }}</button>
          </section>

          <section v-else-if="monitorStore.items.length === 0" class="state-card state-card--empty">
            <span class="state-card__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                <path d="M12 22.08V12" />
              </svg>
            </span>
            <h2 class="state-card__title">{{ t('mihoyoStock.emptyTitle') }}</h2>
            <p class="state-card__desc">{{ t('mihoyoStock.emptyDesc') }}</p>
          </section>

          <section v-else class="monitor-list">
            <article
              v-for="item in monitorStore.items"
              :key="item.id"
              class="monitor-item"
            >
              <div class="monitor-item__thumb">
                <img
                  v-if="item.cover_url"
                  :src="item.cover_url"
                  class="monitor-item__thumb-img"
                  loading="lazy"
                  alt=""
                />
                <span v-else class="monitor-item__thumb-fallback">{{ (item.name || '谷').charAt(0) }}</span>
              </div>
              <div class="monitor-item__copy">
                <div class="monitor-item__topline">
                  <h3 class="monitor-item__title">{{ item.name || t('mihoyoStock.unnamed') }}</h3>
                  <span :class="['monitor-status', statusClass(item)]">{{ statusLabel(item) }}</span>
                </div>
                <div class="monitor-item__meta">
                  <span class="monitor-meta-pill">{{ priceText(item) }}</span>
                  <span v-if="item.last_checked_at" class="monitor-item__checked">
                    {{ t('mihoyoStock.checkedAt', { time: formatCheckedAt(item.last_checked_at) }) }}
                  </span>
                </div>
              </div>
              <button
                class="monitor-item__remove"
                type="button"
                :aria-label="t('mihoyoStock.remove')"
                :disabled="removingId === item.id"
                @click="handleRemove(item)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </article>
          </section>
        </section>

        <p class="monitor-note">{{ t('mihoyoStock.note') }}</p>
      </section>

      <AppToast :message="toastMsg" />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { useMihoyoStockMonitorStore } from '@/stores/mihoyoStockMonitor'
import { parseMihoyoUrl, getMihoyoShopCodeByIp } from '@/utils/mihoyo'

defineOptions({ name: 'MihoyoStockMonitorView' })

const { t } = useI18n()
const router = useRouter()
const { toastMsg, showToast } = useToast()

const authStore = useAuthStore()
const monitorStore = useMihoyoStockMonitorStore()

const inputValue = ref('')
const adding = ref(false)
const loading = ref(false)
const loadError = ref('')
const removingId = ref('')

const inStockCount = computed(() => monitorStore.items.filter((i) => !!i.in_stock).length)

function formatCheckedAt(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function priceText(item) {
  const cents = Number(item.price_cents) || 0
  if (cents <= 0) return t('mihoyoStock.noPrice')
  const yuan = cents / 100
  return (yuan % 1 === 0 ? yuan.toFixed(0) : yuan.toFixed(2)) + t('mihoyoStock.priceUnit')
}

function statusLabel(item) {
  if (item.in_stock) return t('mihoyoStock.statusInStock')
  if (!item.last_checked_at) return t('mihoyoStock.statusChecking')
  return t('mihoyoStock.statusSoldOut')
}

function statusClass(item) {
  if (item.in_stock) return 'monitor-status--stock'
  if (!item.last_checked_at) return 'monitor-status--checking'
  return 'monitor-status--sold'
}

function goToLogin() {
  router.push('/manage/sync')
}

async function loadList() {
  if (!authStore.isLoggedIn) return
  loading.value = true
  loadError.value = ''
  try {
    await monitorStore.load()
  } catch (e) {
    loadError.value = e.message || t('common.loadingFailed')
  } finally {
    loading.value = false
  }
}

async function handleAdd() {
  const raw = inputValue.value.trim()
  if (!raw || adding.value) return
  adding.value = true
  try {
    // 兼容直接粘贴 19 位 goods_id 与完整商品链接
    const url = /^\d{6,}$/.test(raw) ? `https://www.mihoyogift.com/goods/${raw}` : raw
    const parsed = await parseMihoyoUrl(url)
    const row = await monitorStore.add({
      goodsId: parsed.goodsId,
      shopCode: getMihoyoShopCodeByIp(parsed.ip),
      name: parsed.name,
      priceCents: parsed.price ? Math.round(parsed.price * 100) : 0,
      coverUrl: parsed.image,
    })
    inputValue.value = ''
    showToast(row.in_stock ? t('mihoyoStock.addSuccessNow') : t('mihoyoStock.addSuccess'))
  } catch (e) {
    showToast(e.message || t('common.failed'))
  } finally {
    adding.value = false
  }
}

async function handleRemove(item) {
  removingId.value = item.id
  try {
    await monitorStore.remove(item.id)
    showToast(t('mihoyoStock.removeSuccess'))
  } catch (e) {
    showToast(e.message || t('common.failed'))
  } finally {
    removingId.value = ''
  }
}

onMounted(() => {
  if (authStore.isLoggedIn && !monitorStore.isInitialized) {
    loadList()
  }
})
</script>

<style scoped>
.monitor-page {
  min-height: 100dvh;
}

.page-body {
  padding-bottom: 40px;
}

.page-body > section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}

/* 包装层内部的卡片之间保留标准间距（首卡不额外加，避免与包装层 margin 叠加） */
.page-body > section > section + section {
  margin-top: var(--section-gap);
}

/* Hero */
.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.hero-card__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-card__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.hero-card__desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  max-width: 220px;
}

.hero-card__stats {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 60px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--app-surface-soft);
}

.stat-pill__value {
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
}

.stat-pill__value--stock {
  color: #34c759;
}

.stat-pill__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
}

/* Add */
.add-card {
  padding: 16px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.add-card__label {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.add-card__desc {
  margin-top: 3px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.add-card__row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.add-input {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  outline: none;
}

.add-input:focus {
  border-color: var(--app-chip-accent-text);
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.add-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* List */
.list-card {
  padding: 16px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.list-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.list-card__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.list-card__title {
  margin-top: 2px;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.refresh-btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.monitor-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.monitor-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: var(--app-surface-soft);
}

.monitor-item__thumb {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface);
}

.monitor-item__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.monitor-item__thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--app-text-tertiary);
  font-size: 18px;
}

.monitor-item__copy {
  flex: 1;
  min-width: 0;
}

.monitor-item__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.monitor-item__title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-status {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
}

.monitor-status--stock {
  background: rgba(52, 199, 89, 0.14);
  color: #34c759;
}

.monitor-status--sold {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.monitor-status--checking {
  background: rgba(255, 149, 0, 0.14);
  color: #ff9500;
}

.monitor-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.monitor-meta-pill {
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 11px;
}

.monitor-item__checked {
  color: var(--app-text-tertiary);
  font-size: 11px;
}

.monitor-item__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.monitor-item__remove svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}

.monitor-item__remove:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: #ff3b30;
}

.monitor-item__remove:disabled {
  opacity: 0.5;
}

/* State cards */
.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 20px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: center;
}

.state-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(84, 184, 253, 0.12);
  color: #54b8fd;
}

.state-card__icon svg {
  width: 26px;
  height: 26px;
  stroke: currentColor;
}

.state-card__icon--danger {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.state-card__title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.state-card__desc {
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.primary-btn {
  margin-top: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 12px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.monitor-note {
  margin-top: 14px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.spinner {
  animation: spin 0.9s linear infinite;
  stroke: currentColor;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
