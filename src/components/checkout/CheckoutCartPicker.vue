<template>
  <Popup
    :show="show"
    :position="position"
    :round="!isTabletViewport"
    :lock-scroll="false"
    :class="['picker-popup', { 'picker-popup--center': isTabletViewport }]"
    @update:show="$emit('update:show', $event)"
  >
    <div class="cart-picker">
      <p class="cart-picker__title">{{ $t('checkout.fromCart') }}</p>

      <div v-if="cartLoading" class="loading-state">
        <div class="parse-spinner" />
        <p class="loading-text">{{ $t('checkout.loadingCart') }}</p>
      </div>
      <p v-else-if="cartError" class="step-error cart-picker__error">{{ cartError }}</p>
      <p v-else-if="!cartItems.length" class="empty-hint cart-picker__empty">{{ $t('checkout.cartEmpty') }}</p>
      <ul v-else class="cart-picker__list">
        <li
          v-for="item in cartItems"
          :key="item.key"
          class="cart-picker-item"
          :class="{ 'cart-picker-item--selected': cartSelected.has(item.key), 'cart-picker-item--soldout': item.soldOut }"
          @click="toggleCartItem(item.key)"
        >
          <img v-if="item.cover" :src="item.cover" class="cart-picker-item__thumb" loading="lazy" />
          <span v-else class="cart-picker-item__thumb cart-picker-item__thumb--fallback">{{ (item.name || '?').charAt(0) }}</span>
          <div class="cart-picker-item__body">
            <p class="cart-picker-item__name">{{ item.name }}</p>
            <p v-if="item.skuText" class="cart-picker-item__sku">{{ item.skuText }}</p>
          </div>
          <span v-if="item.soldOut" class="cart-picker-item__soldout-tag">{{ $t('checkout.soldOut') }}</span>
          <span v-else class="cart-picker-item__check">
            <svg v-if="cartSelected.has(item.key)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        </li>
      </ul>

      <div class="cart-picker__actions">
        <button class="cart-picker-btn cart-picker-btn--cancel" type="button" @click="$emit('update:show', false)">
          {{ $t('common.cancel') }}
        </button>
        <button
          class="cart-picker-btn cart-picker-btn--confirm"
          type="button"
          :disabled="!cartSelected.size || cartAdding"
          @click="handleAddFromCart"
        >
          <span v-if="cartAdding" class="parse-spinner" />
          {{ $t('checkout.addSelected', { n: cartSelected.size }) }}
        </button>
      </div>
    </div>
  </Popup>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Popup } from 'vant'
import { fetchCartList } from '@/utils/mihoyo/index'

const props = defineProps({
  show: { type: Boolean, default: false },
  position: { type: String, default: 'bottom' },
  isTabletViewport: { type: Boolean, default: false },
  cookie: { type: String, default: '' },
  addItemsFromCart: { type: Function, required: true },
})
const emit = defineEmits(['update:show', 'added'])

const cartLoading = ref(false)
const cartError = ref('')
const cartItems = ref([])
const cartSelected = ref(new Set())
const cartAdding = ref(false)

watch(() => props.show, (open) => {
  if (open && !cartItems.value.length && !cartLoading.value) {
    loadCartItems()
  }
})

async function loadCartItems() {
  cartLoading.value = true
  cartError.value = ''
  try {
    const shops = await fetchCartList(props.cookie)
    cartItems.value = flattenCart(shops)
  } catch (e) {
    cartError.value = e.message || '加载购物车失败'
  } finally {
    cartLoading.value = false
  }
}

function flattenCart(shops) {
  const result = []
  for (const shop of shops) {
    const shopCode = shop?.shop_code || ''
    for (const item of (shop?.list || [])) {
      const goodsId = String(item.goods_id || item.goodsId || '')
      if (!goodsId) continue
      result.push({
        key: `${shopCode}_${goodsId}_${item.sku_id ?? ''}`,
        goodsId,
        skuId: item.sku_id != null ? Number(item.sku_id) : null,
        shopCode,
        name: item.goods_name || item.name || '',
        cover: item.cover_url || '',
        skuText: item.sale_attr_val || item.sku_text || '',
        price: Number(item.new_price_fee ?? item.price_fee ?? item.old_price_fee ?? 0) || 0,
        quantity: Math.max(1, Number(item.nums) || Number(item.quantity_buy) || 1),
        soldOut: Number(item.sold_out_status || 0) !== 0,
      })
    }
  }
  return result
}

function toggleCartItem(key) {
  const item = cartItems.value.find((i) => i.key === key)
  if (item?.soldOut) return
  const next = new Set(cartSelected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  cartSelected.value = next
}

function handleAddFromCart() {
  if (!cartSelected.value.size || cartAdding.value) return
  cartAdding.value = true
  const selected = cartItems.value.filter((i) => cartSelected.value.has(i.key))
  const added = props.addItemsFromCart(selected, props.cookie)
  cartAdding.value = false
  cartSelected.value = new Set()
  emit('added', added)
  emit('update:show', false)
}
</script>

<style scoped>
/* ── 购物车选择面板 ── */
.cart-picker {
  display: flex;
  flex-direction: column;
  max-height: 75dvh;
  padding: 16px 20px calc(env(safe-area-inset-bottom, 0px) + 16px);
}

.cart-picker__title {
  font-size: 17px;
  font-weight: 700;
  color: var(--app-text);
  text-align: center;
  margin-bottom: 14px;
}

.cart-picker__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.cart-picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.cart-picker-item--selected {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 8%, var(--app-surface));
}

.cart-picker-item--soldout {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.cart-picker-item__soldout-tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-danger, #e74c3c);
  border: 1px solid var(--app-danger, #e74c3c);
  border-radius: 4px;
  padding: 1px 6px;
  line-height: 1.4;
}

.cart-picker-item__thumb {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.cart-picker-item__body {
  flex: 1;
  min-width: 0;
}

.cart-picker-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-picker-item__sku {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-picker-item__check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--app-text-tertiary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.16s ease;
}

.cart-picker-item--selected .cart-picker-item__check {
  border-color: #2070c0;
  background: #2070c0;
}

.cart-picker-item__check svg {
  width: 14px;
  height: 14px;
  stroke: #fff;
}

.cart-picker__actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-shrink: 0;
}

.cart-picker-btn {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: var(--radius-small);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.12s ease;
}

.cart-picker-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.cart-picker-btn--cancel {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.cart-picker-btn--confirm {
  background: var(--app-text);
  color: var(--app-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cart-picker-btn--confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cart-picker-btn--confirm .parse-spinner {
  width: 16px;
  height: 16px;
  border-color: color-mix(in srgb, currentColor 35%, transparent);
  border-top-color: currentColor;
}

.cart-picker__error {
  margin-bottom: 12px;
}

.cart-picker__empty {
  padding: 24px 0;
}

.cart-picker .loading-state {
  min-height: 120px;
}
</style>