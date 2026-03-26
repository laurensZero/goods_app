<template>
  <div class="page edit-page">
    <NavBar title="编辑谷子" show-back />

    <main class="page-body">
      <form class="editor-form" @submit.prevent="handleSubmit">
        <section class="manage-hero">
          <div class="preview-stage">
            <div class="preview-glow" />
            <div class="preview-media" :class="{ 'preview-media--empty': !primaryPreviewImage }">
              <img v-if="primaryPreviewImage" :src="primaryPreviewImage" :alt="form.name || '预览图'" class="preview-image" />
              <span v-else class="preview-fallback">{{ form.name?.trim().charAt(0).toUpperCase() || '谷' }}</span>
            </div>
          </div>

          <article class="hero-card">
            <p class="hero-label">{{ form.isWishlist ? '编辑心愿' : '编辑收藏' }}</p>
            <h1 class="hero-title">{{ form.name || (form.isWishlist ? '调整心愿信息' : '调整收藏信息') }}</h1>
            <p class="hero-desc">{{ form.isWishlist ? '更新目标、预算和备注，保持心愿单清晰。' : '更新图片、价格和备注，让这件收藏的信息保持最新。' }}</p>
          </article>
        </section>

        <section class="form-section">
          <div class="section-head">
            <p class="section-label">基础信息</p>
            <h2 class="section-title">商品资料</h2>
          </div>

          <div class="field-card">
            <div class="field">
              <span class="field-label">状态</span>
              <div class="status-toggle">
                <button
                  type="button"
                  :class="['status-toggle__option', { 'status-toggle__option--active': !form.isWishlist }]"
                  @click="form.isWishlist = false"
                >
                  已入手
                </button>
                <button
                  type="button"
                  :class="['status-toggle__option', { 'status-toggle__option--active': form.isWishlist }]"
                  @click="form.isWishlist = true"
                >
                  心愿单
                </button>
              </div>
            </div>

            <label class="field" :class="{ 'field--error': nameError }">
              <span class="field-label">名称 <span class="required">*</span></span>
              <input
                v-model="form.name"
                ref="nameInputRef"
                type="text"
                placeholder="例如：甘雨手办"
                required
                :aria-invalid="Boolean(nameError)"
                @input="syncField('name', $event)"
                @blur="syncField('name', $event)"
                @change="syncField('name', $event)"
                @compositionend="syncField('name', $event)"
                @paste="syncFieldLater('name', $event)"
              />
              <span v-if="nameError" class="field-error">{{ nameError }}</span>
            </label>

            <div class="field">
              <span class="field-label">分类</span>
              <AppSelect v-model="form.category" :options="presets.categories" placeholder="请选择分类" />
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('category')">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3V13" />
                  <path d="M3 8H13" />
                </svg>
                新建分类
              </button>
              <QuickPresetCreator
                v-if="quickCreateTarget === 'category'"
                :show="quickCreateTarget === 'category'"
                v-model="quickCategoryName"
                placeholder="输入分类名称"
                :maxlength="20"
                submit-text="新增分类"
                @cancel="closeQuickCreate"
                @submit="submitQuickCategory"
              />
            </div>

            <div class="field">
              <span class="field-label">IP</span>
              <AppSelect v-model="form.ip" :options="presets.ips" placeholder="请选择 IP" />
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('ip')">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3V13" />
                  <path d="M3 8H13" />
                </svg>
                新建 IP
              </button>
              <QuickPresetCreator
                v-if="quickCreateTarget === 'ip'"
                :show="quickCreateTarget === 'ip'"
                v-model="quickIpName"
                placeholder="输入 IP 名称"
                :maxlength="40"
                submit-text="新增 IP"
                @cancel="closeQuickCreate"
                @submit="submitQuickIp"
              />
            </div>

            <div ref="charactersFieldRef" class="field">
              <span class="field-label">角色</span>

              <div class="multi-select" :class="{ 'multi-select--open': showCharPicker }">
                <button
                  class="multi-select__trigger"
                  :class="{ 'multi-select__trigger--disabled': !form.ip }"
                  type="button"
                  @pointerdown="flushActiveInput"
                  @click="toggleCharPicker"
                >
                  <div class="multi-select__content">
                    <span v-if="form.characters.length === 0" class="multi-select__placeholder">{{ characterPlaceholder }}</span>
                    <div v-else class="multi-select__chips">
                      <span v-for="character in form.characters" :key="character" class="multi-select__chip">
                        {{ character }}
                        <button
                          class="multi-select__chip-remove"
                          type="button"
                          aria-label="移除角色"
                          @click.stop="toggleChar(character)"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  </div>

                  <svg class="multi-select__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 10L12 15L17 10" />
                  </svg>
                </button>

                <transition name="select-panel">
                  <div v-if="showCharPicker" class="multi-select__panel">
                    <button
                      v-for="character in availableCharacters"
                      :key="character.name"
                      class="multi-select__option"
                      :class="{ 'multi-select__option--active': form.characters.includes(character.name) }"
                      type="button"
                      @click="toggleChar(character.name)"
                    >
                      <span>{{ character.name }}</span>

                      <svg
                        v-if="form.characters.includes(character.name)"
                        class="multi-select__check"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M5 13L9 17L19 7" />
                      </svg>
                    </button>

                    <div v-if="!form.ip" class="multi-select__empty">请先选择 IP</div>
                    <div v-else-if="availableCharacters.length === 0" class="multi-select__empty">该 IP 还没有角色预设</div>
                  </div>
                </transition>
              </div>

              <button class="field-add-btn" type="button" @click="toggleQuickCreate('character')">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3V13" />
                  <path d="M3 8H13" />
                </svg>
                新建角色
              </button>

              <QuickPresetCreator
                v-if="quickCreateTarget === 'character'"
                :show="quickCreateTarget === 'character'"
                v-model="quickCharacterName"
                placeholder="输入角色名称"
                :maxlength="30"
                submit-text="新增角色"
                :secondary-value="quickCharacterIp"
                :secondary-options="quickCharacterIpOptions"
                :secondary-label="form.ip ? '当前将归到已选 IP' : '选择角色归属 IP'"
                secondary-placeholder="不设置 IP"
                @update:secondary-value="quickCharacterIp = $event"
                @cancel="closeQuickCreate"
                @submit="submitQuickCharacter"
              />
            </div>

            <div class="field">
              <span class="field-label">收纳位置</span>
              <StorageLocationInput
                v-model="form.storageLocation"
                :options="storageLocationOptions"
                placeholder="未设置收纳位置"
                quick-create
              />
            </div>

            <div class="field">
              <span class="field-label">自定义标签</span>
              <TagInput v-model="form.tags" placeholder="例如：生日谷、吧唧墙、待出" />
            </div>

            <div class="field">
              <span class="field-label">图片集</span>
              <GoodsImageManager v-model="form.images" :hint="form.characters[0] || ''" />
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="section-head">
            <p class="section-label">{{ form.isWishlist ? '目标信息' : '购入信息' }}</p>
            <h2 class="section-title">{{ form.isWishlist ? '预算与时间' : '价格与时间' }}</h2>
          </div>

          <div class="field-card">
            <label class="field">
              <span class="field-label">{{ form.isWishlist ? '目标价格（¥）' : '价格（¥）' }}</span>
              <div class="price-row">
                <input v-model="form.price" type="number" min="0" step="0.01" placeholder="0.00" />
                <button
                  v-if="!form.isWishlist"
                  type="button"
                  :class="['points-toggle-btn', showPointsInput && 'points-toggle-btn--active']"
                  :aria-label="showPointsInput ? '隐藏积分' : '输入消耗积分'"
                  @click="showPointsInput = !showPointsInput"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
              </div>
              <div v-if="showPointsInput" class="points-input-wrap">
                <span class="points-input-label">消耗积分</span>
                <input v-model.number="form.points" type="number" min="0" step="1" placeholder="0" />
              </div>
              <div v-if="!form.isWishlist" class="actual-price-block" :class="{ 'actual-price-block--open': showActualPriceInput }">
                <button class="actual-price-toggle" type="button" @click="showActualPriceInput = !showActualPriceInput">
                  <span class="actual-price-toggle__copy">
                    <span class="actual-price-toggle__title">
                      {{ showActualPriceInput ? '收起实际入手价' : (hasActualPriceValue(form.actualPrice) ? '已填写实际入手价' : '补充实际入手价') }}
                    </span>
                    <span class="actual-price-toggle__desc">
                      {{ showActualPriceInput ? '用于单独记录最终成交价' : (hasActualPriceValue(form.actualPrice) ? `当前 ¥${form.actualPrice}` : '如果成交价和标价不同，可以单独填写') }}
                    </span>
                  </span>
                  <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showActualPriceInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 10L12 15L17 10" />
                  </svg>
                </button>

                <div v-if="showActualPriceInput" class="actual-price-panel">
                  <span class="field-label">入手价（¥）</span>
                  <input v-model="form.actualPrice" type="number" min="0" step="0.01" placeholder="0.00" />
                </div>
              </div>
            </label>

            <label class="field">              <span class="field-label">数量</span>
              <input v-model.number="form.quantity" type="number" min="1" step="1" placeholder="1" />
            </label>

            <label class="field">              <span class="field-label">{{ form.isWishlist ? '预计入手日期' : '购入日期' }}</span>
              <button
                class="date-field"
                :class="{ 'date-field--disabled': quantityNumber >= 2 && showUnitAcquiredAtInput && !form.isWishlist }"
                type="button"
                :disabled="quantityNumber >= 2 && showUnitAcquiredAtInput && !form.isWishlist"
                :aria-disabled="quantityNumber >= 2 && showUnitAcquiredAtInput && !form.isWishlist"
                @pointerdown="flushActiveInput"
                @click="openDatePicker"
              >
                <span :class="{ 'date-field__value--placeholder': !form.acquiredAt }">
                  {{ form.acquiredAt || (form.isWishlist ? '可选，暂未计划' : '请选择日期') }}
                </span>

                <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M8 3V7" />
                  <path d="M16 3V7" />
                  <path d="M3 10H21" />
                </svg>
              </button>

              <div v-if="!form.isWishlist && quantityNumber >= 2" class="actual-price-block" :class="{ 'actual-price-block--open': showUnitAcquiredAtInput }">
                <button class="actual-price-toggle" type="button" @click="showUnitAcquiredAtInput = !showUnitAcquiredAtInput">
                  <span class="actual-price-toggle__copy">
                    <span class="actual-price-toggle__title">
                      {{ showUnitAcquiredAtInput ? '收起逐份购入时间' : (hasUnitAcquiredAtValue ? '已填写逐份购入时间' : '设置逐份购入时间') }}
                    </span>
                    <span class="actual-price-toggle__desc">
                      {{ showUnitAcquiredAtInput ? '可分别记录每一份谷子的购入日期' : (hasUnitAcquiredAtValue ? '已保存部分逐份日期' : '数量大于等于 2 时可单独设置每份日期') }}
                    </span>
                  </span>
                  <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showUnitAcquiredAtInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 10L12 15L17 10" />
                  </svg>
                </button>

                <div v-if="showUnitAcquiredAtInput" class="actual-price-panel">
                  <label v-for="index in quantityNumber" :key="`unit-date-${index}`" class="unit-date-field">
                    <span class="field-label">第 {{ index }} 份购入日期</span>
                    <button
                      class="date-field"
                      type="button"
                      @pointerdown="flushActiveInput"
                      @click="openUnitDatePicker(index - 1)"
                    >
                      <span :class="{ 'date-field__value--placeholder': !form.unitAcquiredAtList[index - 1] }">
                        {{ form.unitAcquiredAtList[index - 1] || '请选择日期' }}
                      </span>

                      <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="3" />
                        <path d="M8 3V7" />
                        <path d="M16 3V7" />
                        <path d="M3 10H21" />
                      </svg>
                    </button>
                  </label>
                </div>
              </div>
            </label>
          </div>
        </section>

        <section class="form-section">
          <div class="section-head">
            <p class="section-label">附加信息</p>
            <h2 class="section-title">备注</h2>
          </div>

          <div class="field-card">
            <label class="field field--textarea">
              <span class="field-label">备注内容</span>
              <textarea
                v-model="form.note"
                ref="noteInputRef"
                rows="5"
                placeholder="来源、编号、状态等..."
                @input="syncField('note', $event)"
                @blur="syncField('note', $event)"
                @change="syncField('note', $event)"
                @compositionend="syncField('note', $event)"
                @paste="syncFieldLater('note', $event)"
              ></textarea>
            </label>
          </div>
        </section>
      </form>
    </main>

    <Teleport to="body">
      <div class="float-footer">
        <button class="btn-primary btn-float" type="button" @pointerdown="flushActiveInput" @click="handleSubmit">{{ form.isWishlist ? '保存心愿' : '保存修改' }}</button>
      </div>
    </Teleport>

    <Popup
      v-model:show="showDatePicker"
      teleport="body"
      :z-index="2000"
      :lock-scroll="false"
      :position="datePickerPopupPosition"
      :round="!isTabletViewport"
      :class="['picker-popup', { 'picker-popup--center': isTabletViewport }]"
    >
      <DatePicker
        v-model="datePickerValue"
        title="选择购入日期"
        :min-date="minDate"
        :max-date="maxDate"
        @cancel="showDatePicker = false"
        @confirm="onDateConfirm"
      />
    </Popup>

    <Popup
      v-model:show="showUnitDatePicker"
      teleport="body"
      :z-index="2001"
      :lock-scroll="false"
      :position="datePickerPopupPosition"
      :round="!isTabletViewport"
      :class="['picker-popup', { 'picker-popup--center': isTabletViewport }]"
    >
      <DatePicker
        v-model="unitDatePickerValue"
        title="选择逐份购入日期"
        :min-date="minDate"
        :max-date="maxDate"
        @cancel="showUnitDatePicker = false"
        @confirm="onUnitDateConfirm"
      />
    </Popup>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { DatePicker, Popup } from 'vant'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { normalizeCharacterName, usePresetsStore } from '@/stores/presets'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { getPrimaryGoodsImageUrl } from '@/utils/goodsImages'
import { syncFieldValue, syncFieldValueNextFrame } from '@/utils/syncFieldValue'
import NavBar from '@/components/NavBar.vue'
import AppSelect from '@/components/AppSelect.vue'
import GoodsImageManager from '@/components/GoodsImageManager.vue'
import StorageLocationInput from '@/components/StorageLocationInput.vue'
import QuickPresetCreator from '@/components/QuickPresetCreator.vue'
import TagInput from '@/components/TagInput.vue'

const NO_IP_OPTION = '__NO_IP__'

const props = defineProps({ id: { type: String, required: true } })

const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()

const form = reactive({
  name: '',
  category: '',
  ip: '',
  isWishlist: false,
  characters: [],
  tags: [],
  storageLocation: '',
  price: '',
  actualPrice: '',
  points: '',
  acquiredAt: '',
  images: [],
  note: '',
  quantity: 1,
  unitAcquiredAtList: []
})

const showPointsInput = ref(false)
const showActualPriceInput = ref(false)
const showUnitAcquiredAtInput = ref(false)
const quickCreateTarget = ref('')
const quickCategoryName = ref('')
const quickIpName = ref('')
const quickCharacterName = ref('')
const quickCharacterIp = ref(NO_IP_OPTION)
const nameError = ref('')

const charactersFieldRef = ref(null)
const nameInputRef = ref(null)
const noteInputRef = ref(null)
const showDatePicker = ref(false)
const showUnitDatePicker = ref(false)
const showCharPicker = ref(false)
const datePickerValue = ref(toDatePickerValue(form.acquiredAt))
const unitDatePickerValue = ref(toDatePickerValue(form.acquiredAt))
const activeUnitDateIndex = ref(-1)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
const TABLET_BREAKPOINT = 768
const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth)

const availableCharacters = computed(() =>
  form.ip ? presets.characters.filter((character) => character.ip === form.ip) : []
)
const storageLocationOptions = computed(() => store.storageLocations)
const quickCharacterIpOptions = computed(() => {
  if (form.ip) {
    return [{ label: form.ip, value: form.ip }]
  }

  return [
    { label: '不设置 IP', value: NO_IP_OPTION },
    ...presets.ips.map((ip) => ({ label: ip, value: ip }))
  ]
})

const characterPlaceholder = computed(() => {
  if (!form.ip) return '请先选择 IP'
  if (availableCharacters.value.length === 0) return '该 IP 暂无角色'
  return '请选择角色'
})
const primaryPreviewImage = computed(() => getPrimaryGoodsImageUrl(form.images))
const quantityNumber = computed(() => Math.max(1, Number(form.quantity) || 1))
const hasUnitAcquiredAtValue = computed(() => form.unitAcquiredAtList.some((value) => !!String(value || '').trim()))
const isTabletViewport = computed(() => viewportWidth.value >= TABLET_BREAKPOINT)
const datePickerPopupPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))

function handleViewportResize() {
  viewportWidth.value = window.innerWidth
}

watch(
  () => form.name,
  (value) => {
    if (String(value || '').trim()) {
      nameError.value = ''
    }
  }
)

watch(
  () => form.ip,
  (ip) => {
    form.characters = form.characters.filter((name) =>
      presets.characters.some((character) => character.name === name && character.ip === ip)
    )
    showCharPicker.value = false
    if (!quickCreateTarget.value || quickCreateTarget.value !== 'character') return
    quickCharacterIp.value = ip || NO_IP_OPTION
  }
)

watch(
  quantityNumber,
  () => {
    syncUnitAcquiredAtListLength()
  },
  { immediate: true }
)

onMounted(() => {
  handleViewportResize()
  window.addEventListener('resize', handleViewportResize)
  const item = store.getById(props.id)
  if (item) {
    form.name = item.name ?? ''
    form.category = item.category ?? ''
    form.ip = item.ip ?? ''
    form.isWishlist = Boolean(item.isWishlist)
    form.characters = item.characters ? [...item.characters] : []
    form.tags = item.tags ? [...item.tags] : []
    form.storageLocation = item.storageLocation ?? ''
    form.price = item.price ?? ''
    form.actualPrice = item.actualPrice ?? ''
    form.points = item.points ?? ''
    showPointsInput.value = !!item.points
    showActualPriceInput.value = hasActualPriceValue(item.actualPrice)
    form.acquiredAt = item.acquiredAt ?? ''
    form.images = item.images ? [...item.images] : []
    form.note = item.note ?? ''
    form.quantity = Number(item.quantity) || 1
    form.unitAcquiredAtList = Array.isArray(item.unitAcquiredAtList) ? [...item.unitAcquiredAtList] : []
    showUnitAcquiredAtInput.value = form.unitAcquiredAtList.some((value) => !!String(value || '').trim())
    syncUnitAcquiredAtListLength()
    datePickerValue.value = toDatePickerValue(form.acquiredAt)
  }

  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('touchstart', handleClickOutside)
})

watch(
  () => form.isWishlist,
  (isWishlist) => {
    if (isWishlist) {
      showPointsInput.value = false
      showActualPriceInput.value = false
      showUnitAcquiredAtInput.value = false
      form.actualPrice = ''
      form.points = ''
      form.unitAcquiredAtList = []
    }
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize)
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('touchstart', handleClickOutside)
})

async function handleSubmit() {
  await commitActiveInput()
  syncDomFields()
  form.name = String(form.name || '').trim()
  if (!validateName()) return
  await store.updateGoods(props.id, { ...form })
  router.back()
}

function validateName() {
  if (form.name) {
    nameError.value = ''
    return true
  }

  nameError.value = '请先填写名称'
  nameInputRef.value?.focus?.()
  nameInputRef.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  return false
}

function closeQuickCreate() {
  quickCreateTarget.value = ''
  quickCategoryName.value = ''
  quickIpName.value = ''
  quickCharacterName.value = ''
  quickCharacterIp.value = form.ip || NO_IP_OPTION
}

function toggleQuickCreate(type) {
  if (quickCreateTarget.value === type) {
    closeQuickCreate()
    return
  }

  quickCreateTarget.value = type
  quickCategoryName.value = ''
  quickIpName.value = ''
  quickCharacterName.value = ''
  quickCharacterIp.value = form.ip || NO_IP_OPTION
}

async function submitQuickCategory() {
  await commitActiveInput()
  const name = String(quickCategoryName.value || '').trim()
  if (!name) return
  await presets.addCategory(name)
  form.category = name
  closeQuickCreate()
}

async function submitQuickIp() {
  await commitActiveInput()
  const name = String(quickIpName.value || '').trim()
  if (!name) return
  await presets.addIp(name)
  form.ip = name
  closeQuickCreate()
}

async function submitQuickCharacter() {
  await commitActiveInput()
  const name = normalizeCharacterName(quickCharacterName.value)
  if (!name) return

  const targetIp = form.ip || (quickCharacterIp.value === NO_IP_OPTION ? '' : quickCharacterIp.value)
  await presets.addCharacter(name, targetIp)

  if (!form.ip && targetIp) {
    form.ip = targetIp
  }

  if (!form.characters.includes(name)) {
    form.characters.push(name)
  }

  closeQuickCreate()
}

function toggleCharPicker() {
  if (!form.ip) return
  showCharPicker.value = !showCharPicker.value
}

function toggleChar(name) {
  const index = form.characters.indexOf(name)
  if (index === -1) {
    form.characters.push(name)
  } else {
    form.characters.splice(index, 1)
  }
}

function hasActualPriceValue(value) {
  return value !== '' && value != null
}

function normalizeUnitDateValue(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeUnitDateAt(index) {
  if (index < 0 || index >= form.unitAcquiredAtList.length) return
  form.unitAcquiredAtList[index] = normalizeUnitDateValue(form.unitAcquiredAtList[index])
}

function syncUnitAcquiredAtListLength() {
  const targetLength = quantityNumber.value
  const fallbackDate = normalizeUnitDateValue(form.acquiredAt)
  const current = Array.isArray(form.unitAcquiredAtList) ? [...form.unitAcquiredAtList] : []
  const next = Array.from({ length: targetLength }, (_, index) => normalizeUnitDateValue(current[index]) || fallbackDate)

  while (next.length > 0 && !next[next.length - 1]) {
    next.pop()
  }

  form.unitAcquiredAtList = next

  if (targetLength < 2) {
    showUnitAcquiredAtInput.value = false
  }
}

function syncAllUnitDatesFromPrimaryDate() {
  if (form.isWishlist || quantityNumber.value < 2) return

  const normalizedDate = normalizeUnitDateValue(form.acquiredAt)
  if (!normalizedDate) return

  form.unitAcquiredAtList = Array.from({ length: quantityNumber.value }, () => normalizedDate)
}

function openDatePicker() {
  datePickerValue.value = toDatePickerValue(form.acquiredAt)
  showDatePicker.value = true
}

function openUnitDatePicker(index) {
  if (index < 0 || index >= quantityNumber.value) return
  activeUnitDateIndex.value = index
  unitDatePickerValue.value = toDatePickerValue(form.unitAcquiredAtList[index] || form.acquiredAt)
  showUnitDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  form.acquiredAt = `${year}-${month}-${day}`
  datePickerValue.value = [year, month, day]
  syncAllUnitDatesFromPrimaryDate()
  showDatePicker.value = false
}

function onUnitDateConfirm({ selectedValues }) {
  const index = activeUnitDateIndex.value
  if (index < 0 || index >= quantityNumber.value) {
    showUnitDatePicker.value = false
    return
  }

  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  form.unitAcquiredAtList[index] = `${year}-${month}-${day}`
  unitDatePickerValue.value = [year, month, day]
  showUnitDatePicker.value = false
}

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const today = new Date()
  const fallbackYear = `${today.getFullYear()}`
  const fallbackMonth = `${today.getMonth() + 1}`.padStart(2, '0')
  const fallbackDay = `${today.getDate()}`.padStart(2, '0')

  if (!dateString) {
    return [fallbackYear, fallbackMonth, fallbackDay]
  }

  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

function handleClickOutside(event) {
  if (!charactersFieldRef.value?.contains(event.target)) {
    showCharPicker.value = false
  }
}

function syncField(key, event) {
  syncFieldValue(form, key, event)
}

function syncFieldLater(key, event) {
  syncFieldValueNextFrame(form, key, event)
}

function syncDomFields() {
  if (nameInputRef.value) form.name = nameInputRef.value.value ?? ''
  if (noteInputRef.value) form.note = noteInputRef.value.value ?? ''
}
</script>

<style scoped>
.editor-form {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: 6px var(--page-padding) 120px;
}

.hero-card,
.field-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.manage-hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-stage {
  position: relative;
}

.preview-glow {
  position: absolute;
  inset: 18px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.05);
  filter: blur(20px);
}

.preview-media {
  width: 100%;
  aspect-ratio: 1.18;
  border-radius: var(--radius-large);
  overflow: hidden;
  background: linear-gradient(180deg, #dfe0e6, #cfd1d9);
  box-shadow: var(--app-shadow);
}

.preview-media--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #202127, #3b3d46);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-fallback {
  color: rgba(255, 255, 255, 0.88);
  font-size: 54px;
  font-weight: 700;
  line-height: 1;
}

.hero-card {
  padding: 22px;
  border-radius: var(--radius-large);
}

.section-label,
.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.03em;
}

.hero-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.section-head {
  margin-bottom: 14px;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.field-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
}

.field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.field--error {
  box-shadow: inset 0 0 0 1px rgba(199, 68, 68, 0.18);
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.field-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  padding: 0;
  margin-top: -2px;
}

.field-add-btn:active {
  transform: scale(0.96);
}

.field-add-btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.actual-price-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}

.actual-price-block {
  margin-top: 4px;
  border-top: 1px solid rgba(20, 20, 22, 0.08);
  padding-top: 12px;
}

.actual-price-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.unit-date-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.actual-price-toggle__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.actual-price-toggle__title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.actual-price-toggle__desc {
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.actual-price-toggle__arrow {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.actual-price-toggle__arrow--open {
  transform: rotate(180deg);
}

.required {
  color: #c74444;
}

.field input,
.field textarea {
  width: 100%;
  min-height: var(--input-height);
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  padding: 0 14px;
  outline: none;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.field textarea {
  min-height: 132px;
  padding: 14px;
  resize: vertical;
}

.field input::placeholder,
.field textarea::placeholder {
  color: var(--app-placeholder);
}

/* 价格行：input + 积分按钮 */
.price-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.price-row input {
  flex: 1;
  min-width: 0;
}
.points-toggle-btn {
  flex-shrink: 0;
  width: 44px;
  height: var(--input-height);
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--app-surface);
  color: var(--app-placeholder);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  padding: 0;
}
.points-toggle-btn svg {
  width: 22px;
  height: 22px;
}
.points-toggle-btn--active {
  background: color-mix(in srgb, var(--color-accent) 12%, #fff);
  color: var(--color-accent);
}
.points-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.points-input-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}
.points-input-wrap input {
  flex: 1;
  min-width: 0;
  width: auto;
}

.field input:focus,
.field textarea:focus {
  border-color: rgba(20, 20, 22, 0.16);
  background: var(--app-surface);
}

.status-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 6px;
  border-radius: 16px;
  background: var(--app-surface);
}

.status-toggle__option {
  min-height: 42px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.status-toggle__option--active {
  background: #141416;
  color: #ffffff;
}

.field--error input {
  border-color: rgba(199, 68, 68, 0.38);
}

.field-error {
  color: #c74444;
  font-size: 12px;
  line-height: 1.4;
}

.date-field,
.multi-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.date-field:active,
.multi-select__trigger:active {
  transform: scale(0.995);
}

.multi-select__trigger--disabled {
  opacity: 0.7;
}

.multi-select__trigger--disabled:active {
  transform: none;
}

.date-field:focus-visible,
.multi-select--open .multi-select__trigger,
.multi-select__trigger:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.date-field span {
  color: var(--app-text);
  font-size: 16px;
}

.date-field__value--placeholder {
  color: var(--app-placeholder);
}

.date-field--disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.date-field--disabled:active {
  transform: none;
}

.date-field__icon,
.multi-select__arrow,
.multi-select__check {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.multi-select {
  position: relative;
}

.multi-select__content {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.multi-select__placeholder {
  color: var(--app-placeholder);
  font-size: 16px;
}

.multi-select__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}

.multi-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #f1f1f3;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
}

.multi-select__chip-remove {
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1;
}

.multi-select__arrow {
  margin-left: 10px;
  transition: transform 0.18s ease;
}

.multi-select--open .multi-select__arrow {
  transform: rotate(180deg);
}

.multi-select__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 30;
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(20, 20, 22, 0.05);
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.multi-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
}

.multi-select__option:active,
.multi-select__option:hover {
  background: #f5f5f7;
}

.multi-select__option--active {
  background: rgba(20, 20, 22, 0.06);
  font-weight: 600;
}

.multi-select__option--active .multi-select__check {
  stroke: #141416;
}

.multi-select__empty {
  padding: 14px 12px;
  color: var(--app-text-tertiary);
  font-size: 14px;
  text-align: center;
}

.picker-popup {
  overflow: hidden;
}

:global(.picker-popup--center.van-popup--center) {
  width: min(560px, calc(100vw - 64px));
  max-width: calc(100vw - 64px);
  border-radius: 24px;
  overflow: hidden;
}

:deep(.picker-popup .van-picker) {
  --van-picker-background: var(--app-surface);
  --van-picker-toolbar-height: 52px;
  --van-picker-option-font-size: 17px;
  --van-picker-title-font-size: 16px;
  --van-picker-confirm-action-color: var(--app-text);
  --van-picker-cancel-action-color: #8e8e93;
}

:deep(.picker-popup .van-picker__toolbar) {
  padding: 0 8px;
}

:deep(.picker-popup .van-picker__title) {
  font-weight: 600;
}

:deep(.picker-popup .van-picker-column__item) {
  color: var(--app-text-secondary);
}

:deep(.picker-popup .van-picker-column__item--selected) {
  color: var(--app-text);
}

:deep(.picker-popup .van-picker-column) {
  touch-action: pan-y;
}

.select-panel-enter-active,
.select-panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
  transform-origin: top center;
}

.select-panel-enter-from,
.select-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.btn-primary {
  width: 100%;
  height: var(--button-height);
  border: none;
  border-radius: 16px;
  background: #141416;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.btn-primary:active {
  transform: scale(0.96);
  opacity: 0.94;
}

.float-footer {
  position: fixed;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  padding: 0;
  z-index: 40;
  pointer-events: none;
}

.btn-float {
  pointer-events: auto;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(20, 20, 22, 0.28);
}

/* ── 平板：左预览 + 右表单 双栏布局 ── */
@media (min-width: 900px) {
  .editor-form {
    display: grid;
    grid-template-columns: clamp(240px, 36%, 400px) 1fr;
    column-gap: 28px;
    align-items: start;
    padding-top: 20px;
  }

  .manage-hero {
    grid-column: 1;
    grid-row: 1 / 10;
    position: sticky;
    top: 16px;
  }

  .form-section {
    grid-column: 2;
  }
}

/* 下拉选项 hover/active */

:global(html.theme-dark) .multi-select__option:active,
  :global(html.theme-dark) .multi-select__option:hover {
    background: var(--app-surface-soft);
  }
/* 预览图占位背景（无图片时） */
:global(html.theme-dark) .preview-media {
    background: linear-gradient(180deg, #1a1a1e, #252528);
  }
:global(html.theme-dark) .edit-page .date-field,
  :global(html.theme-dark) .edit-page .multi-select__trigger {
    border-color: rgba(255, 255, 255, 0.06);
    background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }
:global(html.theme-dark) .edit-page .date-field:focus-visible,
  :global(html.theme-dark) .edit-page .multi-select--open .multi-select__trigger,
  :global(html.theme-dark) .edit-page .multi-select__trigger:focus-visible {
    border-color: rgba(118, 148, 210, 0.3);
    box-shadow:
      0 0 0 3px rgba(118, 148, 210, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }
:global(html.theme-dark) .edit-page .multi-select__chip {
    border: 1px solid rgba(124, 154, 216, 0.24) !important;
    background: rgba(82, 112, 176, 0.34) !important;
    color: #f3f7ff !important;
  }
:global(html.theme-dark) .edit-page .multi-select__chip-remove {
    background: rgba(255, 255, 255, 0.16) !important;
    color: #f3f7ff !important;
  }
:global(html.theme-dark) .multi-select__panel {
    border-color: rgba(255, 255, 255, 0.06);
    background: rgba(24, 24, 28, 0.82);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
  }
:global(html.theme-dark) .multi-select__option:active,
  :global(html.theme-dark) .multi-select__option:hover,
  :global(html.theme-dark) .multi-select__option--active {
    background: rgba(255, 255, 255, 0.07);
  }
:global(html.theme-dark) :deep(.picker-popup.van-popup),
  :global(html.theme-dark) :deep(.picker-popup.van-popup--bottom) {
    background: rgba(24, 24, 28, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(24px) saturate(150%);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
  }
:global(html.theme-dark) :deep(.picker-popup .van-picker) {
    --van-picker-mask-color:
      linear-gradient(180deg, rgba(24, 24, 28, 0.92), rgba(24, 24, 28, 0)),
      linear-gradient(0deg, rgba(24, 24, 28, 0.92), rgba(24, 24, 28, 0));
  }
:global(html.theme-dark) .btn-primary {
    background: #f5f5f7;
    color: #141416;
  }
:global(html.theme-dark) .btn-float {
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
  }
</style>
