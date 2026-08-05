<template>
  <section class="form-section checkout-step">
    <div class="section-head">
      <p class="section-label">{{ $t('checkout.stepLabel', { current: stepNumber, total: stepCount }) }}</p>
      <h2 class="section-title">{{ $t('checkout.stepGoods') }}</h2>
    </div>

    <div class="checkout-mode-switch" role="tablist" :aria-label="$t('checkout.orderMode')">
      <button
        type="button"
        class="checkout-mode-switch__item"
        :class="{ 'checkout-mode-switch__item--active': !isPointOrder }"
        role="tab"
        :aria-selected="!isPointOrder"
        @click="$emit('set-order-mode', false)"
      >
        {{ $t('checkout.normalOrder') }}
      </button>
      <button
        type="button"
        class="checkout-mode-switch__item"
        :class="{ 'checkout-mode-switch__item--active': isPointOrder }"
        role="tab"
        :aria-selected="isPointOrder"
        @click="$emit('set-order-mode', true)"
      >
        {{ $t('checkout.pointExchange') }}
      </button>
    </div>

    <template v-if="!isPointOrder">
      <div class="field-card">
        <div class="search-row">
          <input
            v-model="keywordModel"
            type="text"
            class="search-input"
            :placeholder="$t('checkout.searchOrUrl')"
            @keydown.enter.prevent="handleSearch(cookie)"
          />
          <button class="search-btn" type="button" :disabled="searching" @click="handleSearch(cookie)">
            {{ searching ? $t('import.searching') : $t('common.search') }}
          </button>
        </div>
        <p v-if="searchError" class="field-error">{{ searchError }}</p>

        <div v-if="searchResults.length" class="search-results">
          <button
            v-for="r in searchResults"
            :key="r.goods_id"
            type="button"
            class="search-result-row"
            @click="addItemFromSearch(r, cookie)"
          >
            <img v-if="r.cover_url" :src="r.cover_url" class="search-result-thumb" loading="lazy" />
            <span class="search-result-name">{{ r.name }}</span>
          </button>
        </div>

        <button class="cart-entry" type="button" @click="$emit('open-cart-picker')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="9" cy="20" r="1.5" />
            <circle cx="18" cy="20" r="1.5" />
            <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.9a1 1 0 0 0 1-.77L21 7H7.4" />
          </svg>
          <span>{{ $t('checkout.fromCart') }}</span>
          <svg class="cart-entry__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </template>

    <div v-else class="points-panel">
      <div class="points-panel__head">
        <div>
          <p class="points-panel__label">{{ $t('checkout.currentPoints') }}</p>
          <p class="points-panel__balance">{{ pointBalance }} <span>{{ $t('checkout.pointsUnit') }}</span></p>
        </div>
        <button type="button" class="points-panel__refresh" :disabled="pointLoading" @click="loadPointGoods(true)">
          {{ pointLoading ? $t('checkout.loadingPoints') : $t('checkout.refreshPoints') }}
        </button>
      </div>

      <div class="points-tabs" role="tablist" :aria-label="$t('checkout.pointCategory')">
        <button
          type="button"
          class="points-tab"
          :class="{ 'points-tab--active': activePointShopCode === 'all' }"
          role="tab"
          :aria-selected="activePointShopCode === 'all'"
          @click="$emit('update:activePointShopCode', 'all')"
        >
          {{ $t('checkout.allIps') }}
        </button>
        <button
          v-for="shop in pointShopOptions"
          :key="shop.code"
          type="button"
          class="points-tab"
          :class="{ 'points-tab--active': activePointShopCode === shop.code }"
          role="tab"
          :aria-selected="activePointShopCode === shop.code"
          @click="$emit('update:activePointShopCode', shop.code)"
        >
          {{ pointShopLabel(shop) }}
        </button>
      </div>

      <div v-if="pointLoading" class="loading-state points-panel__loading">
        <div class="parse-spinner" />
        <p class="loading-text">{{ $t('checkout.loadingPointGoods') }}</p>
      </div>
      <p v-else-if="pointError" class="step-error">{{ pointError }}</p>
      <p v-else-if="!visiblePointGoods.length" class="empty-hint">{{ $t('checkout.noPointGoods') }}</p>
      <div v-else class="points-grid">
        <button
          v-for="pointGoodsItem in visiblePointGoods"
          :key="`${pointGoodsItem.shop_code}:${pointGoodsItem.goods_id}`"
          type="button"
          class="points-card"
          :class="{
            'points-card--selected': items.some((item) => item.goodsId === pointGoodsItem.goods_id),
            'points-card--soldout': pointGoodsItem.is_sold_out,
            'points-card--unaffordable': !isPointGoodsAffordable(pointGoodsItem),
          }"
          :disabled="pointGoodsItem.is_sold_out || !isPointGoodsAffordable(pointGoodsItem) || pointSelectingId === pointGoodsItem.goods_id"
          @click="selectPointGoods(pointGoodsItem)"
        >
          <img v-if="pointGoodsItem.cover_url" :src="pointGoodsItem.cover_url" class="points-card__image" loading="lazy" />
          <div v-else class="points-card__image points-card__image--fallback">礼</div>
          <span class="points-card__name">{{ pointGoodsItem.name }}</span>
          <span class="points-card__cost">{{ pointGoodsItem.point }} {{ $t('checkout.pointsUnit') }}</span>
          <span class="points-card__cash">{{ formatFen(pointGoodsItem.price) }}</span>
          <span v-if="pointGoodsItem.is_sold_out" class="points-card__status">{{ $t('checkout.soldOut') }}</span>
          <span v-else-if="!isPointGoodsAffordable(pointGoodsItem)" class="points-card__status">{{ $t('checkout.notEnoughPoints') }}</span>
        </button>
      </div>
      <p v-if="items.length" class="points-panel__hint">{{ $t('checkout.pointSkuHint') }}</p>
    </div>

    <div v-if="!items.length && !isPointOrder" class="field-card">
      <p class="empty-hint">{{ $t('checkout.addGoodsHint') }}</p>
    </div>

    <TransitionGroup name="goods-expand" tag="div" class="checkout-items">
      <div v-for="item in items" :key="item.id" class="field-card checkout-item">
        <div v-if="item.loading" class="item-loading">
          <div class="parse-spinner" />
        </div>
        <template v-else>
          <div v-if="item.error" class="item-error">{{ item.error }}</div>
          <div class="item-head">
            <img v-if="getItemCover(item)" :src="getItemCover(item)" class="item-cover" loading="lazy" />
            <div class="item-info">
              <h3 class="item-name">{{ item.name || item.goodsId }}</h3>
              <p class="item-price">
                <template v-if="item.isPointOrder">{{ item.pointCost }} {{ $t('checkout.pointsUnit') }} + {{ formatFen(getItemUnitPrice(item)) }}</template>
                <template v-else>{{ formatFen(getItemUnitPrice(item)) }}</template>
              </p>
            </div>
            <button class="item-remove" type="button" :aria-label="$t('common.delete')" @click="removeItem(item.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- SKU selector：购物车带 SKU 的不再选择，仅展示 -->
          <div v-if="!item.skuLocked && item.skus.length > 1" class="sku-section">
            <p class="sku-label">{{ $t('checkout.sku') }}</p>
            <div class="sku-chips">
              <button
                v-for="sku in item.skus"
                :key="sku.id"
                type="button"
                class="sku-chip"
                :class="{ 'sku-chip--selected': item.selectedSkuId === sku.id, 'sku-chip--disabled': sku.soldOut }"
                :disabled="sku.soldOut"
                @click="updateItemSku(item.id, sku.id, sku.text)"
              >
                {{ sku.text }}
                <span v-if="sku.soldOut" class="sku-chip__soldout">{{ $t('checkout.soldOut') }}</span>
                <span v-else-if="sku.stock >= 0" class="sku-chip__stock">{{ $t('checkout.stock', { n: sku.stock }) }}</span>
              </button>
            </div>
          </div>
          <div v-else-if="!item.skuLocked && item.skus.length === 1" class="sku-section">
            <p class="sku-label">{{ $t('checkout.sku') }}</p>
            <div class="sku-chips">
              <span class="sku-chip" :class="{ 'sku-chip--disabled': item.skus[0].soldOut }">
                {{ item.skus[0].text }}
                <span v-if="item.skus[0].soldOut" class="sku-chip__soldout">{{ $t('checkout.soldOut') }}</span>
                <span v-else-if="item.skus[0].stock >= 0" class="sku-chip__stock">{{ $t('checkout.stock', { n: item.skus[0].stock }) }}</span>
              </span>
            </div>
          </div>
          <p v-else-if="item.skuLocked && item.selectedSkuText" class="item-sku-locked">
            {{ $t('checkout.sku') }}：{{ item.selectedSkuText }}
            <span v-if="getLockedSkuStock(item) === 0" class="item-sku-locked__soldout">{{ $t('checkout.soldOut') }}</span>
            <span v-else-if="getLockedSkuStock(item) > 0" class="item-sku-locked__stock">{{ $t('checkout.stock', { n: getLockedSkuStock(item) }) }}</span>
          </p>

          <!-- Quantity -->
          <div v-if="!item.isPointOrder" class="qty-row">
            <span class="qty-label">{{ $t('checkout.quantity') }}</span>
            <div class="qty-controls">
              <button type="button" class="qty-btn" :disabled="item.quantity <= 1" @click="updateItemQuantity(item.id, item.quantity - 1)">−</button>
              <span class="qty-value">{{ item.quantity }}</span>
              <button type="button" class="qty-btn" @click="updateItemQuantity(item.id, item.quantity + 1)">+</button>
            </div>
          </div>
          <div v-else class="qty-row qty-row--fixed">
            <span class="qty-label">{{ $t('checkout.exchangeQuantity') }}</span>
            <span class="qty-value">1</span>
          </div>

          <!-- Sale time -->
          <p v-if="item.saleTime && item.saleTime * 1000 > Date.now()" class="item-sale-time">
            {{ $t('checkout.saleTime') }}: {{ formatSaleTime(item.saleTime) }}
          </p>
        </template>
      </div>
    </TransitionGroup>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  isPointOrder: { type: Boolean, default: false },
  items: { type: Array, required: true },
  cookie: { type: String, default: '' },
  searchKeyword: { type: String, default: '' },
  searchResults: { type: Array, default: () => [] },
  searching: { type: Boolean, default: false },
  searchError: { type: String, default: '' },
  pointBalance: { type: Number, default: 0 },
  pointLoading: { type: Boolean, default: false },
  pointError: { type: String, default: '' },
  activePointShopCode: { type: String, default: 'all' },
  pointShopOptions: { type: Array, default: () => [] },
  visiblePointGoods: { type: Array, default: () => [] },
  pointSelectingId: { type: String, default: '' },
  formatFen: { type: Function, required: true },
  formatSaleTime: { type: Function, required: true },
  handleSearch: { type: Function, required: true },
  addItemFromSearch: { type: Function, required: true },
  loadPointGoods: { type: Function, required: true },
  pointShopLabel: { type: Function, required: true },
  isPointGoodsAffordable: { type: Function, required: true },
  selectPointGoods: { type: Function, required: true },
  removeItem: { type: Function, required: true },
  updateItemSku: { type: Function, required: true },
  updateItemQuantity: { type: Function, required: true },
  getItemCover: { type: Function, required: true },
  getItemUnitPrice: { type: Function, required: true },
  getLockedSkuStock: { type: Function, required: true },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
const emit = defineEmits(['update:searchKeyword', 'set-order-mode', 'update:activePointShopCode', 'open-cart-picker'])

const keywordModel = computed({
  get: () => props.searchKeyword,
  set: (val) => emit('update:searchKeyword', val),
})
</script>

<style src="@/views/checkout-shared.css"></style>
<style scoped>
/* ── 订单类型与积分兑换 ── */
.checkout-mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  margin-bottom: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.checkout-mode-switch__item {
  min-height: 40px;
  border: 0;
  border-radius: calc(var(--radius-small) - 2px);
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.checkout-mode-switch__item--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
}

.points-panel {
  padding: 14px;
  margin-bottom: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.points-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.points-panel__label {
  margin: 0 0 3px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.points-panel__balance {
  margin: 0;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
}

.points-panel__balance span,
.points-card__cost,
.points-card__status {
  font-size: 12px;
  font-weight: 500;
}

.points-panel__refresh {
  padding: 7px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.points-panel__refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.points-tabs {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 12px;
  scrollbar-width: none;
}

.points-tabs::-webkit-scrollbar {
  display: none;
}

.points-tab {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.points-tab--active {
  border-color: color-mix(in srgb, #4a7aec 55%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 11%, var(--app-surface));
  color: #2070c0;
}

.points-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.points-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  grid-template-rows: auto auto auto auto;
  column-gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, opacity 0.16s ease, transform 0.12s ease;
}

.points-card:not(:disabled):active {
  transform: scale(0.98);
}

.points-card--selected {
  border-color: color-mix(in srgb, #4a7aec 70%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 10%, var(--app-surface));
}

.points-card--soldout,
.points-card--unaffordable {
  opacity: 0.5;
  cursor: not-allowed;
}

.points-card__image {
  grid-row: 1 / -1;
  grid-column: 1;
  width: 100%;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  background: var(--app-surface-soft);
}

.points-card__image--fallback {
  display: grid;
  place-items: center;
  color: var(--app-text-tertiary);
  font-size: 24px;
}

.points-card__name {
  grid-row: 1;
  grid-column: 2;
  display: -webkit-box;
  min-height: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.5;
}

.points-card__cost {
  grid-row: 2;
  grid-column: 2;
  margin-top: 4px;
  color: #c97918;
}

.points-card__cash {
  grid-row: 3;
  grid-column: 2;
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.points-card__status {
  grid-row: 4;
  grid-column: 2;
  margin-top: 2px;
  color: var(--app-text-tertiary);
}

.points-panel__hint {
  margin: 10px 2px 0;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.points-panel__loading {
  min-height: 100px;
}

@media (min-width: 900px) {
  .points-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .points-card {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .points-card__image {
    height: 64px;
  }
}

/* ── 商品搜索 ── */
.search-row {
  display: flex;
  gap: 10px;
}

.search-input {
  flex: 1;
  min-width: 0;
  min-height: 46px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  padding: 0 14px;
  outline: none;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.search-input:focus {
  border-color: rgba(20, 20, 22, 0.16);
  background: var(--app-surface);
}

.search-btn {
  flex-shrink: 0;
  min-width: 80px;
  min-height: 46px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.12s ease;
}

.search-btn:not(:disabled):active {
  transform: scale(0.96);
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.search-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.search-result-row:active {
  background: var(--app-surface-soft);
}

.search-result-thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  background: var(--app-surface-soft);
}

.search-result-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 从购物车选择入口 ── */
.cart-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.16s ease, transform 0.12s ease;
}

.cart-entry > svg:first-child {
  width: 18px;
  height: 18px;
  stroke: #2070c0;
}

.cart-entry__arrow {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--app-text-tertiary);
  margin-left: auto;
}

.cart-entry:active {
  transform: scale(0.98);
  background: var(--app-surface-muted);
}

:global(html.theme-dark) .search-input {
  border-color: rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

:global(html.theme-dark) .search-input:focus {
  border-color: rgba(255, 255, 255, 0.12);
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
}

:global(html.theme-dark) .search-result-row {
  border-color: rgba(255, 255, 255, 0.08);
}

/* ── 商品列表 ── */
.checkout-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkout-item {
  gap: 12px;
}

.item-loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.item-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.item-cover {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  background: var(--app-surface-soft);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-remove {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(199, 68, 68, 0.08);
  color: #c74444;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease;
}

.item-remove svg {
  width: 15px;
  height: 15px;
}

.item-remove:active {
  transform: scale(0.92);
  background: rgba(199, 68, 68, 0.16);
}

.item-price {
  margin-top: 4px;
  font-size: 15px;
  color: #2070c0;
  font-weight: 600;
}

.item-error {
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  background: rgba(199, 68, 68, 0.06);
  color: #c74444;
  font-size: 13px;
}

/* ── SKU ── */
.sku-section {
  margin-top: 2px;
}

.sku-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin-bottom: 8px;
}

.item-sku-locked {
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-sku-locked__soldout {
  font-size: 11px;
  color: #c74444;
}

.item-sku-locked__stock {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.sku-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sku-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  font-size: 13px;
  color: var(--app-text);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.sku-chip:not(:disabled):active {
  transform: scale(0.96);
}

.sku-chip--selected {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 12%, var(--app-surface));
  color: #2070c0;
  font-weight: 500;
}

.sku-chip--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sku-chip__soldout {
  font-size: 11px;
  color: #c74444;
}

.sku-chip__stock {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

:global(html.theme-dark) .sku-chip {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .sku-chip--selected {
  border-color: rgba(109, 157, 255, 0.72);
  background: color-mix(in srgb, #4a7aec 16%, var(--app-surface));
  color: #a9c5ff;
}

/* ── 数量 ── */
.qty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qty-label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.qty-controls {
  display: flex;
  align-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.qty-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.qty-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.qty-btn:active:not(:disabled) {
  background: var(--app-surface-muted);
}

.qty-value {
  width: 40px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text);
  border-left: 1px solid var(--app-border);
  border-right: 1px solid var(--app-border);
  line-height: 34px;
}

.item-sale-time {
  margin-top: 2px;
  font-size: 12px;
  color: #c77700;
}

/* ── 过渡 ── */
.goods-expand-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.goods-expand-leave-active {
  transition: opacity 0.18s ease;
}

.goods-expand-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.goods-expand-leave-to {
  opacity: 0;
}
</style>