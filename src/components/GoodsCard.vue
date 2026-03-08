<template>
  <article class="goods-card" :class="{ 'goods-card--compact': density === 'compact' }" @click="$emit('click')">
    <div class="card-cover" :style="cachedImgSrc ? {} : { background: coverBg }">
      <img v-if="cachedImgSrc" :src="cachedImgSrc" :alt="item.name" class="cover-img" />
      <span v-else class="cover-initial">{{ coverInitial }}</span>
    </div>

    <div class="card-body">
      <h3 class="card-name">{{ item.name }}</h3>

      <div v-if="showTags" class="card-tags">
        <span v-if="showCategory" class="card-chip">{{ item.category }}</span>
        <span v-if="showIp" class="card-chip ip-chip">{{ item.ip }}</span>
        <span
          v-for="character in visibleCharacters"
          :key="character"
          class="card-chip char-chip"
        >
          {{ character }}
        </span>
      </div>

      <div class="card-bottom-row">
        <span class="card-price">{{ item.price ? `¥${item.price}` : '¥—' }}</span>
        <span v-if="showHoldingDays" class="card-days">持有 {{ holdingDays }} 天</span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getCachedImage } from '@/utils/imageCache'

const props = defineProps({
  item: { type: Object, required: true },
  density: { type: String, default: '' }
})

defineEmits(['click'])

const cachedImgSrc = ref('')

watch(
  () => props.item.image,
  async (url) => {
    cachedImgSrc.value = url ? await getCachedImage(url) : ''
  },
  { immediate: true }
)

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
  const [from, to] = colorMap[props.item.category] ?? ['#2c2c2e', '#3a3a3c']
  return `linear-gradient(135deg, ${from}, ${to})`
})

const coverInitial = computed(() => (props.item.name ?? '?').trim().charAt(0).toUpperCase() || '?')

const holdingDays = computed(() => {
  const date = props.item.acquiredAt
  if (!date) return null

  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  return days >= 0 ? days : null
})

const showCategory = computed(() => props.density !== 'compact' && !!props.item.category)
const showIp = computed(() => props.density !== 'compact' && !!props.item.ip)
const visibleCharacters = computed(() =>
  props.density === 'comfortable' ? props.item.characters || [] : []
)
const showTags = computed(() => showCategory.value || showIp.value || visibleCharacters.value.length > 0)
const showHoldingDays = computed(() => props.density !== 'compact' && holdingDays.value !== null)
</script>

<style scoped>
.goods-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 10px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--app-shadow);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  animation: card-enter 220ms ease both;
}

.goods-card:active {
  transform: scale(var(--press-scale-card));
}

@media (hover: hover) {
  .goods-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.08);
  }
}

.card-cover {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 10px;
  border-radius: 14px;
  background-size: cover;
  background-position: center;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 10px;
}

.cover-initial {
  color: rgba(255, 255, 255, 0.86);
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
  user-select: none;
}

.card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.card-name {
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.03em;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-tags {
  display: flex;
  gap: 5px;
  min-height: 21px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.card-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 2px 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #3a3a3c;
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-chip.ip-chip {
  background: rgba(28, 53, 88, 0.1);
  color: #1c3558;
}

.card-chip.char-chip {
  background: rgba(20, 20, 22, 0.08);
  color: #141416;
}

.card-bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  margin-top: auto;
  overflow: hidden;
  flex-wrap: nowrap;
}

.card-price {
  flex-shrink: 0;
  color: #8e8e93;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.2;
}

.card-days {
  overflow: hidden;
  color: #b0b0bc;
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goods-card--compact .card-body {
  gap: 4px;
  flex: 0 0 auto;
}

.goods-card--compact .card-bottom-row {
  margin-top: 0;
}

.goods-card--compact .card-cover {
  padding: 0;
}

.goods-card--compact .cover-img {
  width: 112%;
  height: 112%;
  border-radius: 0;
}

.goods-card--compact .card-name {
  min-height: 0;
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
