<template>
  <ImportPage class="taobao-hub-page" :title="t('nav.taobaoImport')">
    <main class="page-body taobao-hub-body">
      <div class="hub-tabs" role="tablist" :aria-label="t('nav.taobaoImport')">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="hub-tab"
          type="button"
          role="tab"
          :class="{ 'hub-tab--active': activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.badge" class="hub-tab-badge">{{ tab.badge }}</span>
        </button>
      </div>

      <!-- ============ 链接导入 ============ -->
      <section v-show="activeTab === 'link'" class="hub-panel" role="tabpanel">
        <!-- Cookie 状态卡 -->
        <div class="hub-card" :class="cookieCardClass">
          <div class="hub-card-head">
            <p class="hub-card-title">{{ t('import.taobaoCookieTitle') }}</p>
            <span class="cookie-badge" :class="cookieBadgeClass">{{ cookieBadgeText }}</span>
          </div>
          <p class="hub-card-desc">{{ t('import.taobaoCookieHint') }}</p>

          <template v-if="cookieEditing || !cookieReady">
            <textarea
              v-model="cookieInput"
              class="cookie-input"
              :placeholder="t('import.taobaoCookiePlaceholder')"
              rows="4"
              spellcheck="false"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
            />
            <p v-if="cookieError" class="field-error">{{ cookieError }}</p>
            <div class="hub-actions">
              <button class="hub-btn hub-btn--primary" type="button" :disabled="cookieChecking || !cookieInput.trim()" @click="saveCookie">
                <span v-if="!cookieChecking">{{ t('import.taobaoCookieSave') }}</span>
                <span v-else class="hub-spinner" />
              </button>
              <button v-if="cookieReady" class="hub-btn hub-btn--ghost" type="button" @click="cookieEditing = false">
                {{ t('common.cancel') }}
              </button>
            </div>
          </template>

          <div v-else class="hub-actions">
            <button class="hub-btn hub-btn--ghost" type="button" @click="startEditCookie">{{ t('common.edit') }}</button>
            <button class="hub-btn hub-btn--ghost" type="button" @click="handleClearCookie">{{ t('import.taobaoCookieClear') }}</button>
          </div>
        </div>

        <!-- 链接输入 -->
        <div class="hub-card">
          <div class="url-row">
            <input
              v-model="linkInput"
              class="link-input"
              type="text"
              inputmode="url"
              :placeholder="t('import.taobaoLinkPlaceholder')"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              @keyup.enter="handleParse"
            />
            <button class="hub-btn hub-btn--primary url-parse-btn" type="button" :disabled="parsing" @click="handleParse">
              <span v-if="!parsing">{{ t('import.taobaoParseLink') }}</span>
              <span v-else class="hub-spinner" />
            </button>
          </div>
          <p v-if="parseError" class="field-error">{{ parseError }}</p>
        </div>

        <!-- 解析结果（与米游铺导入页同款：预览卡 + 分区表单） -->
        <transition name="result-fade">
          <div v-if="draft" class="result-area">
            <!-- 预览卡 -->
            <ImportHeroPreview
              :image="coverImage"
              :name="form.name"
              :label="heroLabel"
              :desc="heroDesc"
              :cover-tone="previewCoverTone"
            />

            <!-- 基础信息 -->
            <ImportFormSection :label="t('import.recognizedInfo')" :title="t('import.goodsInfo')">
              <div class="field-card">
                <label class="field">
                  <span class="field-label">{{ t('common.name') }} <span class="required">*</span></span>
                  <input id="tb-name" v-model="form.name" type="text" :placeholder="t('import.goodsName')" />
                  <p v-if="nameError" class="field-error">{{ nameError }}</p>
                </label>
                <label class="field">
                  <span class="field-label">{{ t('common.category') }}</span>
                  <AppSelect v-model="form.category" :options="presets.categories" :placeholder="t('import.selectCategory')" />
                </label>
                <label class="field">
                  <span class="field-label">IP</span>
                  <AppSelect v-model="form.ip" :options="presets.ips" :placeholder="t('import.selectIp')" />
                </label>

                <!-- 规格（淘宝 SKU） -->
                <div v-if="draft.skus.length > 0" class="field">
                  <span class="field-label">{{ t('import.taobaoSkuLabel') }}</span>
                  <div class="sku-row">
                    <button
                      v-for="sku in draft.skus"
                      :key="sku.id || sku.path"
                      class="sku-chip"
                      type="button"
                      :class="{ 'sku-chip--active': form.skuPath === sku.path }"
                      @click="selectSku(sku)"
                    >
                      <span class="sku-name">{{ sku.name }}</span>
                      <span v-if="sku.price" class="sku-price">¥{{ sku.price }}</span>
                    </button>
                  </div>
                  <p v-if="priceRangeHint" class="field-hint">{{ priceRangeHint }}</p>
                </div>

                <!-- 角色 -->
                <div class="field">
                  <span class="field-label">{{ t('common.character') }}</span>
                  <ImportCharacterPicker v-model="form.characters" :ip="form.ip" />
                </div>

                <!-- 智能建议：分类 / IP / 角色预测与填入 -->
                <TagSuggestionPanel
                  :suggestions="tagSuggestions"
                  @apply="handleApplySuggestion"
                  @ignore="handleIgnoreSuggestion"
                  @apply-all="applyAllSuggestions"
                />

                <!-- 图片多选器 -->
                <ImportImagePicker
                  :model-value="form.images"
                  :images="availableImages"
                  @update:model-value="(v) => { form.images = v }"
                />
              </div>
            </ImportFormSection>

            <!-- 购入信息 -->
            <ImportFormSection :label="t('import.purchaseRecord')" :title="t('import.priceAndSource')">
              <div class="field-card">
                <label class="field">
                  <span class="field-label">{{ form.isWishlist ? t('import.targetPrice') : t('import.price') }}</span>
                  <input id="tb-price" v-model="form.price" type="text" inputmode="decimal" placeholder="0.00" />
                  <p v-if="priceError" class="field-error">{{ priceError }}</p>
                </label>
                <label class="field">
                  <span class="field-label">{{ t('import.purchaseChannel') }}</span>
                  <input v-model="form.source" type="text" :placeholder="draft.shopName || t('import.fromTaobao')" />
                </label>
              </div>
            </ImportFormSection>

            <!-- 保存 -->
            <div class="field-card">
              <p v-if="saveError" class="field-error">{{ saveError }}</p>

              <div class="hub-actions">
                <button class="hub-btn hub-btn--primary" type="button" :disabled="saving" @click="handleSave">
                  <span v-if="!saving">{{ saveButtonText }}</span>
                  <span v-else class="hub-spinner" />
                </button>
                <button class="hub-btn hub-btn--ghost" type="button" @click="resetDraft">{{ t('import.taobaoReset') }}</button>
              </div>
            </div>
          </div>
        </transition>
      </section>

      <!-- ============ 订单导入（复用既有页面） ============ -->
      <section v-if="activeTab === 'order'" class="hub-panel hub-panel--order" role="tabpanel">
        <TaobaoImportView embedded />
      </section>

      <!-- ============ 搜索 ============ -->
      <section v-show="activeTab === 'search'" class="hub-panel" role="tabpanel">
        <ImportSearchCard
          v-model="searchKeyword"
          :label="t('nav.taobaoImport')"
          :title="t('import.taobaoSearchTitle')"
          :placeholder="t('import.taobaoSearchPlaceholder')"
          :searching="searching"
          :error="searchError"
          @search="handleSearch"
        >
          <div v-if="searchResults.length > 0" class="search-results">
              <button
                v-for="item in searchResults"
                :key="item.itemId"
                type="button"
                class="search-result-card"
                :disabled="!!pickingItemId"
                @click="handlePickSearchResult(item)"
              >
                <div class="search-result-thumb">
                  <img v-if="item.pic" :src="item.pic" :alt="item.title" loading="lazy" />
                  <span v-else>{{ item.title?.charAt(0) || '?' }}</span>
                </div>
                <span class="search-result-info">
                  <span class="search-result-name">{{ item.title }}</span>
                  <span class="search-result-meta">
                    <span v-if="item.price" class="search-result-price">{{ item.price }}</span>
                    <span v-if="item.shop" class="search-result-shop">{{ item.shop }}</span>
                    <span v-if="item.sales" class="search-result-sales">{{ item.sales }}</span>
                  </span>
                </span>
                <span v-if="pickingItemId === item.itemId" class="hub-spinner search-result-spinner" />
                <span v-else class="search-result-go" aria-hidden="true">›</span>
              </button>
            </div>

            <p
              v-if="searchDone && searchResults.length === 0 && !searchError && !searching"
              class="search-empty"
            >
              {{ t('import.taobaoSearchEmpty') }}
            </p>

            <div v-if="searchResults.length > 0 && !searchDone" class="search-results-status">
              <span v-if="searchLoadingMore">{{ t('import.loadingMore') }}</span>
              <template v-else>
                <span>{{ t('import.scrollForMore') }}</span>
                <button type="button" class="search-results-load-more" @click="loadMoreSearchResults">
                  {{ t('import.loadMore') }}
                </button>
              </template>
            </div>
        </ImportSearchCard>
      </section>
    </main>
  </ImportPage>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ImportPage from '@/components/import/ImportPage.vue'
import ImportSearchCard from '@/components/import/ImportSearchCard.vue'
import ImportHeroPreview from '@/components/import/ImportHeroPreview.vue'
import ImportFormSection from '@/components/import/ImportFormSection.vue'
import ImportImagePicker from '@/components/import/ImportImagePicker.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import TaobaoImportView from '@/views/import/TaobaoImportView.vue'
import ImportCharacterPicker from '@/components/import/ImportCharacterPicker.vue'
import TagSuggestionPanel from '@/components/goods/TagSuggestionPanel.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSmartTagging } from '@/composables/goods/useSmartTagging'
import { getCoverTone } from '@/utils/goods/coverTone'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { showGlobalToast } from '@/utils/globalToast'
import { validatePrice } from '@/utils/validate'
import {
  clearTaobaoCookie,
  getTaobaoCookie,
  isTaobaoCookieReady,
  normalizeTaobaoCookie,
  setTaobaoCookie,
} from '@/utils/taobao/cookie'
import { TaobaoImportError, fetchTaobaoDraft, searchTaobaoItems, validateTaobaoCookie, TAOBAO_SEARCH_PAGE_SIZE } from '@/utils/taobao/service'
import { normalizeCdnUrl } from '@/utils/taobao/detail'

defineOptions({ name: 'TaobaoHubView' })

const { t } = useI18n()
const route = useRoute()
const goodsStore = useGoodsStore()
const presets = usePresetsStore()

// 导入目标由入口决定（心愿单入口 target=wishlist），不再提供页内切换
const entryIsWishlist = route.query.target === 'wishlist'

const tabs = computed(() => [
  { key: 'link', label: t('import.taobaoTabLink') },
  ...(entryIsWishlist ? [] : [{ key: 'order', label: t('import.taobaoTabOrder') }]),
  { key: 'search', label: t('import.taobaoTabSearch') },
])
const activeTab = ref('link')

// ── Cookie ─────────────────────────────────────────────
const cookieReady = ref(false)
const cookieEditing = ref(false)
const cookieChecking = ref(false)
const cookieInput = ref('')
const cookieError = ref('')
const cookieStatus = ref('idle') // idle | ok | expired | blocked

const cookieCardClass = computed(() => ({
  'hub-card--warn': !cookieReady.value || cookieStatus.value === 'expired' || cookieStatus.value === 'blocked',
  'hub-card--ok': cookieReady.value && cookieStatus.value === 'ok',
}))
const cookieBadgeClass = computed(() => ({
  'cookie-badge--ok': cookieReady.value && cookieStatus.value !== 'expired' && cookieStatus.value !== 'blocked',
  'cookie-badge--warn': !cookieReady.value || cookieStatus.value === 'expired' || cookieStatus.value === 'blocked',
}))
const cookieBadgeText = computed(() => {
  if (!cookieReady.value) return t('import.taobaoCookieMissing')
  if (cookieStatus.value === 'expired') return t('import.taobaoCookieExpired')
  if (cookieStatus.value === 'blocked') return t('import.taobaoCookieBlocked')
  return t('import.taobaoCookieSet')
})

onMounted(async () => {
  const cookie = await getTaobaoCookie()
  cookieReady.value = isTaobaoCookieReady(cookie)
  cookieInput.value = cookie
  cookieEditing.value = !cookieReady.value
})

function startEditCookie() {
  cookieEditing.value = true
  cookieError.value = ''
}

async function saveCookie() {
  const normalized = normalizeTaobaoCookie(cookieInput.value)
  if (!isTaobaoCookieReady(normalized)) {
    cookieError.value = t('import.taobaoCookieInvalid')
    return
  }
  cookieError.value = ''
  cookieChecking.value = true
  try {
    await setTaobaoCookie(normalized)
    cookieReady.value = true
    const result = await validateTaobaoCookie()
    if (result.ok) {
      cookieStatus.value = 'ok'
      cookieEditing.value = false
      showGlobalToast(t('import.taobaoCookieSaved'))
    } else {
      cookieStatus.value = result.code === 'BLOCKED' ? 'blocked' : 'expired'
      cookieError.value = result.code === 'BLOCKED'
        ? t('import.taobaoCookieBlocked')
        : t('import.taobaoCookieExpired')
    }
  } catch {
    cookieStatus.value = 'expired'
    cookieError.value = t('import.taobaoCookieNetwork')
  } finally {
    cookieChecking.value = false
  }
}

async function handleClearCookie() {
  await clearTaobaoCookie()
  cookieReady.value = false
  cookieStatus.value = 'idle'
  cookieInput.value = ''
  cookieEditing.value = true
  showGlobalToast(t('import.taobaoCookieCleared'))
}

// ── 链接解析 ───────────────────────────────────────────
const linkInput = ref('')
const parsing = ref(false)
const parseError = ref('')
const draft = ref(null)

const form = reactive({
  name: '',
  category: '',
  ip: '',
  characters: [],
  source: '',
  price: '',
  skuPath: '',
  images: [],
  includeDetail: false,
  isWishlist: entryIsWishlist,
})

// 智能建议：根据名称/角色预测分类、IP、角色（与米游铺导入同款）
const { tagSuggestions, applySuggestion, ignoreSuggestion, applyAllSuggestions } = useSmartTagging(form)

function handleIgnoreSuggestion({ field }) {
  if (field === 'characters') {
    form.characters = []
  }
  ignoreSuggestion({ field })
}

function handleApplySuggestion({ field, value }) {
  applySuggestion({ field, value })
  // 建议值可能来自字典而非预设：立即入预设，AppSelect 才能显示它
  if (field === 'category' && value && !presets.categories.includes(value)) {
    presets.addCategory(value)
  } else if (field === 'ip' && value && !presets.ips.includes(value)) {
    presets.addIp(value)
  }
}

const nameError = ref('')
const priceError = ref('')
const saveError = ref('')
const saving = ref(false)

const ERROR_KEYS = {
  NO_COOKIE: 'import.taobaoNeedCookie',
  INVALID_LINK: 'import.taobaoInvalidLink',
  SHORT_LINK: 'import.taobaoShortLink',
  LOGIN_REQUIRED: 'import.taobaoCookieExpired',
  BLOCKED: 'import.taobaoCookieBlocked',
  PARSE: 'import.taobaoNoData',
  NETWORK: 'import.taobaoNetworkError',
}

function resetDraft() {
  draft.value = null
  parseError.value = ''
  nameError.value = ''
  priceError.value = ''
  saveError.value = ''
  form.name = ''
  form.category = ''
  form.ip = ''
  form.characters = []
  form.source = ''
  form.price = ''
  form.skuPath = ''
  form.images = []
  form.includeDetail = false
}

function errorCode(error) {
  return error instanceof TaobaoImportError ? error.code : 'NETWORK'
}

function parseMessage(error) {
  const code = errorCode(error)
  return ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : t('import.taobaoParseFailed', { message: error?.message || code })
}

function searchMessage(error) {
  const code = errorCode(error)
  return ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : t('import.taobaoSearchFailed', { message: error?.message || code })
}

/** Cookie 类错误：回到链接页并把状态卡切到编辑/过期视图 */
function applyCookieErrorState(code) {
  if (code !== 'LOGIN_REQUIRED' && code !== 'BLOCKED' && code !== 'NO_COOKIE') return
  cookieReady.value = isTaobaoCookieReady(cookieInput.value) && code !== 'NO_COOKIE'
  cookieStatus.value = code === 'BLOCKED' ? 'blocked' : 'expired'
  cookieEditing.value = code === 'NO_COOKIE'
  activeTab.value = 'link'
}

/** 解析结果填入表单（链接导入与搜索选中共用） */
function applyDraft(result) {
  draft.value = result
  form.name = result.title
  form.price = result.price
  form.category = ''
  form.ip = ''
  form.characters = []
  form.source = result.shopName || ''
  form.skuPath = ''
  form.includeDetail = false
  // 默认只带第一张主图；选中 SKU 后默认只保留该 SKU 图，其余均可手动加选
  const firstImage = normalizeCdnUrl(result.images?.[0] || '')
  form.images = firstImage ? [firstImage] : []
  cookieStatus.value = 'ok'
  cookieReady.value = true
}

async function handleParse() {
  const input = linkInput.value.trim()
  if (!input) return
  resetDraft()
  parsing.value = true
  try {
    const result = await fetchTaobaoDraft(input)
    applyDraft(result)
  } catch (error) {
    parseError.value = parseMessage(error)
    applyCookieErrorState(errorCode(error))
  } finally {
    parsing.value = false
  }
}

// ── 搜索 ─────────────────────────────────────────────
const searchKeyword = ref('')
const searching = ref(false)
const searchLoadingMore = ref(false)
const searchError = ref('')
const searchResults = ref([])
const searchPage = ref(0)
const searchDone = ref(false)
const pickingItemId = ref('')

async function handleSearch() {
  const keyword = searchKeyword.value.trim()
  if (!keyword || searching.value) return
  searchError.value = ''
  searching.value = true
  try {
    const { items } = await searchTaobaoItems(keyword, { page: 1 })
    searchResults.value = items
    searchPage.value = 1
    searchDone.value = items.length < TAOBAO_SEARCH_PAGE_SIZE
  } catch (error) {
    searchResults.value = []
    searchPage.value = 0
    searchDone.value = false
    searchError.value = searchMessage(error)
    applyCookieErrorState(errorCode(error))
  } finally {
    searching.value = false
  }
}

async function loadMoreSearchResults() {
  if (searchLoadingMore.value || searchDone.value) return
  const keyword = searchKeyword.value.trim()
  if (!keyword) return
  searchLoadingMore.value = true
  searchError.value = ''
  try {
    const nextPage = searchPage.value + 1
    const { items } = await searchTaobaoItems(keyword, { page: nextPage })
    const seen = new Set(searchResults.value.map((entry) => entry.itemId))
    searchResults.value = [...searchResults.value, ...items.filter((entry) => !seen.has(entry.itemId))]
    searchPage.value = nextPage
    if (items.length < TAOBAO_SEARCH_PAGE_SIZE) searchDone.value = true
  } catch (error) {
    searchError.value = searchMessage(error)
    applyCookieErrorState(errorCode(error))
  } finally {
    searchLoadingMore.value = false
  }
}

/** 点搜索结果 → 抓详情页 → 填入表单 → 切回链接导入页编辑保存 */
async function handlePickSearchResult(item) {
  if (pickingItemId.value) return
  searchError.value = ''
  resetDraft()
  pickingItemId.value = item.itemId
  try {
    const result = await fetchTaobaoDraft(item.itemId)
    applyDraft(result)
    activeTab.value = 'link'
  } catch (error) {
    searchError.value = parseMessage(error)
    applyCookieErrorState(errorCode(error))
  } finally {
    pickingItemId.value = ''
  }
}

const coverImage = computed(() => form.images[0] || '')

const previewCoverTone = computed(() => (coverImage.value ? null : getCoverTone(form.category)))

const heroLabel = computed(() => {
  const current = draft.value
  if (!current) return ''
  const base = current.shopName || current.itemId || t('import.fromTaobao')
  return current.sellCount ? `${base} · ${t('import.taobaoSold', { count: current.sellCount })}` : base
})

const heroDesc = computed(() => (form.isWishlist ? t('import.wishlistDesc') : t('import.collectionDesc')))

const priceRangeHint = computed(() => {
  if (!draft.value?.priceRange) return ''
  return form.skuPath ? '' : t('import.taobaoPriceRange')
})

const saveButtonText = computed(() =>
  form.isWishlist ? t('import.taobaoImportWishlistBtn') : t('import.taobaoImportBtn')
)

function selectSku(sku) {
  if (!draft.value) return
  form.skuPath = sku.path
  if (sku.price) form.price = sku.price
  // 切换 SKU 时默认只保留该 SKU 图（用户可再手动加选其他图）
  const skuImage = normalizeCdnUrl(sku.image || '')
  form.images = skuImage ? [skuImage] : form.images.filter((img) => availableImages.value.includes(img))
}

// 可选图片池：SKU 图优先，随后主图，勾选「详情图」后追加详情图（去重）
const availableImages = computed(() => {
  if (!draft.value) return []
  const pool = []
  const push = (url) => {
    const normalized = normalizeCdnUrl(url || '')
    if (normalized && !pool.includes(normalized)) pool.push(normalized)
  }
  const selected = draft.value.skus.find((sku) => sku.path === form.skuPath)
  if (selected?.image) push(selected.image)
  for (const image of draft.value.images) push(image)
  if (form.includeDetail) {
    for (const image of draft.value.detailImages) push(image)
  }
  return pool
})

function handleIncludeDetailChange() {
  if (!form.includeDetail || !draft.value) {
    // 取消勾选详情图时，从已选中剔除详情图；SKU 图与主图不受影响
    const pool = new Set(availableImages.value)
    form.images = form.images.filter((img) => pool.has(img))
  }
}

async function handleSave() {
  nameError.value = ''
  priceError.value = ''
  saveError.value = ''

  await commitActiveInput()
  if (!form.name.trim()) {
    nameError.value = t('import.errorNameRequired')
    return
  }
  const priceValidation = validatePrice(form.price)
  if (!priceValidation.valid) {
    priceError.value = priceValidation.message
    return
  }
  if (form.images.length === 0) {
    saveError.value = t('import.taobaoNoImage')
    return
  }

  const selectedSku = draft.value?.skus.find((sku) => sku.path === form.skuPath)

  // 把用户选中的角色/分类/IP 加入预设（与米游铺导入一致）
  for (const charName of form.characters) {
    const exists = presets.characters.some((c) => (typeof c === 'string' ? c : c.name) === charName)
    if (!exists) presets.addCharacter(charName, form.ip || '')
  }
  if (form.category && !presets.categories.includes(form.category)) presets.addCategory(form.category)
  if (form.ip && !presets.ips.includes(form.ip)) presets.addIp(form.ip)

  saving.value = true
  try {
    await goodsStore.addGoods({
      name: form.name.trim(),
      category: form.category,
      ip: form.ip,
      goodsId: '',
      variant: selectedSku?.name || '',
      image: form.images[0] || '',
      images: [...form.images],
      price: form.price === '' ? null : Number(form.price),
      source: form.source,
      note: draft.value.url || '',
      characters: [...form.characters],
      isWishlist: form.isWishlist,
    })
    showGlobalToast(t('import.taobaoImported'))
    resetDraft()
    linkInput.value = ''
  } catch (error) {
    saveError.value = t('import.errorSaveFailed', { message: error?.message || '' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped src="@/assets/views/ImportView.css"></style>
<style scoped src="@/assets/views/TaobaoHubView.css"></style>
