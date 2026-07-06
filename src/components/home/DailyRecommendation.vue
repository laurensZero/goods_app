<template>
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="modelValue" class="sheet-backdrop" @click="close" />
    </Transition>

    <Transition name="sheet-slide">
      <div v-if="modelValue" class="sheet-panel" role="dialog" aria-modal="true" :aria-label="t('home.dailyRec.label')">
        <div class="sheet-handle" aria-hidden="true" />

        <div class="sheet-header">
          <p class="sheet-title">{{ t('home.dailyRec.label') }}</p>
          <button type="button" class="shuffle-btn" :aria-label="t('home.dailyRec.shuffle')" @click="shuffle">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 18h3.5a4 4 0 0 0 3.5-2l2-3a4 4 0 0 1 3.5-2H21" />
              <path d="M3 6h3.5a4 4 0 0 1 3.5 2l1.5 2a4 4 0 0 0 3.5 2H21" />
              <path d="M18 2l3 3-3 3" />
              <path d="M18 16l3 3-3 3" />
            </svg>
            <span>{{ t('home.dailyRec.shuffle') }}</span>
          </button>
        </div>

        <Transition name="card-swap" mode="out-in">
          <div v-if="item" :key="item.id" class="rec-card" @click="openDetail">
            <div class="rec-cover">
              <LazyCachedImage
                v-if="item.coverImage"
                :src="item.coverImage"
                :alt="item.name"
                class="rec-img"
                :lazy="false"
                :skeleton-enabled="false"
              />
              <span v-else class="rec-fallback">{{ coverInitial }}</span>
            </div>
            <div class="rec-info">
              <h3 class="rec-name">{{ item.name }}</h3>
              <div class="rec-tags">
                <span v-if="item.category" class="rec-tag">{{ item.category }}</span>
                <span v-if="item.ip" class="rec-tag rec-tag--ip">{{ item.ip }}</span>
                <span v-for="c in displayCharacters" :key="c" class="rec-tag rec-tag--char">{{ c }}</span>
              </div>
              <p v-if="priceText" class="rec-price">{{ priceText }}</p>
              <p v-if="item.notes" class="rec-notes">{{ item.notes }}</p>
            </div>
          </div>
          <div v-else class="rec-empty">
            <p>{{ t('home.dailyRec.empty') }}</p>
          </div>
        </Transition>

        <button type="button" class="sheet-action-btn" :disabled="!item" @click="openDetail">
          {{ t('home.dailyRec.viewDetail') }}
        </button>

        <button type="button" class="sheet-cancel" @click="close">{{ t('common.close') }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CURRENCY_MAP } from '@/constants/currencies'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  items: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'open-detail'])
const { t } = useI18n()

const SEED_KEY = 'goods-app:daily-rec-seed'
const PICK_KEY = 'goods-app:daily-rec-pick'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const pickedId = ref('')

function resolvePick() {
  const list = props.items
  if (!list.length) { pickedId.value = ''; return }
  const tk = todayKey()
  const seed = localStorage.getItem(SEED_KEY)
  const id = localStorage.getItem(PICK_KEY)
  if (seed === tk && id && list.some(i => i.id === id)) {
    pickedId.value = id
    return
  }
  const newId = list[hash(tk) % list.length].id
  pickedId.value = newId
  localStorage.setItem(SEED_KEY, tk)
  localStorage.setItem(PICK_KEY, newId)
}

function shuffle() {
  const list = props.items
  if (list.length <= 1) return
  let next
  if (list.length === 2) {
    next = list[0].id === pickedId.value ? list[1].id : list[0].id
  } else {
    do { next = list[Math.floor(Math.random() * list.length)].id } while (next === pickedId.value)
  }
  pickedId.value = next
  localStorage.setItem(PICK_KEY, next)
  localStorage.setItem(SEED_KEY, todayKey())
}

const item = computed(() => pickedId.value ? props.items.find(i => i.id === pickedId.value) || null : null)
const coverInitial = computed(() => (item.value?.name || '').trim().charAt(0).toUpperCase() || '✦')
const displayCharacters = computed(() => {
  const c = item.value?.characters
  return Array.isArray(c) ? c.slice(0, 3) : []
})
const priceText = computed(() => {
  const g = item.value
  if (!g) return ''
  const v = Number.isFinite(Number(g.actualPrice)) && Number(g.actualPrice) > 0 ? Number(g.actualPrice) : Number(g.price)
  if (!Number.isFinite(v) || v <= 0) return ''
  return `${CURRENCY_MAP[g.currency]?.symbol || '¥'}${v.toFixed(2)}`
})

function close() { emit('update:modelValue', false) }
function openDetail() { if (item.value) emit('open-detail', item.value.id) }

watch(() => props.items, () => {
  if (!pickedId.value) { resolvePick(); return }
  if (!props.items.some(i => i.id === pickedId.value)) resolvePick()
}, { deep: false })

watch(() => props.modelValue, v => { if (v) resolvePick() })

resolvePick()
</script>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 90;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow:
    0 22px 54px color-mix(in srgb, var(--app-text) 14%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 4%, transparent);
  border-radius: 24px 24px 0 0;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 90dvh;
  overflow-y: auto;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
  flex-shrink: 0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
  margin: 0;
}

.shuffle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.18s ease, background 0.18s ease;
}

.shuffle-btn:active {
  transform: scale(0.94);
  background: color-mix(in srgb, var(--app-text) 14%, transparent);
}

.shuffle-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Card */
.rec-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.16s ease;
  margin-bottom: 12px;
}

.rec-card:active { transform: scale(0.985); }

.rec-cover {
  width: 96px;
  height: 96px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(142, 142, 147, 0.15);
  flex-shrink: 0;
}

.rec-img { display: block; width: 100%; height: 100%; object-fit: cover; }
.rec-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: var(--app-text-tertiary); font-size: 32px; font-weight: 700;
}

.rec-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.rec-name {
  margin: 0; color: var(--app-text); font-size: 16px; font-weight: 700;
  line-height: 1.3; letter-spacing: -0.02em;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}

.rec-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.rec-tag {
  display: inline-block; padding: 2px 8px; border-radius: 6px;
  background: rgba(142, 142, 147, 0.12); color: var(--app-text-secondary);
  font-size: 11px; line-height: 1.4;
  max-width: 120px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.rec-tag--ip { background: color-mix(in srgb, var(--color-primary, #07c160) 12%, transparent); color: var(--color-primary, #07c160); }
.rec-tag--char { background: color-mix(in srgb, var(--app-text) 8%, transparent); }

.rec-price { margin: 8px 0 0; color: var(--app-text-secondary); font-size: 14px; font-weight: 600; }
.rec-notes {
  margin: 6px 0 0; color: var(--app-text-tertiary); font-size: 12px; line-height: 1.4;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

.rec-empty { text-align: center; padding: 32px 16px; color: var(--app-text-tertiary); font-size: 14px; }

/* Action button */
.sheet-action-btn {
  height: 48px; width: 100%; border: none; border-radius: 14px;
  background: var(--app-text); color: var(--app-surface);
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
  margin-bottom: 10px; transition: opacity 0.14s ease, transform 0.14s ease;
}
.sheet-action-btn:disabled { opacity: 0.4; }
.sheet-action-btn:active:not(:disabled) { opacity: 0.88; transform: scale(0.985); }

.sheet-cancel {
  height: 54px; width: 100%; border: none; border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  font-size: 16px; font-weight: 600; color: var(--app-text, #141416);
  transition: background 0.14s ease;
}
.sheet-cancel:active { background: rgba(142, 142, 147, 0.18); }

/* Card swap */
.card-swap-enter-active { transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.34, 1.3, 0.64, 1); }
.card-swap-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.card-swap-enter-from { opacity: 0; transform: scale(0.95); }
.card-swap-leave-to { opacity: 0; transform: scale(0.95); }

/* Tablet */
@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto; top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
  }
  .sheet-handle { display: none; }
  .sheet-cancel { display: none; }
  .sheet-slide-enter-from,
  .sheet-slide-leave-to {
    transform: translateX(-50%) translateY(-50%) scale(0.94);
    opacity: 0;
  }
}

:global(html.theme-dark) .sheet-panel {
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.04);
}
:global(html.theme-dark) .rec-card {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}
:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}
:global(html.theme-dark) .sheet-action-btn {
  background: #f5f5f7; color: #141416;
}
</style>
