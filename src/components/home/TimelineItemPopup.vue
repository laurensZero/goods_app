<template>
  <AppSheet
    :model-value="modelValue && !!item"
    sheet-class="timeline-item-popup"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <div v-if="item" class="sheet-body">
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
          <span v-if="displayVariant" class="sheet-chip sheet-chip--variant">{{ displayVariant }}</span>
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
  </AppSheet>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatPrice } from '@/utils/format'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { getTimelineDisplayTotal } from '@/composables/home/useHomeTimeline'
import { getDisplayGoodsVariant } from '@/utils/goods/identity'

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
const displayVariant = computed(() => getDisplayGoodsVariant(props.item))

const totalPrice = computed(() => {
  const item = props.item
  if (!item) return ''
  return formatPrice(getTimelineDisplayTotal(item))
})

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
/* 外壳由 AppSheet 提供；此处只保留内容样式 */

/* 宽屏 center 时覆盖 AppSheet 默认宽度（原 480px） */
:global(.app-sheet-overlay--center .timeline-item-popup.app-sheet--center) {
  width: min(480px, calc(100vw - 48px)) !important;
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
  margin-bottom: 0; transition: opacity 0.14s ease, transform 0.14s ease;
}
.sheet-action-btn:active { opacity: 0.88; transform: scale(0.985); }

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
</style>
