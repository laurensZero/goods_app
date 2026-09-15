<template>
  <div class="page arrivals-page" :class="{ 'arrivals-page--tablet': isTabletViewport }">
    <NavBar :title="t('nav.mihoyoNewArrivals')" show-back />

    <main class="page-body">
      <section class="toolbar">
        <div class="toolbar__row">
          <div class="catalog-tabs" role="tablist" :aria-label="t('mihoyoNew.catalogLabel')">
            <button
              v-for="tab in CATALOG_TABS"
              :key="tab.value"
              type="button"
              class="catalog-tab"
              :class="{ 'catalog-tab--active': activeCatalog === tab.value }"
              role="tab"
              :aria-selected="activeCatalog === tab.value"
              @click="switchCatalog(tab.value)"
            >
              <span class="catalog-tab__dot" :class="`catalog-tab__dot--${tab.value}`" />
              {{ t(tab.labelKey) }}
            </button>
          </div>

          <button
            class="refresh-btn"
            type="button"
            :disabled="loading"
            :aria-label="t('mihoyoNew.refresh')"
            @click="reload"
          >
            <svg v-if="loading" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
        </div>

        <div class="shop-filters" :aria-label="t('mihoyoNew.shopFilter')">
          <button
            type="button"
            class="shop-chip"
            :class="{ 'shop-chip--active': activeShop === '' }"
            @click="setShop('')"
          >
            {{ t('mihoyoNew.allShops') }}
          </button>
          <button
            v-for="shop in SHOPS"
            :key="shop.code"
            type="button"
            class="shop-chip"
            :class="{ 'shop-chip--active': activeShop === shop.code }"
            @click="setShop(shop.code)"
          >
            {{ t(shop.labelKey) }}
          </button>
        </div>
      </section>

      <section v-if="loadError" class="state-card state-card--empty">
        <span class="state-card__icon state-card__icon--danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" />
            <path d="M12 16h.01" />
          </svg>
        </span>
        <h2 class="state-card__title">{{ loadError }}</h2>
        <button class="primary-btn" type="button" @click="reload">{{ t('mihoyoNew.retry') }}</button>
      </section>

      <section v-else-if="loading && filteredItems.length === 0" class="list-panel list-panel--skeleton">
        <GoodsListSkeleton />
      </section>

      <section v-else-if="filteredItems.length === 0" class="state-card state-card--empty">
        <span class="state-card__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
        </span>
        <h2 class="state-card__title">{{ t('mihoyoNew.emptyTitle') }}</h2>
        <p class="state-card__desc">{{ t('mihoyoNew.emptyDesc') }}</p>
      </section>

      <!-- 满赠页签 -->
      <section v-if="!loadError && activeCatalog === 'gift'" class="list-section">
        <div class="list-section__head">
          <span class="list-section__dot list-section__dot--gift" />
          <h2 class="list-section__title">{{ t('mihoyoNew.giftSectionTitle') }}</h2>
          <span class="list-section__count">{{ giftItems.length }}</span>
        </div>
        <div v-if="giftItems.length" class="list-panel">
          <div class="goods-grid">
            <article
              v-for="item in giftItems"
              :key="item.goods_id"
              class="goods-card"
            >
              <button type="button" class="goods-card__main" @click="openSkuSheet(item)">
                <span class="goods-card__media">
                  <img
                    v-if="item.cover_url"
                    :src="item.cover_url"
                    :alt="item.name"
                    loading="lazy"
                  />
                  <span v-else class="goods-card__media-fallback">{{ (displayName(item.name) || '谷').charAt(0) }}</span>
                  <span class="goods-card__badges">
                    <span v-if="wishlistBadgeText(item)" class="goods-card__wished">
                      {{ wishlistBadgeText(item) }}
                    </span>
                    <span v-if="ownedBadgeText(item)" class="goods-card__owned">
                      {{ ownedBadgeText(item) }}
                    </span>
                  </span>
                  <span class="goods-card__gift">{{ t('mihoyoNew.giftBadge') }}</span>
                </span>
                <span class="goods-card__body">
                  <span class="goods-card__shop">{{ shopLabel(item.shop_code) }}</span>
                  <span class="goods-card__name">{{ displayName(item.name) || t('mihoyoNew.unnamed') }}</span>
                </span>
              </button>
            </article>
          </div>
        </div>
      </section>

      <!-- 商品上新：未上架 -->
      <section v-if="!loadError && activeCatalog === 'shop' && upcomingItems.length > 0" class="list-section">
        <div class="list-section__head">
          <span class="list-section__dot list-section__dot--upcoming" />
          <h2 class="list-section__title">{{ t('mihoyoNew.upcomingSectionTitle') }}</h2>
          <span class="list-section__count">{{ upcomingItems.length }}</span>
        </div>
        <div class="list-panel">
          <div class="goods-grid">
            <article
              v-for="item in upcomingItems"
              :key="item.goods_id"
              class="goods-card"
            >
              <button type="button" class="goods-card__main" @click="openSkuSheet(item)">
                <span class="goods-card__media">
                  <img
                    v-if="item.cover_url"
                    :src="item.cover_url"
                    :alt="item.name"
                    loading="lazy"
                  />
                  <span v-else class="goods-card__media-fallback">{{ (displayName(item.name) || '谷').charAt(0) }}</span>
                  <span class="goods-card__badges">
                    <span v-if="wishlistBadgeText(item)" class="goods-card__wished">
                      {{ wishlistBadgeText(item) }}
                    </span>
                    <span v-if="ownedBadgeText(item)" class="goods-card__owned">
                      {{ ownedBadgeText(item) }}
                    </span>
                  </span>
                  <span v-if="item.is_new" class="goods-card__cloud-new">
                    {{ t('mihoyoNew.cloudNew') }}
                  </span>
                </span>
                <span class="goods-card__body">
                  <span class="goods-card__shop">{{ shopLabel(item.shop_code) }}</span>
                  <span class="goods-card__name">{{ displayName(item.name) || t('mihoyoNew.unnamed') }}</span>
                  <span class="goods-card__foot">
                    <span v-if="item.catalog === 'point'" class="price price--point">
                      {{ item.point }}{{ t('mihoyoNew.pointUnit') }}
                      <template v-if="item.price_cents > 0">
                        +{{ formatYuan(item.price_cents) }}{{ t('mihoyoNew.priceUnit') }}
                      </template>
                    </span>
                    <span v-else-if="item.price_cents > 0" class="price">
                      {{ formatYuan(item.price_cents) }}{{ t('mihoyoNew.priceUnit') }}
                    </span>
                  </span>
                </span>
              </button>
            </article>
          </div>
        </div>
      </section>

      <!-- 商品上新：已上架（保留 7 天内） -->
      <section v-if="!loadError && activeCatalog === 'shop' && releasedItems.length > 0" class="list-section">
        <div class="list-section__head">
          <span class="list-section__dot list-section__dot--released" />
          <h2 class="list-section__title">{{ t('mihoyoNew.releasedSectionTitle') }}</h2>
          <span class="list-section__count">{{ releasedItems.length }}</span>
        </div>
        <div class="list-panel">
          <div class="goods-grid">
            <article
              v-for="item in releasedItems"
              :key="item.goods_id"
              class="goods-card"
            >
              <button type="button" class="goods-card__main" @click="openSkuSheet(item)">
                <span class="goods-card__media">
                  <img
                    v-if="item.cover_url"
                    :src="item.cover_url"
                    :alt="item.name"
                    loading="lazy"
                  />
                  <span v-else class="goods-card__media-fallback">{{ (displayName(item.name) || '谷').charAt(0) }}</span>
                  <span class="goods-card__badges">
                    <span v-if="wishlistBadgeText(item)" class="goods-card__wished">
                      {{ wishlistBadgeText(item) }}
                    </span>
                    <span v-if="ownedBadgeText(item)" class="goods-card__owned">
                      {{ ownedBadgeText(item) }}
                    </span>
                  </span>
                  <span class="goods-card__released">{{ t('mihoyoNew.releasedBadge') }}</span>
                </span>
                <span class="goods-card__body">
                  <span class="goods-card__shop">{{ shopLabel(item.shop_code) }}</span>
                  <span class="goods-card__name">{{ displayName(item.name) || t('mihoyoNew.unnamed') }}</span>
                  <span class="goods-card__foot">
                    <span v-if="item.catalog === 'point'" class="price price--point">
                      {{ item.point }}{{ t('mihoyoNew.pointUnit') }}
                      <template v-if="item.price_cents > 0">
                        +{{ formatYuan(item.price_cents) }}{{ t('mihoyoNew.priceUnit') }}
                      </template>
                    </span>
                    <span v-else-if="item.price_cents > 0" class="price">
                      {{ formatYuan(item.price_cents) }}{{ t('mihoyoNew.priceUnit') }}
                    </span>
                  </span>
                </span>
              </button>
            </article>
          </div>
        </div>
      </section>

      <!-- 积分兑换 -->
      <section v-if="!loadError && activeCatalog === 'point' && pointItems.length > 0" class="list-section">
        <div class="list-section__head">
          <span class="list-section__dot list-section__dot--point" />
          <h2 class="list-section__title">{{ t('mihoyoNew.tabPoint') }}</h2>
          <span class="list-section__count">{{ pointItems.length }}</span>
        </div>
        <div class="list-panel">
          <div class="goods-grid">
            <article
              v-for="item in pointItems"
              :key="item.goods_id"
              class="goods-card"
            >
            <button type="button" class="goods-card__main" @click="openSkuSheet(item)">
              <span class="goods-card__media">
                <img
                  v-if="item.cover_url"
                  :src="item.cover_url"
                  :alt="item.name"
                  loading="lazy"
                />
                <span v-else class="goods-card__media-fallback">{{ (displayName(item.name) || '谷').charAt(0) }}</span>
                <span class="goods-card__badges">
                  <span v-if="wishlistBadgeText(item)" class="goods-card__wished">
                    {{ wishlistBadgeText(item) }}
                  </span>
                  <span v-if="ownedBadgeText(item)" class="goods-card__owned">
                    {{ ownedBadgeText(item) }}
                  </span>
                </span>
              </span>
              <span class="goods-card__body">
                <span class="goods-card__shop">{{ shopLabel(item.shop_code) }}</span>
                <span class="goods-card__name">{{ displayName(item.name) || t('mihoyoNew.unnamed') }}</span>
                <span class="goods-card__foot">
                  <span class="price price--point">
                    {{ item.point }}{{ t('mihoyoNew.pointUnit') }}
                    <template v-if="item.price_cents > 0">
                      +{{ formatYuan(item.price_cents) }}{{ t('mihoyoNew.priceUnit') }}
                    </template>
                  </span>
                  <span v-if="saleTimeText(item.sale_time)" class="sale-time">
                    {{ saleTimeText(item.sale_time) }}
                  </span>
                </span>
              </span>
            </button>
          </article>
        </div>
        </div>
      </section>

      <p v-if="partialErrorText" class="partial-note">{{ partialErrorText }}</p>
      <p class="arrivals-note">{{ t('mihoyoNew.note') }}</p>
    </main>

    <AppSheet
      v-model="sheetOpen"
      size="wide"
      sheet-class="arrival-sku-sheet"
      @update:model-value="(v) => { if (!v) closeSkuSheet() }"
    >
      <div v-if="activeItem" class="sku-sheet">
        <div class="sku-sheet__hero">
          <div class="sku-sheet__product">
            <span class="sku-sheet__thumb">
              <img
                v-if="previewCover"
                :src="previewCover"
                :alt="activeItem.name"
                loading="lazy"
              />
              <span v-else>{{ (displayName(activeItem.name) || '谷').charAt(0) }}</span>
            </span>
            <div class="sku-sheet__info">
              <p class="sku-sheet__shop">{{ shopLabel(activeItem.shop_code) }}</p>
              <h2 class="sku-sheet__name">{{ displayName(activeItem.name) || t('mihoyoNew.unnamed') }}</h2>
              <p v-if="selectedSku?.text" class="sku-sheet__selected">
                {{ t('mihoyoNew.selectedSku', { name: displaySkuText(selectedSku.text) }) }}
              </p>
              <p class="sku-sheet__meta">
                <span v-if="activeItem.catalog === 'point'" class="price price--point">
                  {{ activeItem.point }}{{ t('mihoyoNew.pointUnit') }}
                  <template v-if="sheetMoneyText"> +{{ sheetMoneyText }}</template>
                </span>
                <span v-else-if="sheetMoneyText" class="price" :class="{ 'price--range': sheetHasPriceRange }">
                  {{ sheetMoneyText }}
                </span>
                <span v-if="saleTimeText(activeItem.sale_time)" class="sale-time">
                  {{ saleTimeText(activeItem.sale_time) }}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div class="sku-sheet__picker">
          <p class="sku-sheet__hint">{{ selectedSku ? t('mihoyoNew.skuConfirmHint') : t('mihoyoNew.skuHint') }}</p>

          <div v-if="sheetDetail?.loading" class="sku-sheet__loading">
            <span class="spinner" />
            <span>{{ t('mihoyoNew.loadingSku') }}</span>
          </div>

          <div v-else-if="sheetDetail?.error" class="sku-sheet__error">
            <p>{{ sheetDetail.error }}</p>
            <button type="button" class="ghost-btn" @click="loadVariants(activeItem)">
              {{ t('mihoyoNew.retry') }}
            </button>
          </div>

          <template v-else-if="activeItem">
            <div v-if="sheetVariants.length" class="sku-chips">
              <button
                v-for="sku in sheetVariants"
                :key="sku.key"
                type="button"
                class="sku-chip"
                :class="{
                  'sku-chip--selected': selectedSku?.key === sku.key,
                  'sku-chip--wished': isSkuInWishlist(activeItem?.goods_id, sku),
                }"
                @click="selectSku(sku)"
              >
                <span v-if="sku.cover_url" class="sku-chip__thumb">
                  <img :src="sku.cover_url" :alt="sku.text" loading="lazy" />
                </span>
                <span class="sku-chip__main">
                  <span class="sku-chip__text">{{ sku.text }}</span>
                  <span v-if="sheetHasPriceRange && sku.price != null" class="sku-chip__price">
                    {{ formatYuanValue(sku.price) }}{{ t('mihoyoNew.priceUnit') }}
                  </span>
                </span>
                <span class="sku-chip__flags">
                  <span v-if="isSkuInWishlist(activeItem?.goods_id, sku)" class="sku-chip__wished">
                    {{ t('mihoyoNew.skuWished') }}
                  </span>
                  <span v-if="isSkuOwned(activeItem?.goods_id, sku)" class="sku-chip__owned">
                    {{ t('mihoyoNew.skuOwned') }}
                  </span>
                </span>
                <span class="sku-chip__check">
                  <svg v-if="selectedSku?.key === sku.key" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </button>
            </div>
            <p v-else class="sku-sheet__empty">{{ t('mihoyoNew.noSku') }}</p>
          </template>
        </div>

        <div v-if="activeItem && !sheetDetail?.loading && !sheetDetail?.error" class="sku-sheet__actions">
          <button
            type="button"
            class="confirm-btn"
            :disabled="adding || selectedSkuAlreadyWished"
            @click="confirmAddToWishlist"
          >
            <svg v-if="adding" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </svg>
            <span v-if="selectedSkuAlreadyWished">{{ t('mihoyoNew.skuAlreadyWished') }}</span>
            <span v-else>{{ selectedSku ? t('mihoyoNew.confirmAddSku') : t('mihoyoNew.addWhole') }}</span>
          </button>

          <button type="button" class="sheet-cancel" @click="closeSkuSheet">
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </AppSheet>

    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import AppToast from '@/components/common/AppToast.vue'
import GoodsListSkeleton from '@/components/common/GoodsListSkeleton.vue'
import { useToast } from '@/composables/useToast'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { useGoodsStore } from '@/stores/goods'
import {
  MIHOYO_NEW_ARRIVAL_SHOPS,
  fetchMihoyoNewArrivals,
  fetchMihoyoGiftArrivals,
} from '@/utils/mihoyo/newArrivals'
import { fetchGoodsDetail, parseTitleIpName, parseCategoryFromName, cleanGoodsName } from '@/utils/mihoyo'
import { resolveMihoyoImportDraft } from '@/utils/mihoyo/importResolver'
import { normalizeGoodsVariant, getGoodsVariant } from '@/utils/goods/identity'
import { normalizeCharacterName, isLikelyCharName } from '@/utils/variantText'

defineOptions({ name: 'MihoyoNewArrivalsView' })

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const { isTabletViewport, updateViewport } = useTabletViewport()
const goodsStore = useGoodsStore()

const CATALOG_TABS = [
  { value: 'shop', labelKey: 'mihoyoNew.tabShop' },
  { value: 'point', labelKey: 'mihoyoNew.tabPoint' },
  { value: 'gift', labelKey: 'mihoyoNew.tabGift' },
]

const SHOPS = [
  { code: 'ys', labelKey: 'mihoyoNew.shopYs' },
  { code: 'xqtd', labelKey: 'mihoyoNew.shopXqtd' },
  { code: 'bh3', labelKey: 'mihoyoNew.shopBh3' },
  { code: 'zzz', labelKey: 'mihoyoNew.shopZzz' },
]

const activeCatalog = ref('shop')
const activeShop = ref('')
const loading = ref(false)
const loadError = ref('')
const partialShops = ref([])
const itemsByCatalog = reactive({ shop: [], point: [], gift: [] })
const loadedCatalogs = reactive({ shop: false, point: false, gift: false })
const sheetOpen = ref(false)
const activeItem = ref(null)
const selectedSku = ref(null)
const itemDetailMap = reactive({})
const adding = ref(false)

const filteredItems = computed(() => {
  const list = itemsByCatalog[activeCatalog.value] || []
  if (!activeShop.value) return list
  return list.filter((item) => !item.shop_code || item.shop_code === activeShop.value)
})

const giftItems = computed(() =>
  activeCatalog.value === 'gift' ? filteredItems.value : [],
)

/** sale_time 为北京墙钟 unix 秒，+8h 得真实开售 UTC；已过开售时刻 = 已上架 */
function isReleasedItem(item) {
  const saleSec = Number(item?.sale_time) || 0
  if (!saleSec) return false
  const saleMs = saleSec * 1000 + 8 * 3600_000
  return saleMs <= Date.now()
}

const shopMainItems = computed(() =>
  activeCatalog.value === 'shop' ? filteredItems.value.filter((item) => !item.is_gift) : [],
)
const upcomingItems = computed(() => shopMainItems.value.filter((item) => !isReleasedItem(item)))
const releasedItems = computed(() => shopMainItems.value.filter((item) => isReleasedItem(item)))
const pointItems = computed(() =>
  activeCatalog.value === 'point' ? filteredItems.value.filter((item) => !item.is_gift) : [],
)

/** 展示用商品名：去掉【预售】等营销/状态标签 */
function displayName(text) {
  const cleaned = cleanGoodsName(text)
  return cleaned || String(text || '').trim()
}

/** 展示用 SKU：去掉【预售】等后缀 */
function displaySkuText(text) {
  const cleaned = normalizeGoodsVariant(text)
  return cleaned || String(text || '').trim()
}

/** 比对用：去掉【预售】等后缀，避免同一款因文案差被当成两套 */
function variantKey(text) {
  return normalizeGoodsVariant(text) || String(text || '').trim()
}

/** goodsId -> { variants: Set<规范款式>, hasWhole: boolean, count: 款式数 } */
function buildGoodsIdVariantMap(filterFn) {
  const map = new Map()
  for (const item of goodsStore.list) {
    if (!filterFn(item) || !item.goodsId) continue
    const id = String(item.goodsId)
    if (!map.has(id)) {
      map.set(id, { variants: new Set(), hasWhole: false, count: 0 })
    }
    const slot = map.get(id)
    // 优先用 normalize 后的 variant；兼容角色拼接的旧数据
    const raw = String(item.variant || item.style || '').trim()
    const key = variantKey(raw) || variantKey(getGoodsVariant(item))
    if (!key) {
      slot.hasWhole = true
      continue
    }
    if (!slot.variants.has(key)) {
      slot.variants.add(key)
      slot.count += 1
    }
  }
  return map
}

const wishlistByGoodsId = computed(() =>
  buildGoodsIdVariantMap((item) => Boolean(item?.isWishlist)),
)
const ownedByGoodsId = computed(() =>
  buildGoodsIdVariantMap((item) => !item?.isWishlist),
)

function wishlistBadgeText(item) {
  const slot = wishlistByGoodsId.value.get(String(item?.goods_id || ''))
  if (!slot) return ''
  if (slot.count > 0) return t('mihoyoNew.inWishlistCount', { count: slot.count })
  if (slot.hasWhole) return t('mihoyoNew.inWishlist')
  return ''
}

function ownedBadgeText(item) {
  const slot = ownedByGoodsId.value.get(String(item?.goods_id || ''))
  if (!slot) return ''
  if (slot.count > 0) return t('mihoyoNew.inOwnedCount', { count: slot.count })
  if (slot.hasWhole) return t('mihoyoNew.inOwned')
  return ''
}

function isSkuInWishlist(goodsId, sku) {
  const slot = wishlistByGoodsId.value.get(String(goodsId || ''))
  if (!slot || !sku?.text) return false
  const key = variantKey(sku.text)
  if (!key) return false
  return slot.variants.has(key)
}

function isSkuOwned(goodsId, sku) {
  const slot = ownedByGoodsId.value.get(String(goodsId || ''))
  if (!slot || !sku?.text) return false
  const key = variantKey(sku.text)
  if (!key) return false
  return slot.variants.has(key)
}

const selectedSkuAlreadyWished = computed(() => {
  if (!selectedSku.value || !activeItem.value) return false
  return isSkuInWishlist(activeItem.value.goods_id, selectedSku.value)
})

const partialErrorText = computed(() => {
  if (!partialShops.value.length) return ''
  const names = partialShops.value.map((code) => shopLabel(code)).join('、')
  return t('mihoyoNew.partialError', { shops: names })
})

const sheetDetail = computed(() => {
  if (!activeItem.value) return null
  return itemDetailMap[activeItem.value.goods_id] || null
})

const sheetVariants = computed(() => sheetDetail.value?.variants || [])

/** 已加载款式里的价格（元）；有价差时弹层顶部显示区间 */
const skuPriceRange = computed(() => {
  const prices = (sheetVariants.value || [])
    .map((sku) => {
      const price = Number(sku?.price)
      return Number.isFinite(price) && price > 0 ? price : null
    })
    .filter((price) => price != null)
  if (!prices.length) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return { min, max, hasRange: min !== max }
})

const sheetHasPriceRange = computed(() => Boolean(skuPriceRange.value?.hasRange))

const sheetMoneyText = computed(() => {
  const unit = t('mihoyoNew.priceUnit')
  const selectedPrice = Number(selectedSku.value?.price)
  if (selectedSku.value?.price != null && Number.isFinite(selectedPrice) && selectedPrice > 0) {
    return `${formatYuanValue(selectedPrice)}${unit}`
  }
  const range = skuPriceRange.value
  if (range?.hasRange) {
    return `${formatYuanValue(range.min)}~${formatYuanValue(range.max)}${unit}`
  }
  if (range) {
    return `${formatYuanValue(range.min)}${unit}`
  }
  if (activeItem.value?.price_cents > 0) {
    return `${formatYuan(activeItem.value.price_cents)}${unit}`
  }
  return ''
})

const previewCover = computed(() => {
  if (selectedSku.value?.cover_url) return selectedSku.value.cover_url
  if (sheetDetail.value?.coverUrl) return sheetDetail.value.coverUrl
  return activeItem.value?.cover_url || ''
})

useDialogBackButton(closeSkuSheet, sheetOpen)

function shopLabel(code) {
  const hit = SHOPS.find((s) => s.code === code)
  return hit ? t(hit.labelKey) : String(code || '')
}

function formatYuan(cents) {
  const yuan = (Number(cents) || 0) / 100
  return yuan % 1 === 0 ? yuan.toFixed(0) : yuan.toFixed(2)
}

/** SKU 价格单位已是元，不要再 ÷100 */
function formatYuanValue(yuan) {
  const n = Number(yuan) || 0
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
}

function saleTimeText(unixSec) {
  if (!unixSec) return ''
  const d = new Date(unixSec * 1000 + 8 * 3600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function ensureDetailSlot(goodsId) {
  if (!itemDetailMap[goodsId]) {
    itemDetailMap[goodsId] = {
      loading: false,
      loaded: false,
      error: '',
      variants: [],
      skuCharacters: [],
      coverUrl: '',
    }
  }
  return itemDetailMap[goodsId]
}

async function loadCatalog(catalog, { force = false } = {}) {
  if (loading.value) return
  if (loadedCatalogs[catalog] && !force && itemsByCatalog[catalog].length) return

  loading.value = true
  loadError.value = ''
  try {
    if (catalog === 'gift') {
      // 流式：第一个活动到就先显示，其余后台并入
      const { items, errors } = await fetchMihoyoGiftArrivals(
        MIHOYO_NEW_ARRIVAL_SHOPS,
        { limit: 30, maxPages: 1 },
        {
          onItems: (list) => {
            itemsByCatalog.gift = (list || []).filter((item) => item?.is_gift)
            loadedCatalogs.gift = true
            // 已有数据时立刻结束全屏 loading，避免挡住先到的结果
            if (itemsByCatalog.gift.length) loading.value = false
          },
        },
      )
      itemsByCatalog.gift = items.filter((item) => item?.is_gift)
      loadedCatalogs.gift = true
      partialShops.value = errors.map((e) => e.shopCode)
      if (!items.length && errors.length === MIHOYO_NEW_ARRIVAL_SHOPS.length) {
        loadError.value = errors[0]?.message || t('common.failed')
      }
      return
    }

    const { items, errors } = await fetchMihoyoNewArrivals(catalog, MIHOYO_NEW_ARRIVAL_SHOPS)
    itemsByCatalog[catalog] = items.filter((item) => !item?.is_gift)
    loadedCatalogs[catalog] = true
    partialShops.value = errors.map((e) => e.shopCode)
    if (!items.length && errors.length === MIHOYO_NEW_ARRIVAL_SHOPS.length) {
      loadError.value = errors[0]?.message || t('common.failed')
    }
  } catch (e) {
    loadError.value = e.message || t('common.failed')
  } finally {
    loading.value = false
  }
}

async function reload() {
  await loadCatalog(activeCatalog.value, { force: true })
}

function switchCatalog(catalog) {
  if (activeCatalog.value === catalog) return
  activeCatalog.value = catalog
  closeSkuSheet()
  loadError.value = ''
  partialShops.value = []
  void loadCatalog(catalog)
}

function setShop(code) {
  activeShop.value = code
}

function openSkuSheet(item) {
  if (!item?.goods_id) return
  activeItem.value = item
  selectedSku.value = null
  sheetOpen.value = true
  void loadVariants(item)
}

function closeSkuSheet() {
  sheetOpen.value = false
  activeItem.value = null
  selectedSku.value = null
}

function selectSku(sku) {
  if (!sku?.key) return
  selectedSku.value = selectedSku.value?.key === sku.key ? null : sku
}

async function loadVariants(item) {
  const slot = ensureDetailSlot(item.goods_id)
  if (slot.loading || (slot.loaded && !slot.error)) return
  slot.loading = true
  slot.error = ''
  try {
    const result = await fetchGoodsDetail(item.goods_id)
    if (!result.ok) {
      slot.error = t('mihoyoNew.skuLoadError')
      return
    }
    const productCover = String(result.coverUrl || item.cover_url || '')
    const skuPrices = result.skuPrices || {}
    slot.coverUrl = productCover
    slot.skuCharacters = Array.isArray(result.skuCharacters)
      ? result.skuCharacters.filter(Boolean)
      : []
    slot.variants = (result.skuVariants || [])
      .filter((v) => v && v.key)
      .map((v) => {
        const rawPrice = v.price ?? skuPrices[v.key]
        const price = rawPrice != null && Number(rawPrice) > 0 ? Number(rawPrice) : null
        const rawText = String(v.text || v.key)
        return {
          text: displaySkuText(rawText),
          key: String(v.key),
          cover_url: String(result.skuCovers?.[v.key] || v.cover_url || v.img_url || productCover),
          price,
        }
      })
    slot.loaded = true
  } catch (e) {
    slot.error = e.message || t('common.failed')
  } finally {
    slot.loading = false
  }
}

function buildWishlistPayload(item, sku = null) {
  const { ip: parsedIp, name: nameFromTitle } = parseTitleIpName(item.name)
  const name = cleanGoodsName(nameFromTitle || item.name)
  const variantText = normalizeGoodsVariant(sku?.text || '') || String(sku?.text || '').trim()
  const category = parseCategoryFromName(`${name} ${variantText}`)
  const cover = sku?.cover_url || itemDetailMap[item.goods_id]?.coverUrl || item.cover_url || ''
  const skuPriceYuan = sku?.price != null && Number(sku.price) > 0 ? Number(sku.price) : null
  const listPriceYuan = item.catalog === 'shop' && item.price_cents > 0
    ? item.price_cents / 100
    : null
  const priceYuan = skuPriceYuan ?? listPriceYuan
  const detail = itemDetailMap[item.goods_id]
  const ip = parsedIp || shopLabel(item.shop_code)

  const notes = []
  if (item.catalog === 'point' && item.point > 0) {
    notes.push(`${item.point}${t('mihoyoNew.pointUnit')}`)
  }
  // 款式只进 variant 字段，不写入备注

  // 与米游铺导入一致：skuCharacters / 款式 / 标签建议 解析角色
  const preferredRaw = sku?.text || ''
  const preferredCharacter = isLikelyCharName(normalizeCharacterName(preferredRaw))
    ? normalizeCharacterName(preferredRaw)
    : ''
  const draft = resolveMihoyoImportDraft(
    {
      name,
      ip,
      goodsId: String(item.goods_id || '').trim(),
      variant: variantText,
      category,
      image: cover,
      images: cover ? [cover] : [],
      price: priceYuan != null ? String(priceYuan) : '',
      notes: notes.join(' · '),
      source: t('mihoyoNew.source'),
      skuCharacters: detail?.skuCharacters || [],
      variants: detail?.variants || [],
      isWishlist: true,
    },
    { preferredCharacter },
  )

  return {
    name: draft.name || name,
    category: draft.category || category,
    ip: draft.ip || ip,
    characters: Array.isArray(draft.characters) ? draft.characters : [],
    goodsId: String(item.goods_id || '').trim(),
    variant: draft.variant || variantText,
    image: cover || draft.image || '',
    images: cover ? [cover] : (draft.images || []),
    price: priceYuan,
    points: item.catalog === 'point' ? item.point : undefined,
    saleAt: item.sale_time ? formatSaleAt(item.sale_time) : '',
    source: t('mihoyoNew.source'),
    notes: notes.join(' · '),
    isWishlist: true,
  }
}

function formatSaleAt(unixSec) {
  const d = new Date(unixSec * 1000 + 8 * 3600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

async function addToWishlist(item, sku) {
  if (!item || adding.value) return false
  adding.value = true
  try {
    const payload = buildWishlistPayload(item, sku)
    await goodsStore.addGoods(payload)
    showToast(t('mihoyoNew.addedWishlist', { name: payload.name }))
    return true
  } catch (e) {
    showToast(e.message || t('common.failed'))
    return false
  } finally {
    adding.value = false
  }
}

async function confirmAddToWishlist() {
  if (!activeItem.value || adding.value) return
  const ok = await addToWishlist(activeItem.value, selectedSku.value)
  if (ok) closeSkuSheet()
}

onMounted(() => {
  updateViewport()
  void loadCatalog(activeCatalog.value)
})
</script>

<style scoped>
.arrivals-page {
  min-height: 100dvh;
}

.page-body {
  padding-bottom: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.page-body > section,
.page-body > p {
  padding-left: var(--page-padding);
  padding-right: var(--page-padding);
  width: 100%;
  max-width: 960px;
  box-sizing: border-box;
}

.page-body > section {
  margin-top: 14px;
}

.page-body > .toolbar {
  margin-top: 12px;
}

/* ── 工具栏：固定 380px 控件条，与内容有无无关 ── */
.toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.toolbar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  max-width: 440px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.catalog-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--app-chip-bg);
  flex: 1;
  min-width: 0;
}

.catalog-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.catalog-tab--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: var(--app-shadow-sm);
}

.catalog-tab__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.catalog-tab__dot--shop {
  background: #e36a2e;
}

.catalog-tab__dot--point {
  background: #2f7fd3;
}

.catalog-tab__dot--gift {
  background: #e36a2e;
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text);
}

.refresh-btn svg {
  width: 16px;
  height: 16px;
}

.refresh-btn:disabled {
  opacity: 0.55;
}

.shop-filters {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  width: 100%;
  max-width: 440px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.shop-filters::-webkit-scrollbar {
  display: none;
}

.shop-chip {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.shop-chip--active {
  background: var(--app-text);
  border-color: var(--app-text);
  color: var(--app-surface);
  font-weight: 600;
}

/* ── 白底列表容器 ── */
.list-panel {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  padding: 12px;
  box-shadow: var(--app-shadow-sm);
}

.list-panel--skeleton {
  padding: 4px 0;
  overflow: hidden;
}

.list-panel--skeleton :deep(.goods-list-skeleton) {
  padding: 8px 4px;
}

.list-panel .goods-grid {
  margin-top: 0 !important;
}

.list-panel .goods-card {
  background: var(--app-surface-soft);
  border-color: transparent;
  box-shadow: none;
}

/* ── 分区标题（即将上架 / 已上架） ── */
.list-section {
  margin-top: 22px !important;
}

.list-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.list-section__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.list-section__dot--upcoming {
  background: #2f7fd3;
}

.list-section__dot--released {
  background: #2f9e5e;
}

.list-section__dot--point {
  background: #2f7fd3;
}

.list-section__dot--gift {
  background: #e36a2e;
}

.list-section__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
}

.list-section__count {
  font-size: 12px;
  color: var(--app-text-tertiary);
  font-weight: 600;
}

.list-section .goods-grid {
  margin-top: 0 !important;
}

.goods-card__released {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(47, 158, 94, 0.92);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
}


.goods-card__sku-new {
  position: absolute;
  bottom: 8px;
  left: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(47, 127, 211, 0.92);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
}

.goods-card__cloud-new {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(227, 106, 46, 0.95);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
}

.goods-card__sku-hint {
  font-size: 11px;
  color: #2070c0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── 满赠独立区 ── */
.gift-section {
  margin-top: 22px !important;
}

.gift-section__head {
  margin-bottom: 10px;
}

.gift-section__label {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #e36a2e;
  font-weight: 600;
}

.gift-section__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
}

.gift-section__desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.gift-section .goods-grid {
  margin-top: 0 !important;
}

/* ── 商品网格：手机 2 栏，平板 3 栏 ── */
.goods-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px !important;
  align-items: start;
}

.goods-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
  min-width: 0;
}

.goods-card__main {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  text-align: left;
  border: none;
  background: transparent;
}

.goods-card__media {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  background: var(--app-surface-soft);
  overflow: hidden;
}

.goods-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.goods-card__media-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 36px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.goods-card__badges {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  z-index: 1;
}

.goods-card__wished {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(194, 65, 90, 0.92);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}

.goods-card__owned {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(47, 127, 211, 0.92);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}

.goods-card__gift {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(227, 106, 46, 0.92);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
}

.goods-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 10px 12px;
  min-width: 0;
}

.goods-card__shop {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.goods-card__name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--app-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.7em;
}

.goods-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.price {
  font-size: 14px;
  font-weight: 700;
  color: var(--app-text);
}

.price--point {
  color: #2070c0;
}

.sale-time {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

/* ── SKU 弹层内容 ── */
.sku-sheet {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 2px 0 4px;
}

.sku-sheet__hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sku-sheet__product {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.sku-sheet__thumb {
  width: 112px;
  height: 112px;
  border-radius: var(--radius-small);
  overflow: hidden;
  background: var(--app-surface-soft);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: var(--app-text-tertiary);
  border: 1px solid var(--app-border);
}

.sku-sheet__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sku-sheet__info {
  min-width: 0;
  flex: 1;
  padding-top: 2px;
}

.sku-sheet__shop {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.sku-sheet__name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--app-text);
}

.sku-sheet__selected {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-chip-accent-text);
}

.sku-sheet__meta {
  margin: 6px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.sku-sheet__hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.sku-sheet__picker {
  padding: 12px;
  border-radius: var(--radius-card);
  background: transparent;
  border: none;
}

.sku-sheet__loading,
.sku-sheet__error {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.sku-sheet__error {
  flex-wrap: wrap;
}

.sku-sheet__error p {
  margin: 0;
  flex: 1;
  min-width: 140px;
}

.sku-sheet__empty {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.sku-sheet__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sku-chips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.sku-chip {
  display: grid;
  grid-template-columns: 36px 1fr auto 20px;
  gap: 8px;
  align-items: center;
  min-height: 52px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--app-text) 10%, transparent);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text);
  text-align: left;
  box-shadow: none;
}

.sku-chip--selected {
  border-color: var(--app-chip-accent-border);
  background: var(--app-chip-accent-bg);
  color: var(--app-chip-accent-text);
}

.sku-chip--wished:not(.sku-chip--selected) {
  border-color: color-mix(in srgb, #2f9e5e 35%, transparent);
}

.sku-chip:has(.sku-chip__owned):not(.sku-chip--selected) {
  border-color: color-mix(in srgb, #2f7fd3 35%, transparent);
}

.sku-chip__flags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.sku-chip__wished {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(47, 158, 94, 0.14);
  color: #2f9e5e;
  white-space: nowrap;
}

.sku-chip__owned {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(47, 127, 211, 0.14);
  color: #2f7fd3;
  white-space: nowrap;
}

.sku-chip__thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--app-surface-muted);
  flex-shrink: 0;
}

.sku-chip__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sku-chip__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sku-chip__text {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sku-chip__price {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--app-text);
  white-space: nowrap;
}

.sku-chip--selected .sku-chip__price {
  color: var(--app-chip-accent-text);
}

.sku-chip__check {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-chip-accent-text);
}

.sku-chip__check svg {
  width: 16px;
  height: 16px;
}

.whole-btn,
.confirm-btn,
.ghost-btn,
.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  border-radius: var(--radius-small);
  font-size: 14px;
  font-weight: 600;
}

.confirm-btn {
  width: 100%;
  border: none;
  background: var(--app-text);
  color: var(--app-surface);
}

.confirm-btn:disabled {
  opacity: 0.55;
}

.confirm-btn svg,
.ghost-btn svg {
  width: 16px;
  height: 16px;
}

.ghost-btn {
  padding: 0 14px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
}

.primary-btn {
  padding: 0 18px;
  border: none;
  background: var(--app-text);
  color: var(--app-surface);
}

.sheet-cancel {
  width: 100%;
  min-height: 44px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

/* ── 状态卡：与工具栏同宽，不居中缩成一团 ── */
.state-card {
  margin-top: 14px;
  padding: 32px 20px;
  border-radius: var(--radius-card);
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  text-align: center;
  width: 100%;
}

.state-card--loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.state-card__icon {
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  color: var(--app-text-tertiary);
}

.state-card__icon svg {
  width: 32px;
  height: 32px;
}

.state-card__icon--danger {
  color: #d64545;
}

.state-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
}

.state-card__desc {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text-secondary);
}

.state-card .primary-btn {
  margin-top: 14px;
}

.partial-note,
.arrivals-note {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-tertiary);
}

.spinner {
  width: 18px;
  height: 18px;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 平板 / 宽屏：列数加宽，宽度仍走 page-body 统一中轴 ── */
.arrivals-page--tablet .goods-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.arrivals-page--tablet .goods-card__name {
  font-size: 14px;
}

.arrivals-page--tablet .sku-chips {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.arrivals-page--tablet .sku-sheet__thumb {
  width: 160px;
  height: 160px;
}

@media (min-width: 720px) {
  .sku-sheet__thumb {
    width: 140px;
    height: 140px;
  }
}

@media (min-width: 1400px) {
  .page-body > section,
  .page-body > p {
    max-width: 1120px;
  }

  .arrivals-page--tablet .goods-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>

<style>
/* AppSheet 会 Teleport 到 body，scoped 盖不到；加宽上新 SKU 弹层 */
.arrival-sku-sheet {
  width: min(100%, 640px);
}

@media (min-width: 900px) {
  .arrival-sku-sheet {
    width: min(100%, 720px);
  }
}
</style>
