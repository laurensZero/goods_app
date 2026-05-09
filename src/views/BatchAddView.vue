<template>
  <div class="page batch-add-page">
    <NavBar title="批量添加" show-back>
      <template #right>
        <span class="batch-count">{{ cards.length }} 件</span>
      </template>
    </NavBar>

    <main class="batch-add-body">
      <div class="batch-toolbar">
        <button class="batch-toolbar__btn" type="button" @click="showDefaults = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>默认值</span>
        </button>
        <button class="batch-toolbar__btn" type="button" @click="addMoreImages">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>添加图片</span>
        </button>
      </div>

      <div v-if="cards.length" class="batch-list">
        <BatchAddCard
          v-for="card in cards"
          :key="card.id"
          :card="card"
          :ip-options="presetsStore.ips"
          :category-options="presetsStore.categories"
          @update="(e) => updateCard(card.id, e)"
          @mark-dirty="(f) => markDirty(card.id, f)"
          @swap="() => swapImage(card.id)"
          @remove="() => removeCard(card.id)"
        />
      </div>

      <div v-else class="batch-empty">
        <p class="batch-empty__text">没有图片，请点击上方「添加图片」</p>
      </div>
    </main>

    <div class="batch-footer">
      <button
        class="batch-save-btn"
        type="button"
        :disabled="!canSave"
        @click="handleSave"
      >
        {{ saving ? '保存中...' : `保存全部 ${cards.length} 件` }}
      </button>
    </div>

    <BatchDefaultsSheet
      v-model="showDefaults"
      :ip-options="presetsStore.ips"
      :category-options="presetsStore.categories"
      :defaults="defaults"
      @apply="applyDefaults"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import BatchAddCard from '@/components/goods/BatchAddCard.vue'
import BatchDefaultsSheet from '@/components/goods/BatchDefaultsSheet.vue'
import { usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { pickLinkedLocalImages } from '@/utils/localImage'
import { createGoodsImageId } from '@/utils/goodsImages'

const router = useRouter()
const presetsStore = usePresetsStore()
const goodsStore = useGoodsStore()

const cards = ref([])
const isWishlist = ref(false)
const defaults = ref({ ip: '', category: '', price: '' })
const today = new Date().toISOString().slice(0, 10)
const showDefaults = ref(false)
const saving = ref(false)

function makeCard(imageUri) {
  return {
    id: createGoodsImageId(),
    imageUri,
    name: '',
    category: '',
    ip: '',
    charactersText: '',
    price: '',
    dirtyFields: new Set()
  }
}

onMounted(() => {
  isWishlist.value = history.state?.isWishlist === true
  const raw = history.state?.batchImages
  if (raw) {
    try {
      const images = JSON.parse(raw)
      cards.value = images.map((img) => makeCard(img.uri))
    } catch (e) {
      console.warn('[BatchAddView] failed to parse batchImages from state', e)
    }
  }
})

function updateCard(id, { field, value }) {
  const card = cards.value.find((c) => c.id === id)
  if (card) card[field] = value
}

function markDirty(id, field) {
  const card = cards.value.find((c) => c.id === id)
  if (card) card.dirtyFields.add(field)
}

function removeCard(id) {
  cards.value = cards.value.filter((c) => c.id !== id)
}

async function swapImage(id) {
  const picked = await pickLinkedLocalImages(1)
  if (!picked.length) return
  const card = cards.value.find((c) => c.id === id)
  if (card) card.imageUri = picked[0].uri
}

async function addMoreImages() {
  const picked = await pickLinkedLocalImages()
  if (!picked.length) return
  const newCards = picked.map((img) => makeCard(img.uri))
  applyDefaultsToCards(newCards)
  cards.value.push(...newCards)
}

function applyDefaults(newDefaults) {
  defaults.value = { ...newDefaults }
  applyDefaultsToCards(cards.value)
}

function applyDefaultsToCards(targetCards) {
  for (const card of targetCards) {
    if (defaults.value.ip && !card.dirtyFields.has('ip') && !card.ip) {
      card.ip = defaults.value.ip
    }
    if (defaults.value.category && !card.dirtyFields.has('category') && !card.category) {
      card.category = defaults.value.category
    }
    if (defaults.value.price && !card.dirtyFields.has('price') && !card.price) {
      card.price = defaults.value.price
    }
  }
}

const canSave = computed(() => {
  return cards.value.length > 0 && cards.value.every((c) => c.name.trim())
})

async function handleSave() {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    const items = cards.value.map((card) => ({
      name: card.name.trim(),
      category: card.category,
      ip: card.ip,
      characters: card.charactersText
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      price: card.price,
      isWishlist: isWishlist.value,
      quantity: 1,
      collectStatus: isWishlist.value ? '' : '已入库',
      acquiredAt: isWishlist.value ? '' : today,
      images: [
        {
          id: createGoodsImageId(),
          uri: card.imageUri,
          kind: 'primary',
          isPrimary: true
        }
      ]
    }))
    await goodsStore.addMultipleGoods(items)
    router.replace('/')
  } catch (e) {
    console.error('[BatchAddView] save failed', e)
  } finally {
    saving.value = false
  }
}

</script>

<style scoped>
.batch-add-page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--app-surface);
}

.batch-add-body {
  flex: 1;
  padding: 0 12px;
  padding-bottom: 80px;
  overflow-y: auto;
  scrollbar-width: none;
}

.batch-add-body::-webkit-scrollbar {
  display: none;
}

.batch-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary);
}

.batch-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 0;
}

.batch-toolbar__btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card, 18px);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease;
}

.batch-toolbar__btn:active {
  transform: scale(0.97);
  background: var(--app-glass);
}

.batch-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 700px) {
  .batch-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

.batch-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

.batch-empty__text {
  font-size: 14px;
  color: var(--app-text-tertiary);
}

.batch-footer {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  padding: 12px 16px max(12px, env(safe-area-inset-bottom));
  background: var(--app-surface);
  border-top: 1px solid var(--app-border);
  z-index: 10;
}

.batch-save-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 14px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  cursor: pointer;
}

.batch-save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

:global(html.theme-dark) .batch-toolbar__btn {
  background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass));
  border-color: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .batch-save-btn {
  background: #f5f5f7;
  color: #141416;
}
</style>
