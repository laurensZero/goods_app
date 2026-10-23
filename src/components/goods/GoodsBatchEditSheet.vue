<template>
  <AppSheet
    v-model="showProxy"
    :z-index="210"
    placement="auto"
    sheet-class="batch-edit-popup"
  >
    <div class="batch-edit-sheet">
      <section class="batch-edit-hero">
        <p class="batch-edit-hero__label">{{ t('goods.batch.batchEditLabel') }}</p>
        <h2 class="batch-edit-hero__title">{{ t('goods.batch.modifyItems', { count: selectedCount }) }}</h2>
        <p class="batch-edit-hero__desc">{{ t('goods.batch.onlyAppliedFields') }}</p>
      </section>

      <section class="batch-edit-section">
        <div class="field-card batch-edit-card">
          <button
            v-if="allowMarkOwned"
            type="button"
            class="mark-owned-card"
            :class="{ 'mark-owned-card--active': form.markAsOwned }"
            @click="toggleMarkAsOwned"
          >
            <div class="mark-owned-copy">
              <span class="field-label">{{ t('goods.batch.markAsOwned') }}</span>
              <p class="mark-owned-desc">{{ t('goods.batch.markAsOwnedDesc') }}</p>
            </div>
            <span class="mark-owned-check" aria-hidden="true">
              <svg v-if="form.markAsOwned" viewBox="0 0 24 24" fill="none">
                <path d="M5 13L9 17L19 7" />
              </svg>
            </span>
          </button>

          <div class="field">
            <div class="field-head">
              <span class="field-label">{{ t('goods.batch.starField') }}</span>
            </div>
            <div class="star-toggle-group">
              <button
                type="button"
                class="star-toggle-btn"
                :class="{ 'star-toggle-btn--active': form.starred === 'yes' }"
                @click="form.starred = form.starred === 'yes' ? '' : 'yes'"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2.8l2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.61l-5.4 2.82 1.03-6.02L3.26 9.15l6.04-.88L12 2.8z" />
                </svg>
                {{ t('goods.star.add') }}
              </button>
              <button
                type="button"
                class="star-toggle-btn"
                :class="{ 'star-toggle-btn--active': form.starred === 'no' }"
                @click="form.starred = form.starred === 'no' ? '' : 'no'"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2.8l2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.61l-5.4 2.82 1.03-6.02L3.26 9.15l6.04-.88L12 2.8z" />
                </svg>
                {{ t('goods.star.remove') }}
              </button>
            </div>
            <p class="star-toggle-hint">{{ t('goods.batch.starDesc') }}</p>
          </div>

          <label class="field">
            <div class="field-head">
              <span class="field-label">{{ t('common.category') }}</span>
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('category')">{{ t('goods.batch.quickAdd') }}</button>
            </div>
            <AppSelect v-model="form.category" :options="presets.categories" :placeholder="t('goods.batch.leaveEmptyNoChange')" />
            <QuickPresetCreator
              v-if="quickCreateTarget === 'category'"
              :show="quickCreateTarget === 'category'"
              v-model="quickCategoryName"
              :placeholder="t('goods.batch.inputCategoryName')"
              :maxlength="20"
              :submit-text="t('goods.batch.newCategory')"
              @cancel="closeQuickCreate"
              @submit="submitQuickCategory"
            />
          </label>

          <label class="field">
            <div class="field-head">
              <span class="field-label">IP</span>
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('ip')">{{ t('goods.batch.quickAdd') }}</button>
            </div>
            <AppSelect v-model="form.ip" :options="presets.ips" :placeholder="t('goods.batch.leaveEmptyNoChange')" />
            <QuickPresetCreator
              v-if="quickCreateTarget === 'ip'"
              :show="quickCreateTarget === 'ip'"
              v-model="quickIpName"
              :placeholder="t('goods.batch.inputIpName')"
              :maxlength="40"
              :submit-text="t('goods.batch.newIp')"
              @cancel="closeQuickCreate"
              @submit="submitQuickIp"
            />
          </label>

          <div class="field">
            <div class="field-head">
              <span class="field-label">{{ t('common.character') }}</span>
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('character')">{{ t('goods.batch.quickAdd') }}</button>
            </div>
            <div class="multi-select" :class="{ 'multi-select--open': showCharPicker }">
              <button class="multi-select__trigger" type="button" @click="toggleCharPicker">
                <div class="multi-select__content">
                  <span v-if="form.characters.length === 0" class="multi-select__placeholder">{{ t('goods.batch.leaveEmptyNoChange') }}</span>
                  <div v-else class="multi-select__chips">
                    <span v-for="character in form.characters" :key="character" class="multi-select__chip">
                      {{ character }}
                      <button
                        class="multi-select__chip-remove"
                        type="button"
                        :aria-label="t('common.aria.removeCharacter')"
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
                    <span class="multi-select__option-main">
                      <svg
                        v-if="isFavoriteCharacter(character)"
                        class="multi-select__fav"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                          fill="#f5a623"
                          stroke="#f5a623"
                          stroke-width="1.8"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                      <span>{{ character.name }}</span>
                    </span>
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
                  <div v-if="availableCharacters.length === 0" class="multi-select__empty">{{ t('goods.batch.noCharactersAvailable') }}</div>
                </div>
              </transition>
            </div>

            <QuickPresetCreator
              v-if="quickCreateTarget === 'character'"
              :show="quickCreateTarget === 'character'"
              v-model="quickCharacterName"
              :placeholder="t('goods.batch.inputCharacterName')"
              :maxlength="30"
              :submit-text="t('goods.batch.newCharacter')"
              :secondary-value="quickCharacterIp"
              :secondary-options="quickCharacterIpOptions"
              :secondary-label="form.ip ? t('goods.batch.currentIpLabel') : t('goods.batch.selectCharacterIp')"
              :secondary-placeholder="t('goods.batch.noIp')"
              @update:secondary-value="quickCharacterIp = $event"
              @cancel="closeQuickCreate"
              @submit="submitQuickCharacter"
            />
          </div>

          <label class="field">
            <span class="field-label">{{ t('common.tag') }}</span>
            <TagInput v-model="form.tags" :placeholder="t('goods.batch.leaveEmptyNoChange')" />
          </label>

          <label class="field">
            <span class="field-label">{{ t('goods.editor.collectStatus') }}</span>
            <AppSelect v-model="form.collectStatus" :options="collectStatusOptions" :placeholder="t('goods.batch.leaveEmptyNoChange')" />
            <p class="field-hint">{{ t('goods.batch.collectStatusTimelineHint') }}</p>
          </label>

          <div class="field">
            <div class="field-head">
              <span class="field-label">{{ t('common.storageLocation') }}</span>
            </div>
            <StorageLocationInput
              v-model="form.storageLocation"
              :options="storageLocationOptions"
              :quick-create="true"
              :placeholder="t('goods.batch.leaveEmptyNoChange')"
            />
          </div>

          <label class="field">
            <span class="field-label">{{ t('goods.editor.purchaseDate') }}</span>
            <button class="date-field" type="button" @pointerdown="flushActiveInput" @click="openDatePicker">
              <span :class="{ 'date-field__value--placeholder': !form.acquiredAt }">
                {{ form.acquiredAt || t('goods.batch.leaveEmptyNoChange') }}
              </span>
              <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M8 3V7" />
                <path d="M16 3V7" />
                <path d="M3 10H21" />
              </svg>
            </button>
          </label>

          <label class="field" :class="{ 'field--error': quantityError }">
            <span class="field-label">{{ t('goods.editor.quantity') }}</span>
            <input
              v-model="form.quantity"
              class="field-input"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              :placeholder="t('goods.batch.leaveEmptyNoChange')"
              :aria-invalid="Boolean(quantityError)"
              @keydown="preventQuantityKeys"
              @input="sanitizeQuantityInput"
            />
            <span v-if="quantityError" class="field-error">{{ quantityError }}</span>
          </label>

          <label class="field" :class="{ 'field--error': priceError }">
            <span class="field-label">{{ t('goods.editor.priceLabel') }}（¥）</span>
            <input
              v-model="form.price"
              class="field-input"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :placeholder="t('goods.batch.leaveEmptyNoChange')"
              :aria-invalid="Boolean(priceError)"
              @keydown="preventNegativeInput"
              @input="sanitizePriceInput"
            />
            <span v-if="priceError" class="field-error">{{ priceError }}</span>
          </label>

          <label class="field">
            <span class="field-label">{{ t('goods.editor.shippingFee') }}（¥）</span>
            <input
              v-model="form.shippingFee"
              class="field-input"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :placeholder="t('goods.batch.leaveEmptyNoChange')"
              @keydown="preventNegativeInput"
              @input="sanitizeShippingFeeInput"
            />
          </label>
        </div>
      </section>

      <div class="batch-edit-actions">
        <button class="confirm-btn confirm-btn--ghost" type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="confirm-btn confirm-btn--danger" type="button" :disabled="!canSubmit" @click="apply">
          {{ t('goods.batch.applyChanges') }}
        </button>
      </div>
    </div>
  </AppSheet>

  <AppDatePicker
    v-model:show="showDatePicker"
    v-model="datePickerValue"
    :z-index="220"
    :is-tablet="isTablet"
    :title="t('goods.batch.selectPurchaseDate')"
    :min-date="minDate"
    :max-date="maxDate"
    @confirm="onDateConfirm"
  />
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { normalizeCharacterName, usePresetsStore } from '@/stores/presets'
import { buildCharacterRowId } from '@/utils/presets/characterId'
import { useGoodsStore } from '@/stores/goods'
import { formatDate } from '@/utils/format'
import { validatePrice } from '@/utils/validate'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { useWideViewport } from '@/composables/viewport/useWideViewport'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import StorageLocationInput from '@/components/storage/StorageLocationInput.vue'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'
import TagInput from '@/components/common/TagInput.vue'

const { t } = useI18n()

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
  allowMarkOwned: { type: Boolean, default: false }
})

const emit = defineEmits(['update:show', 'apply'])

const NO_IP_OPTION = '__NO_IP__'

const presets = usePresetsStore()
const goodsStore = useGoodsStore()
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
const showDatePicker = ref(false)
const showCharPicker = ref(false)
const quickCreateTarget = ref('')
const quickCategoryName = ref('')
const quickIpName = ref('')
const quickCharacterName = ref('')
const quickCharacterIp = ref(NO_IP_OPTION)
const priceError = ref('')
const quantityError = ref('')
const form = reactive({
  markAsOwned: false,
  // 星标三态：'' 不修改 / 'yes' 加星标 / 'no' 取消星标
  starred: '',
  category: '',
  ip: '',
  quantity: '',
  price: '',
  acquiredAt: '',
  storageLocation: '',
  characters: [],
  tags: [],
  collectStatus: '',
  shippingFee: ''
})
const collectStatusOptions = computed(() => [
  { label: t('status.pendingShipment'), value: '待发货' },
  { label: t('status.pendingPayment'), value: '待补款' },
  { label: t('status.pendingPostage'), value: '待补邮' },
  { label: t('status.owned'), value: '已拥有' },
  { label: t('status.lost'), value: '丢失' },
  { label: t('status.gifted'), value: '已赠出' },
  { label: t('status.wantToSell'), value: '想出' },
  { label: t('status.sold'), value: '已出' },
  { label: t('status.forSale'), value: '在售' }
])
const datePickerValue = ref(toDatePickerValue(formatDate(new Date(), 'YYYY-MM-DD')))

const showProxy = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const { isWide } = useWideViewport()
const isTablet = isWide

function hasInputValue(value) {
  return value !== '' && value !== null && value !== undefined
}

function preventNegativeInput(event) {
  if (event.key === '-') {
    event.preventDefault()
  }
}

function sanitizePriceInput(event) {
  const rawValue = String(event?.target?.value ?? form.price ?? '')
  if (!rawValue) {
    form.price = ''
    return
  }

  form.price = rawValue.replace(/-/g, '')
}

function sanitizeShippingFeeInput(event) {
  const rawValue = String(event?.target?.value ?? form.shippingFee ?? '')
  if (!rawValue) {
    form.shippingFee = ''
    return
  }

  form.shippingFee = rawValue.replace(/-/g, '')
}

function preventQuantityKeys(event) {
  if (['-', '+', '.', 'e', 'E'].includes(event.key)) {
    event.preventDefault()
  }
}

function sanitizeQuantityInput(event) {
  const rawValue = String(event?.target?.value ?? form.quantity ?? '')
  form.quantity = rawValue.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
}

const canSubmit = computed(() =>
  Boolean(
    form.markAsOwned ||
    form.starred !== '' ||
    form.category ||
    form.ip ||
    hasInputValue(form.quantity) ||
    hasInputValue(form.price) ||
    form.acquiredAt ||
    form.storageLocation ||
    form.characters.length > 0 ||
    form.tags.length > 0 ||
    form.collectStatus ||
    hasInputValue(form.shippingFee)
  ) && !priceError.value && !quantityError.value
)
const storageLocationOptions = computed(() => goodsStore.storageLocations)
const quickCharacterIpOptions = computed(() => {
  if (form.ip) {
    return [{ label: form.ip, value: form.ip }]
  }

  return [
    { label: t('goods.batch.noIp'), value: NO_IP_OPTION },
    ...presets.ips.map((ip) => ({ label: ip, value: ip }))
  ]
})

const availableCharacters = computed(() => {
  const list = form.ip
    ? presets.characters.filter((character) => character.ip === form.ip)
    : [...presets.characters]
  // 收藏 key 是 (ip,name) 复合 id；这里可能列出所有 IP 的角色，必须用各自的 ip
  const favoriteSet = presets.favoriteCharacterSet
  const favKey = (character) => buildCharacterRowId(character.ip, character.name)
  return list.sort((a, b) => Number(favoriteSet.has(favKey(b))) - Number(favoriteSet.has(favKey(a))))
})

function isFavoriteCharacter(character) {
  return presets.favoriteCharacterSet.has(buildCharacterRowId(character?.ip, character?.name))
}

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      resetForm()
      return
    }

    closeNestedPanels()
  }
)

watch(
  () => form.ip,
  (ip) => {
    if (ip) {
      form.characters = form.characters.filter((name) =>
        presets.characters.some((character) => character.name === name && character.ip === ip)
      )
    }

    if (quickCreateTarget.value === 'character') {
      quickCharacterIp.value = ip || NO_IP_OPTION
    }
  }
)

watch(
  () => form.price,
  (value) => {
    const validation = validatePrice(value)
    priceError.value = validation.valid ? '' : validation.message
  }
)

watch(
  () => form.quantity,
  (value) => {
    if (value === '') {
      quantityError.value = ''
      return
    }

    const numeric = Number(value)
    quantityError.value = Number.isInteger(numeric) && numeric >= 1
      ? ''
      : t('goods.batch.invalidQuantity')
  }
)

function resetForm() {
  form.markAsOwned = false
  form.starred = ''
  form.category = ''
  form.ip = ''
  form.quantity = ''
  form.price = ''
  form.acquiredAt = ''
  form.storageLocation = ''
  form.characters = []
  form.tags = []
  form.collectStatus = ''
  form.shippingFee = ''
  priceError.value = ''
  quantityError.value = ''
  closeQuickCreate()
  datePickerValue.value = toDatePickerValue(formatDate(new Date(), 'YYYY-MM-DD'))
  closeNestedPanels()
}

function closeNestedPanels() {
  showDatePicker.value = false
  showCharPicker.value = false
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

function toggleMarkAsOwned() {
  form.markAsOwned = !form.markAsOwned
}

function close() {
  closeNestedPanels()
  closeQuickCreate()
  emit('update:show', false)
}

function openDatePicker() {
  datePickerValue.value = toDatePickerValue(form.acquiredAt)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  form.acquiredAt = `${year}-${month}-${day}`
  datePickerValue.value = [year, month, day]
  showDatePicker.value = false
}

function toggleCharPicker() {
  showCharPicker.value = !showCharPicker.value
}

function toggleChar(name) {
  const idx = form.characters.indexOf(name)
  if (idx >= 0) form.characters.splice(idx, 1)
  else form.characters.push(name)
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

async function apply() {
  if (!canSubmit.value) return

  await commitActiveInput()

  const priceValidation = validatePrice(form.price)
  if (!priceValidation.valid) {
    priceError.value = priceValidation.message
    return
  }

  if (hasInputValue(form.quantity)) {
    const quantityValue = Number(form.quantity)
    if (!Number.isInteger(quantityValue) || quantityValue < 1) {
      quantityError.value = t('goods.batch.invalidQuantity')
      return
    }
  }

  const payload = {}
  if (form.markAsOwned) {
    payload.isWishlist = false
    payload.acquiredAt = form.acquiredAt || formatDate(new Date(), 'YYYY-MM-DD')
    payload.saleAt = ''
    payload.saleReminderEnabled = false
    payload.saleReminderOffsets = []
  }
  if (form.starred) payload.starred = form.starred === 'yes'
  if (form.category) payload.category = form.category
  if (form.ip) payload.ip = form.ip
  if (hasInputValue(form.quantity)) payload.quantity = Math.floor(Number(form.quantity))
  if (hasInputValue(form.price)) payload.price = `${Math.round(Number(form.price) * 100) / 100}`
  if (form.acquiredAt) payload.acquiredAt = form.acquiredAt
  if (form.storageLocation) payload.storageLocation = form.storageLocation
  if (form.characters.length > 0) payload.characters = [...form.characters]
  if (form.tags.length > 0) payload.tags = [...form.tags]
  if (form.collectStatus) payload.collectStatus = form.collectStatus
  if (hasInputValue(form.shippingFee)) payload.shippingFee = `${Math.round(Number(form.shippingFee) * 100) / 100}`
  if (Object.keys(payload).length === 0) return

  emit('apply', payload)
  close()
}

function consumeBack() {
  if (showDatePicker.value) {
    showDatePicker.value = false
    return true
  }

  if (showCharPicker.value) {
    showCharPicker.value = false
    return true
  }

  if (props.show) {
    close()
    return true
  }

  return false
}

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const [fallbackYear, fallbackMonth, fallbackDay] = formatDate(new Date(), 'YYYY-MM-DD').split('-')

  if (!dateString) {
    return [fallbackYear, fallbackMonth, fallbackDay]
  }

  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

defineExpose({
  close,
  consumeBack
})
</script>

<style scoped>
/* 宽屏 center 时覆盖 AppSheet 默认 420px 宽度（原 Popup 为 720px） */
:global(.app-sheet-overlay--center .batch-edit-popup.app-sheet--center) {
  width: min(720px, calc(100vw - 48px)) !important;
}

/* 让内容区撑满 AppSheet 滚动视口，操作栏固定在底部 */
:global(.batch-edit-popup .app-sheet__scroll) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.batch-edit-sheet {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--app-text) 5%, transparent), transparent 42%),
    transparent;
  color: var(--app-text);
}

.batch-edit-hero {
  flex-shrink: 0;
  margin-bottom: 14px;
}

.batch-edit-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 8px;
}

.batch-edit-section::-webkit-scrollbar {
  display: none;
}

.batch-edit-hero__label {
  color: var(--app-text-tertiary);
  font-size: var(--font-body);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.batch-edit-hero__title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.04em;
}

.batch-edit-hero__desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: var(--font-body-lg);
  line-height: 1.6;
}

.batch-edit-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.mark-owned-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--radius-small);
  background: rgba(199, 55, 93, 0.08);
  color: inherit;

  text-align: left;
}

.mark-owned-card--active {
  background: rgba(199, 55, 93, 0.14);
}

.mark-owned-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.mark-owned-desc {
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  line-height: 1.5;
}

.mark-owned-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.5px solid rgba(199, 55, 93, 0.4);
  flex-shrink: 0;
}

.mark-owned-card--active .mark-owned-check {
  background: #c7375d;
  border-color: #c7375d;
  color: #fff;
}

.mark-owned-check svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 星标批量操作：加星 / 取消星标 二选一，都不选 = 不修改 */
.star-toggle-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.star-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1.5px solid rgba(245, 166, 35, 0.35);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  font-weight: 600;
}

.star-toggle-btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
}

.star-toggle-btn--active {
  background: rgba(245, 166, 35, 0.16);
  border-color: #f5a623;
  color: #b87700;
}

.star-toggle-btn--active svg {
  fill: #f5a623;
  stroke: #f5a623;
}

html.theme-dark .star-toggle-btn--active {
  color: #f5a623;
}

.star-toggle-hint {
  color: var(--app-text-tertiary);
  font-size: var(--font-small);
}

.field {
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

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.field-label {
  color: var(--app-text);
  font-size: var(--font-body-lg);
  font-weight: 600;
}

.field-add-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #2070c0;
  font-size: var(--font-small);
  font-weight: 600;
  padding: 0;
}

.field-add-btn:active {
  transform: scale(0.96);
}

.field-input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-medium);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-title);
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.field-input::placeholder {
  color: var(--app-placeholder);
}

.field-input:focus {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 3px var(--app-input-focus-ring);
  outline: none;
}

.field--error .field-input {
  border-color: rgba(199, 68, 68, 0.38);
}

.field-error {
  color: #c74444;
  font-size: var(--font-small);
  line-height: 1.4;
}

.field-hint {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-small);
  line-height: 1.5;
}

.date-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-medium);
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.date-field:active {
  transform: scale(0.98);
}

.date-field:focus-visible {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 3px var(--app-input-focus-ring);
  outline: none;
}

.date-field span {
  color: var(--app-text);
  font-size: var(--font-title);
}

.date-field__value--placeholder {
  color: var(--app-placeholder);
}

.date-field__icon {
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

.multi-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-medium);
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.multi-select__trigger:active {
  transform: scale(0.98);
}

.multi-select--open .multi-select__trigger,
.multi-select__trigger:focus-visible {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 3px var(--app-input-focus-ring);
  outline: none;
}

.multi-select__content {
  display: flex;
  flex: 1;
  min-width: 0;
}

.multi-select__placeholder {
  color: var(--app-placeholder);
  font-size: var(--font-title);
}

.multi-select__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.multi-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  background: var(--app-chip-bg);
  color: var(--app-chip-text);
  font-size: var(--font-body);
  font-weight: 500;
  line-height: 1.2;
}

.multi-select__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: var(--font-small);
  line-height: 1;
}

.multi-select__arrow {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.multi-select--open .multi-select__arrow {
  transform: rotate(180deg);
}

.multi-select__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-panel-bg);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
}

.multi-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--app-text);
  font-size: var(--font-subtitle);
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
}

.multi-select__option-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.multi-select__fav {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.multi-select__option:active {
  background: var(--app-bg);
}

.multi-select__option--active {
  background: var(--app-chip-bg);
  font-weight: 600;
}

.multi-select__check {
  width: 16px;
  height: 16px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: var(--app-text);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.multi-select__empty {
  padding: 14px 12px;
  color: var(--app-text-tertiary);
  font-size: var(--font-body-lg);
  text-align: center;
}

.batch-edit-actions {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: var(--radius-medium);
  font-size: var(--font-subtitle);
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.confirm-btn:active {
  transform: scale(0.96);
}

.confirm-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.confirm-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.confirm-btn--danger {
  background: var(--app-text);
  color: var(--app-surface);
}

/* ── 平板：居中对话框样式 ── */
@media (min-width: 900px) {
  .batch-edit-sheet {
    width: 100%;
  }
}

:global(html.theme-dark .batch-edit-sheet .app-select__value--placeholder) {
    color: var(--app-placeholder) !important;
    font-weight: 500;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__arrow) {
    stroke: var(--app-placeholder) !important;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__panel) {
    border-color: var(--app-panel-border) !important;
    background: var(--app-panel-bg) !important;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42) !important;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__option) {
    color: var(--app-text) !important;
    font-weight: 500;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__option--active) {
    background: rgba(255, 255, 255, 0.10) !important;
    color: var(--app-text) !important;
    font-weight: 600;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__check) {
    stroke: var(--app-text) !important;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__empty) {
    color: var(--app-text-tertiary) !important;
  }

html.theme-dark .mark-owned-card {
    background: rgba(199, 55, 93, 0.14);
  }

html.theme-dark .mark-owned-card--active {
    background: rgba(199, 55, 93, 0.22);
  }

html.theme-dark .mark-owned-check {
    border-color: rgba(255, 255, 255, 0.16);
  }

html.theme-dark .date-field,
  html.theme-dark .multi-select__trigger,
  html.theme-dark .field-input {
    border-color: var(--app-input-border) !important;
    background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass)) !important;
    box-shadow: inset 0 1px 0 var(--app-input-focus-ring) !important;
  }

:global(html.theme-dark .multi-select__chip) {
    border: 1px solid var(--app-chip-accent-border) !important;
    background: var(--app-chip-accent-bg) !important;
    color: var(--app-chip-accent-text) !important;
  }

:global(html.theme-dark .multi-select__chip-remove) {
    background: rgba(255, 255, 255, 0.16) !important;
    color: var(--app-text) !important;
  }
</style>
