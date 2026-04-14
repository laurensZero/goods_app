<template>
  <section :class="['goods-section', 'goods-view-pane', { 'goods-view-pane--sorting': isSortAnimating }]">
    <div
      ref="goodsListEl"
      :class="[
        'goods-list',
        { 'goods-list--density-animating': transitioning }
      ]"
      :style="gridStyle"
    >
      <GoodsCard
        v-for="(item, index) in items"
        :key="item.id"
        :item="item"
        :density="density"
        :transitioning="transitioning"
        :data-goods-id="item.id"
        :data-scroll-anchor="'goods-card'"
        :data-scroll-index="index + indexOffset"
        :selected="selectedIds?.has?.(item.id) ?? false"
        :selection-mode="selectionMode"
        @long-press="emit('long-press', item.id)"
        @toggle-select="emit('toggle-select', item.id)"
        @open-detail="(payload) => emit('open-detail', payload || item.id)"
      />
      <div
        v-if="afterSpacerHeight > 0"
        class="goods-list-spacer"
        aria-hidden="true"
        :style="{ height: `${afterSpacerHeight}px` }"
      />
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import GoodsCard from '@/components/goods/GoodsCard.vue'

defineOptions({ name: 'GoodsCardGridSection' })

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  density: {
    type: String,
    required: true
  },
  gridStyle: {
    type: Object,
    default: () => ({})
  },
  transitioning: {
    type: Boolean,
    default: false
  },
  isSortAnimating: {
    type: Boolean,
    default: false
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  selectedIds: {
    type: Object,
    default: null
  },
  indexOffset: {
    type: Number,
    default: 0
  },
  afterSpacerHeight: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])

const goodsListEl = ref(null)

defineExpose({
  goodsListEl
})
</script>

<style scoped>
.goods-list {
  display: grid;
  gap: var(--card-gap);
  align-items: start;
  contain: layout paint;
}

.goods-view-pane {
  transform-origin: top center;
  contain: paint;
}

.goods-view-pane--sorting {
  pointer-events: none;
}

.goods-list-spacer {
  grid-column: 1 / -1;
  pointer-events: none;
}
</style>
