<template>
  <ImportPage class="taobao-hub-page" :title="t('nav.taobaoImport')">
    <main class="page-body taobao-hub-body">
      <ImportTabs v-model="activeTab" :tabs="tabs" :aria-label="t('nav.taobaoImport')" />

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

        <!-- 暂存队列缩略图条（点击切换编辑目标） -->
        <div v-if="queueEntries.length > 0" class="tbq-strip">
          <button
            v-for="entry in queueEntries"
            :key="entry.uid"
            type="button"
            :class="[
              'tbq-strip-item',
              entry.uid === activeUid && 'tbq-strip-item--active',
              entry.status === 'failed' && 'tbq-strip-item--failed',
            ]"
            :title="entry.draft?.title || entry.itemId || entry.input"
            @click="activateEntry(entry)"
          >
            <img v-if="entry.draft?.images?.[0]" :src="entry.draft.images[0]" loading="lazy" alt="" />
            <span v-else class="tbq-strip-fallback">{{ (entry.draft?.title || entry.itemId || '?').charAt(0) }}</span>
            <span v-if="entry.status === 'parsing'" class="tbq-dot tbq-dot--parsing" />
            <span v-else-if="entry.status === 'failed'" class="tbq-dot tbq-dot--failed" />
          </button>
        </div>

        <!-- 激活项解析中占位 -->
        <transition name="result-fade">
          <div v-if="!draft && parsing" class="tbq-parsing-card">
            <span class="hub-spinner" />
            <span>{{ t('import.taobaoQueueParsing') }}</span>
          </div>
        </transition>

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

                <!-- 规格（淘宝 SKU，按属性分组多级选择） -->
                <div v-if="draft.skus.length > 0" class="field">
                  <span class="field-label">{{ t('import.taobaoSkuLabel') }}</span>
                  <div v-for="group in skuGroups" :key="group.pid" class="sku-group">
                    <span v-if="group.name" class="sku-group-name">{{ group.name }}</span>
                    <div class="sku-row">
                      <button
                        v-for="value in group.values"
                        :key="value.vid"
                        class="sku-chip"
                        type="button"
                        :class="{
                          'sku-chip--active': form.skuSelection[group.pid] === value.vid,
                          'sku-chip--disabled': !isSkuValueAvailable(group, value),
                        }"
                        :disabled="!isSkuValueAvailable(group, value)"
                        @click="toggleSkuValue(group, value)"
                      >
                        <img v-if="value.image" class="sku-chip-img" :src="value.image" loading="lazy" alt="" />
                        <span class="sku-name">{{ value.name }}</span>
                        <span v-if="skuValuePrice(group, value)" class="sku-price">¥{{ skuValuePrice(group, value) }}</span>
                      </button>
                    </div>
                  </div>
                  <p v-if="priceRangeHint" class="field-hint">{{ priceRangeHint }}</p>
                </div>

                <!-- 角色 -->
                <div class="field">
                  <span class="field-label">{{ t('common.character') }}</span>
                  <ImportCharacterPicker v-model="form.characters" :ip="form.ip" />
                </div>

                <!-- 智能建议：分类 / IP / 角色预测（逐条目实例，与米游铺队列一致） -->
                <ImportQueueTagSuggestions
                  :key="activeUid"
                  :entry="activeTagEntry"
                  @apply="handleApplySuggestion"
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

      <!-- ============ 购物车导入 ============ -->
      <section v-if="activeTab === 'cart'" class="hub-panel hub-panel--order" role="tabpanel">
        <TaobaoCartImportView :is-wishlist="entryIsWishlist" />
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
          <!-- 暂存队列：搜索/链接解析出的待处理草稿，逐件编辑保存 -->
          <div v-if="queueEntries.length > 0" class="tbq-list">
            <div class="tbq-head">
              <p class="tbq-title">{{ t('import.taobaoQueueTitle') }}</p>
              <button type="button" class="tbq-clear" @click="clearQueue">{{ t('import.clearQueue') }}</button>
            </div>
            <div
              v-for="entry in queueEntries"
              :key="entry.uid"
              :class="['tbq-card', entry.uid === activeUid && 'tbq-card--active']"
              @click="activateEntry(entry)"
            >
              <div class="tbq-thumb">
                <img v-if="entry.draft?.images?.[0]" :src="entry.draft.images[0]" loading="lazy" alt="" />
                <span v-else class="tbq-thumb-fallback">{{ (entry.draft?.title || entry.itemId || '?').charAt(0) }}</span>
                <span v-if="entry.status === 'parsing'" class="hub-spinner tbq-thumb-spinner" />
              </div>
              <div class="tbq-body">
                <p class="tbq-name">{{ entry.draft?.title || entry.itemId || entry.input }}</p>
                <p class="tbq-meta">
                  <template v-if="entry.status === 'parsing'">{{ t('import.taobaoQueueParsing') }}</template>
                  <template v-else-if="entry.status === 'failed'">
                    <span class="tbq-error">{{ parseMessage(entry.error) }}</span>
                    <button type="button" class="tbq-retry" @click.stop="retryQueueEntry(entry.uid)">{{ t('import.retryParse') }}</button>
                  </template>
                  <template v-else>
                    <span v-if="entry.draft?.priceText" class="tbq-price">¥{{ entry.draft.priceText }}</span>
                    <span v-if="entry.draft?.shopName" class="tbq-shop">{{ entry.draft.shopName }}</span>
                  </template>
                </p>
              </div>
              <button class="tbq-remove" type="button" :aria-label="t('common.remove')" @click.stop="removeQueueEntry(entry.uid)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div v-if="searchResults.length > 0" class="search-results">
              <button
                v-for="item in searchResults"
                :key="item.itemId"
                type="button"
                class="search-result-card"
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
                <span class="search-result-go" aria-hidden="true">›</span>
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ImportPage from '@/components/import/ImportPage.vue'
import ImportTabs from '@/components/import/ImportTabs.vue'
import ImportSearchCard from '@/components/import/ImportSearchCard.vue'
import ImportHeroPreview from '@/components/import/ImportHeroPreview.vue'
import ImportFormSection from '@/components/import/ImportFormSection.vue'
import ImportImagePicker from '@/components/import/ImportImagePicker.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import TaobaoImportView from '@/views/import/TaobaoImportView.vue'
import TaobaoCartImportView from '@/views/import/TaobaoCartImportView.vue'
import ImportCharacterPicker from '@/components/import/ImportCharacterPicker.vue'
import ImportQueueTagSuggestions from '@/components/import/ImportQueueTagSuggestions.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
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
import { TaobaoImportError, searchTaobaoItems, validateTaobaoCookie, TAOBAO_SEARCH_PAGE_SIZE } from '@/utils/taobao/service'
import { normalizeCdnUrl, splitSkuPath } from '@/utils/taobao/detail'
import { useTaobaoQueue } from '@/composables/import/useTaobaoQueue'

defineOptions({ name: 'TaobaoHubView' })

const { t } = useI18n()
const route = useRoute()
const goodsStore = useGoodsStore()
const presets = usePresetsStore()

// 导入目标由入口决定（心愿单入口 target=wishlist），不再提供页内切换
const entryIsWishlist = route.query.target === 'wishlist'

const tabs = computed(() => [
  { key: 'link', label: t('import.taobaoTabLink') },
  // 订单导入仅收藏入口；购物车两入口都可用（心愿单 target=wishlist）
  ...(entryIsWishlist ? [] : [
    { key: 'order', label: t('import.taobaoTabOrder') },
  ]),
  { key: 'cart', label: t('import.taobaoTabCart') },
  { key: 'search', label: t('import.taobaoTabSearch'), badge: queueEntries.value.length > 0 ? String(queueEntries.value.length) : '' },
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

// ── 暂存队列 + 链接解析（队列 = 待处理草稿列表，表单 = 激活项的视图） ──
const linkInput = ref('')
const parseError = ref('')
const activeUid = ref('')

const queue = useTaobaoQueue({
  // 任一条目解析成功都视为 Cookie 有效（解析走登录态详情页）
  onReady: () => {
    cookieStatus.value = 'ok'
    cookieReady.value = true
  },
  onFailed: (entry) => {
    const code = errorCode(entry.error)
    // 后台失败只更新 Cookie 徽标，不打断当前操作；激活项失败才就地报错
    if (entry.uid !== activeUid.value) {
      if (code === 'LOGIN_REQUIRED' || code === 'BLOCKED' || code === 'NO_COOKIE') {
        cookieReady.value = false
        cookieStatus.value = code === 'BLOCKED' ? 'blocked' : 'expired'
      }
      return
    }
    parseError.value = parseMessage(entry.error)
    applyCookieErrorState(code)
  },
})
const queueEntries = queue.entries

const activeEntry = computed(() => queue.entries.value.find((entry) => entry.uid === activeUid.value) || null)
/** 表单当前编辑的草稿（激活项解析完成后才有值） */
const draft = computed(() => (activeEntry.value?.status === 'ready' ? activeEntry.value.draft : null))
/** 激活项解析中（解析按钮的转圈/禁用口径） */
const parsing = computed(() => activeEntry.value?.status === 'parsing')

const form = reactive({
  name: '',
  category: '',
  ip: '',
  characters: [],
  source: '',
  price: '',
  // 多级规格选择：pid → vid（属性树缺失时用 FALLBACK_SKU_PID → sku.path）
  skuSelection: {},
  images: [],
  isWishlist: entryIsWishlist,
})

// 智能建议：与米游铺队列一致，每个条目独立实例化（建议与「忽略」记忆都逐条目独立）。
// 通过 getter/setter 门面把激活条目的表单字段映射成 ImportQueueTagSuggestions 期望的 entry 形态。
const activeTagEntry = computed(() => {
  if (!activeUid.value) return null
  return {
    get name() {
      return form.name
    },
    set name(value) {
      form.name = value
    },
    get info() {
      return {
        get category() {
          return form.category
        },
        set category(value) {
          form.category = value
        },
        get ip() {
          return form.ip
        },
        set ip(value) {
          form.ip = value
        },
        get characters() {
          return form.characters
        },
        set characters(value) {
          form.characters = value
        },
        // 淘宝导入表单没有备注 / 自定义标签字段，保持空实现
        get notes() {
          return ''
        },
        set notes(value) {},
        get tags() {
          return []
        },
        set tags(value) {},
      }
    },
  }
})

function handleApplySuggestion({ field, value }) {
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

function clearForm() {
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
  form.skuSelection = {}
  form.images = []
}

// 表单快照：切换队列条目时保留各自的编辑进度
const FORM_SNAPSHOT_KEYS = ['name', 'category', 'ip', 'characters', 'source', 'price', 'skuSelection', 'images']

function snapshotForm() {
  const snap = {}
  for (const key of FORM_SNAPSHOT_KEYS) {
    const value = form[key]
    snap[key] = Array.isArray(value) ? [...value] : (value && typeof value === 'object' ? { ...value } : value)
  }
  return snap
}

function restoreForm(snap) {
  clearForm()
  for (const key of FORM_SNAPSHOT_KEYS) {
    if (snap[key] !== undefined) form[key] = snap[key]
  }
}

/** 激活某条队列条目（载入编辑表单并切到链接导入 tab） */
function activateEntry(entry) {
  activeUid.value = entry.uid
  activeTab.value = 'link'
}

/** 重置按钮：丢弃当前条目，自动接上队列里的下一件 */
function resetDraft() {
  if (activeUid.value) queue.remove(activeUid.value)
  const next = queue.entries.value.find((entry) => entry.status !== 'failed')
  if (next) activateEntry(next)
  else {
    activeUid.value = ''
    clearForm()
  }
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

/** 草稿填入表单（激活项解析完成或无快照时） */
function fillFormFromDraft(result) {
  form.name = result.title
  form.price = result.price
  form.category = ''
  form.ip = ''
  form.characters = []
  form.source = result.shopName || ''
  form.skuSelection = {}
  // 默认只带第一张主图；选中 SKU 后默认只保留该 SKU 图，其余均可手动加选
  const firstImage = normalizeCdnUrl(result.images?.[0] || '')
  form.images = firstImage ? [firstImage] : []
  autoSelectSkuDefaults()
}

// 切换激活项：离场条目存快照，进场条目恢复快照或从草稿填充
watch(activeUid, (uid, oldUid) => {
  const prev = queue.entries.value.find((entry) => entry.uid === oldUid)
  if (prev?.status === 'ready') prev.snapshot = snapshotForm()
  const next = queue.entries.value.find((entry) => entry.uid === uid)
  if (next?.status === 'ready') {
    if (next.snapshot) restoreForm(next.snapshot)
    else fillFormFromDraft(next.draft)
  } else {
    clearForm()
    if (next?.status === 'failed') parseError.value = parseMessage(next.error)
  }
})

// 激活项解析完成 → 填表（已有快照则恢复编辑进度）
watch(() => activeEntry.value?.status, (status) => {
  if (status !== 'ready') return
  const entry = activeEntry.value
  if (entry.snapshot) restoreForm(entry.snapshot)
  else fillFormFromDraft(entry.draft)
})

/** 链接导入：入队并立即激活（保持"解析完即编辑"的体验） */
function handleParse() {
  const input = linkInput.value.trim()
  if (!input) return
  parseError.value = ''
  const { entry, duplicated } = queue.enqueue(input)
  if (duplicated) showGlobalToast(t('import.taobaoQueueDuplicate'))
  activateEntry(entry)
}

// ── 搜索 ─────────────────────────────────────────────
const searchKeyword = ref('')
const searching = ref(false)
const searchLoadingMore = ref(false)
const searchError = ref('')
const searchResults = ref([])
const searchPage = ref(0)
const searchDone = ref(false)

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
  if (searchLoadingMore.value || searchDone.value || searching.value) return
  const keyword = searchKeyword.value.trim()
  if (!keyword) return
  searchLoadingMore.value = true
  searchError.value = ''
  try {
    const nextPage = searchPage.value + 1
    const { items } = await searchTaobaoItems(keyword, { page: nextPage })
    // 关键词快照校验：loadMore 在途时用户重新搜索会整体替换结果集，
    // 旧关键词的续页若直接追加会把两批结果混在一起
    if (searchKeyword.value.trim() !== keyword) return
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

/** 点搜索结果 → 入队后台解析（不跳 tab），队列卡片与 tab 徽标可见进度 */
function handlePickSearchResult(item) {
  const { duplicated } = queue.enqueue(item.itemId, item.itemId)
  showGlobalToast(t(duplicated ? 'import.taobaoQueueDuplicate' : 'import.taobaoQueued'))
}

function retryQueueEntry(uid) {
  queue.retry(uid)
}

function removeQueueEntry(uid) {
  queue.remove(uid)
  if (uid !== activeUid.value) return
  const next = queue.entries.value.find((entry) => entry.status !== 'failed')
  activeUid.value = ''
  clearForm()
  if (next) activateEntry(next)
}

function clearQueue() {
  queue.clear()
  activeUid.value = ''
  clearForm()
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
  return selectedSku.value ? '' : t('import.taobaoPriceRange')
})

const saveButtonText = computed(() =>
  form.isWishlist ? t('import.taobaoImportWishlistBtn') : t('import.taobaoImportBtn')
)

// ── 多级规格选择（skuBase.props 属性树 × skus.propPath 组合） ──

/** 属性树缺失时的兜底组 pid（vid 直接对应整条 sku.path，沿用旧平铺口径） */
const FALLBACK_SKU_PID = '_path'

const skuGroups = computed(() => {
  const props = draft.value?.skuProps
  if (Array.isArray(props) && props.length > 0) return props
  const skus = draft.value?.skus || []
  if (skus.length === 0) return []
  return [{
    pid: FALLBACK_SKU_PID,
    name: '',
    values: skus.map((sku) => ({ vid: sku.path, name: sku.name, image: sku.image })),
  }]
})

/** sku.path 是否覆盖给定的 pid → vid 选择（兜底组按整条 path 比对） */
function pathHasSelection(path, pid, vid) {
  if (pid === FALLBACK_SKU_PID) return path === vid
  return splitSkuPath(path).includes(`${pid}:${vid}`)
}

/** 当前选中组合恰好命中某个 SKU（各级都有选择且组合存在） */
const selectedSku = computed(() => {
  const skus = draft.value?.skus || []
  const entries = Object.entries(form.skuSelection)
  if (skus.length === 0 || entries.length === 0) return null
  return skus.find((sku) => entries.every(([pid, vid]) => pathHasSelection(sku.path, pid, vid))) || null
})

/** 变体名：组合命中时用 SKU 名；部分选择时用已选值名拼接 */
const selectedSkuName = computed(() => {
  if (selectedSku.value) return selectedSku.value.name
  const names = []
  for (const group of skuGroups.value) {
    const vid = form.skuSelection[group.pid]
    if (!vid) continue
    const value = group.values.find((entry) => entry.vid === vid)
    if (value?.name) names.push(value.name)
  }
  return names.join(' / ')
})

/**
 * 某级的某个值在当前选择下是否可选：
 * 至少存在一个 SKU 同时含有该值与其它各级已选值（与淘宝详情页口径一致）
 */
function isSkuValueAvailable(group, value) {
  const skus = draft.value?.skus || []
  if (skus.length === 0) return true
  return skus.some((sku) => {
    if (!pathHasSelection(sku.path, group.pid, value.vid)) return false
    return Object.entries(form.skuSelection).every(
      ([pid, vid]) => pid === group.pid || pathHasSelection(sku.path, pid, vid),
    )
  })
}

/** 单级商品（该值唯一确定 SKU）在值上直接标价；多级时价格随完整组合回填 */
function skuValuePrice(group, value) {
  if (skuGroups.value.length !== 1) return ''
  const skus = draft.value?.skus || []
  return skus.find((sku) => pathHasSelection(sku.path, group.pid, value.vid))?.price || ''
}

function toggleSkuValue(group, value) {
  if (!draft.value) return
  if (form.skuSelection[group.pid] === value.vid) delete form.skuSelection[group.pid]
  else form.skuSelection[group.pid] = value.vid
  syncSkuSelection()
}

/** 只有唯一可选值的规格自动选中（单规格商品无需再点），并回填命中组合的价格/图片 */
function autoSelectSkuDefaults() {
  for (const group of skuGroups.value) {
    if (group.values.length !== 1) continue
    if (isSkuValueAvailable(group, group.values[0])) {
      form.skuSelection[group.pid] = group.values[0].vid
    }
  }
  syncSkuSelection()
}

/** 选中组合命中 SKU 时：回填价格，并默认只保留该 SKU 图（用户可再手动加选其他图） */
function syncSkuSelection() {
  const sku = selectedSku.value
  if (!sku) return
  if (sku.price) form.price = sku.price
  const skuImage = normalizeCdnUrl(sku.image || '')
  form.images = skuImage ? [skuImage] : form.images.filter((img) => availableImages.value.includes(img))
}

// 可选图片池：命中 SKU 图优先，随后主图（去重）
const availableImages = computed(() => {
  if (!draft.value) return []
  const pool = []
  const push = (url) => {
    const normalized = normalizeCdnUrl(url || '')
    if (normalized && !pool.includes(normalized)) pool.push(normalized)
  }
  if (selectedSku.value?.image) push(selectedSku.value.image)
  for (const image of draft.value.images) push(image)
  return pool
})

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

  const selectedSkuNameValue = selectedSkuName.value

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
      variant: selectedSkuNameValue,
      image: form.images[0] || '',
      images: [...form.images],
      price: form.price === '' ? null : Number(form.price),
      source: form.source,
      note: draft.value.url || '',
      characters: [...form.characters],
      isWishlist: form.isWishlist,
    })
    showGlobalToast(t('import.taobaoImported'))
    queue.remove(activeUid.value)
    linkInput.value = ''
    // 自动接上队列里的下一件；全部处理完则回搜索页继续挑
    const next = queue.entries.value.find((entry) => entry.status !== 'failed')
    if (next) activateEntry(next)
    else {
      activeUid.value = ''
      clearForm()
      activeTab.value = 'search'
    }
  } catch (error) {
    saveError.value = t('import.errorSaveFailed', { message: error?.message || '' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped src="@/assets/views/ImportView.css"></style>
<style scoped src="@/assets/views/TaobaoHubView.css"></style>
