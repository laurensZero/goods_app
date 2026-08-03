<template>
  <Teleport to="body">
    <Transition name="sheet-pop">
      <div v-if="modelValue" class="sheet-backdrop" @click="close" />
    </Transition>

    <Transition name="sheet-pop">
      <div v-if="modelValue && item" class="sheet-panel" role="dialog" aria-modal="true" :aria-label="item.name">
        <div class="sheet-handle" aria-hidden="true" />

        <div class="sheet-body">
          <div class="sheet-cover">
            <LazyCachedImage
              v-if="item.coverImage"
              :src="item.coverImage"
              :alt="item.name"
              class="sheet-img"
              :lazy="false"
              :skeleton-enabled="false"
            />
            <span v-else class="sheet-fallback">{{ coverInitial }}</span>
          </div>

          <div class="sheet-info">
            <h3 class="sheet-name">{{ item.name }}</h3>

            <div class="sheet-chips">
              <span v-if="item.category" class="sheet-chip">{{ item.category }}</span>
              <span v-if="item.ip" class="sheet-chip sheet-chip--ip">{{ item.ip }}</span>
              <span
                v-for="character in displayCharacters"
                :key="character"
                class="sheet-chip sheet-chip--char"
              >
                {{ character }}
              </span>
              <span v-if="item.variant" class="sheet-chip sheet-chip--variant">{{ item.variant }}</span>
            </div>

            <div class="sheet-meta">
              <span v-if="displayAcquiredAtText" class="sheet-date">{{ displayAcquiredAtText }}</span>
              <span v-if="Number(item.quantity) > 1" class="sheet-qty">×{{ item.quantity }}</span>
              <span v-if="totalPrice !== ''" class="sheet-price">{{ totalPrice }}</span>
            </div>

            <p v-if="item.note" class="sheet-note">{{ item.note }}</p>
          </div>
        </div>

        <button type="button" class="sheet-action-btn" @click="openDetail">
          {{ t('home.viewDetail') }}
        </button>

        <button type="button" class="sheet-cancel" @click="close">{{ t('common.close') }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatPrice } from '@/utils/format'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  item: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'open-detail'])
const { t } = useI18n()

const coverInitial = computed(() => (props.item?.name || '').trim().charAt(0).toUpperCase() || '✦')
const displayCharacters = computed(() => {
  const c = props.item?.characters
  return Array.isArray(c) ? c.slice(0, 3) : []
})

const totalPrice = computed(() => {
  const item = props.item
  if (!item) return ''
  const quantity = Math.max(1, Number(item.quantity) || 1)
  const shipping = Number(item.shippingFee) || 0
  const base = item.actualPrice !== '' && item.actualPrice != null
    ? (Number(item.actualPrice) || 0)
    : (hasPriceValue(item.price) ? Number(item.price) || 0 : 0)
  const total = (base * quantity) + shipping
  return formatPrice(total)
})

function hasPriceValue(value) {
  return value !== '' && value != null
}

const displayAcquiredAtText = computed(() => {
  const item = props.item
  if (!item) return ''
  const list = Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : []
  const seen = new Set()
  const deduped = []

  for (const date of list) {
    const normalized = String(date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }

  if (deduped.length > 1) return deduped.join(' / ')
  return String(item.acquiredAt || '').trim()
})

function close() { emit('update:modelValue', false) }

useDialogBackButton(close, () => props.modelValue)
function openDetail() { emit('open-detail', props.item.sourceId || props.item.id) }
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

.sheet-body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.sheet-cover {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(142, 142, 147, 0.15);
}

.sheet-img { display: block; width: 100%; height: 100%; object-fit: cover; }
.sheet-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: var(--app-text-tertiary); font-size: 32px; font-weight: 700;
}

.sheet-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.sheet-name {
  margin: 0; color: var(--app-text); font-size: 16px; font-weight: 700;
  line-height: 1.3; letter-spacing: -0.02em;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}

.sheet-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.sheet-chip {
  padding: 3px 8px; border-radius: 99px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 11px; font-weight: 500;
}
.sheet-chip--ip {
  background: rgba(74, 122, 236, 0.12);
  color: #4a7aec;
}
.sheet-chip--char {
  background: rgba(93, 226, 160, 0.14);
  color: #2a9361;
}
.sheet-chip--variant {
  background: rgba(255, 180, 0, 0.12);
  color: #9a6c00;
}

.sheet-meta {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}

.sheet-date { color: var(--app-text-tertiary); font-size: 12px; }
.sheet-qty {
  padding: 2px 6px; border-radius: 999px;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text-secondary);
  font-size: 11px; font-weight: 700; line-height: 1.2;
}
.sheet-price { color: var(--app-text); font-size: 14px; font-weight: 700; }

.sheet-note {
  margin: 0; color: var(--app-text-secondary); font-size: 12px;
  overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

.sheet-action-btn {
  height: 48px; width: 100%; border: none; border-radius: 14px;
  background: var(--app-text); color: var(--app-surface);
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
  margin-bottom: 10px; transition: opacity 0.14s ease, transform 0.14s ease;
}
.sheet-action-btn:active { opacity: 0.88; transform: scale(0.985); }

.sheet-cancel {
  height: 54px; width: 100%; border: none; border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  font-size: 16px; font-weight: 600; color: var(--app-text, #141416);
  transition: background 0.14s ease;
}
.sheet-cancel:active { background: rgba(142, 142, 147, 0.18); }

/* Transitions — 手机端底部上滑，平板端居中淡入 */
.sheet-pop-enter-active,
.sheet-pop-leave-active {
  transition: opacity 0.24s ease, transform 0.26s cubic-bezier(0.32, 0.94, 0.6, 1);
}
.sheet-pop-enter-from,
.sheet-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(100%);
}
/* 遮罩只淡入淡出 */
.sheet-backdrop.sheet-pop-enter-active,
.sheet-backdrop.sheet-pop-leave-active {
  transition: opacity 0.24s ease;
}
.sheet-backdrop.sheet-pop-enter-from,
.sheet-backdrop.sheet-pop-leave-to {
  opacity: 0;
  transform: none;
}

/* Tablet — 居中弹窗，与 DailyRecommendation 一致 */
@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto;
    top: 50%;
    left: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
    padding-top: 20px;
    padding-bottom: 20px;
  }
  .sheet-handle { display: none; }
  .sheet-cancel { display: none; }
  /* 平板端用缩放入场，不用底部上滑 */
  .sheet-pop-enter-active,
  .sheet-pop-leave-active {
    transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.34, 1.3, 0.64, 1);
  }
  .sheet-pop-enter-from,
  .sheet-pop-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(-50%) scale(0.94);
  }
}

:global(html.theme-dark) .sheet-panel {
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.04);
}
:global(html.theme-dark) .sheet-chip--ip {
  color: #7da4f5;
  background: rgba(74, 122, 236, 0.18);
}
:global(html.theme-dark) .sheet-chip--char {
  color: #4fd69b;
  background: rgba(93, 226, 160, 0.14);
}
:global(html.theme-dark) .sheet-chip--variant {
  color: #f5c842;
  background: rgba(255, 180, 0, 0.14);
}
:global(html.theme-dark) .sheet-action-btn {
  background: #f5f5f7; color: #141416;
}
:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}
</style>
