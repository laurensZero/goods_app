<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :z-index="210"
    :position="popupPosition"
    round
    class="batch-edit-popup"
  >
    <div class="batch-edit-sheet">
      <div v-if="!isTablet" class="batch-edit-sheet__handle" />

      <section class="batch-edit-hero">
        <p class="batch-edit-hero__label">批量编辑</p>
        <h2 class="batch-edit-hero__title">修改 {{ selectedCount }} 件谷子</h2>
        <p class="batch-edit-hero__desc">只会应用这次填写的字段，留空的内容保持原值。</p>
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
              <span class="field-label">批量标记已入手</span>
              <p class="mark-owned-desc">勾选后会把这些心愿移到收藏；未填写购入日期时自动写入今天。</p>
            </div>
            <span class="mark-owned-check" aria-hidden="true">
              <svg v-if="form.markAsOwned" viewBox="0 0 24 24" fill="none">
                <path d="M5 13L9 17L19 7" />
              </svg>
            </span>
          </button>

          <label class="field">
            <div class="field-head">
              <span class="field-label">分类</span>
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('category')">快速新增</button>
            </div>
            <AppSelect v-model="form.category" :options="presets.categories" placeholder="留空则不修改" />
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
          </label>

          <label class="field">
            <div class="field-head">
              <span class="field-label">IP</span>
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('ip')">快速新增</button>
            </div>
            <AppSelect v-model="form.ip" :options="presets.ips" placeholder="留空则不修改" />
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
          </label>

          <div class="field">
            <div class="field-head">
              <span class="field-label">角色</span>
              <button class="field-add-btn" type="button" @click="toggleQuickCreate('character')">快速新增</button>
            </div>
            <div class="multi-select" :class="{ 'multi-select--open': showCharPicker }">
              <button class="multi-select__trigger" type="button" @click="toggleCharPicker">
                <div class="multi-select__content">
                  <span v-if="form.characters.length === 0" class="multi-select__placeholder">留空则不修改</span>
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
                  <div v-if="availableCharacters.length === 0" class="multi-select__empty">暂无可选角色</div>
                </div>
              </transition>
            </div>

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
              placeholder="留空则不修改"
            />
          </div>

          <label class="field">
            <span class="field-label">购入日期</span>
            <button class="date-field" type="button" @pointerdown="flushActiveInput" @click="openDatePicker">
              <span :class="{ 'date-field__value--placeholder': !form.acquiredAt }">
                {{ form.acquiredAt || '留空则不修改' }}
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
      </section>

      <div class="batch-edit-actions">
        <button class="confirm-btn confirm-btn--ghost" type="button" @click="close">取消</button>
        <button class="confirm-btn confirm-btn--danger" type="button" :disabled="!canSubmit" @click="apply">
          应用修改
        </button>
      </div>
    </div>
  </Popup>

  <Popup
    v-model:show="showDatePicker"
    teleport="body"
    :z-index="220"
    position="bottom"
    round
    class="picker-popup"
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
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { DatePicker, Popup } from 'vant'
import { normalizeCharacterName, usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { formatDate } from '@/utils/format'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import AppSelect from '@/components/common/AppSelect.vue'
import StorageLocationInput from '@/components/storage/StorageLocationInput.vue'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'

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
const form = reactive({
  markAsOwned: false,
  category: '',
  ip: '',
  acquiredAt: '',
  storageLocation: '',
  characters: []
})
const datePickerValue = ref(toDatePickerValue(formatDate(new Date(), 'YYYY-MM-DD')))

const showProxy = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

// 平板响应式：≥ 900px 改为居中对话框
const windowWidth = ref(window.innerWidth)
const _onResize = () => { windowWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', _onResize))
onBeforeUnmount(() => window.removeEventListener('resize', _onResize))
const isTablet = computed(() => windowWidth.value >= 900)
const popupPosition = computed(() => isTablet.value ? 'center' : 'bottom')

const canSubmit = computed(() =>
  Boolean(form.markAsOwned || form.category || form.ip || form.acquiredAt || form.storageLocation || form.characters.length > 0)
)
const storageLocationOptions = computed(() => goodsStore.storageLocations)
const quickCharacterIpOptions = computed(() => {
  if (form.ip) {
    return [{ label: form.ip, value: form.ip }]
  }

  return [
    { label: '不设置 IP', value: NO_IP_OPTION },
    ...presets.ips.map((ip) => ({ label: ip, value: ip }))
  ]
})

const availableCharacters = computed(() =>
  form.ip
    ? presets.characters.filter((character) => character.ip === form.ip)
    : presets.characters
)

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

function resetForm() {
  form.markAsOwned = false
  form.category = ''
  form.ip = ''
  form.acquiredAt = ''
  form.storageLocation = ''
  form.characters = []
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

  const payload = {}
  if (form.markAsOwned) {
    payload.isWishlist = false
    payload.acquiredAt = form.acquiredAt || formatDate(new Date(), 'YYYY-MM-DD')
  }
  if (form.category) payload.category = form.category
  if (form.ip) payload.ip = form.ip
  if (form.acquiredAt) payload.acquiredAt = form.acquiredAt
  if (form.storageLocation) payload.storageLocation = form.storageLocation
  if (form.characters.length > 0) payload.characters = [...form.characters]
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
.batch-edit-popup {
  overflow: hidden;
}

.batch-edit-sheet {
  display: flex;
  flex-direction: column;
  max-height: 90dvh;
  padding: 12px 16px 0;
  background:
    radial-gradient(circle at top, rgba(20, 20, 22, 0.05), transparent 42%),
    #f5f5f7;
}

.batch-edit-sheet__handle {
  width: 42px;
  height: 5px;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.12);
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
  font-size: 13px;
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
  font-size: 14px;
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
  font-size: 13px;
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

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.field-add-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #2070c0;
  font-size: 12px;
  font-weight: 600;
  padding: 0;
}

.field-add-btn:active {
  transform: scale(0.96);
}

.date-field {
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

.date-field:active {
  transform: scale(0.98);
}

.date-field:focus-visible {
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
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
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
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.multi-select__content {
  display: flex;
  flex: 1;
  min-width: 0;
}

.multi-select__placeholder {
  color: var(--app-placeholder);
  font-size: 16px;
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
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text);
  font-size: 13px;
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
  background: rgba(20, 20, 22, 0.12);
  color: var(--app-text-secondary);
  font-size: 12px;
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
  border: 1px solid rgba(20, 20, 22, 0.05);
  border-radius: 18px;
  background: var(--app-surface);
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
  border-radius: 12px;
  background: transparent;
  color: #141416;
  font-size: 15px;
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
}

.multi-select__option:active {
  background: #f5f5f7;
}

.multi-select__option--active {
  background: rgba(20, 20, 22, 0.06);
  font-weight: 600;
}

.multi-select__check {
  width: 16px;
  height: 16px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: #141416;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.multi-select__empty {
  padding: 14px 12px;
  color: #8e8e93;
  font-size: 14px;
  text-align: center;
}

.batch-edit-actions {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
}

.picker-popup {
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

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
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
  background: #141416;
  color: #ffffff;
}

/* ── 平板：居中对话框样式 ── */
@media (min-width: 900px) {
  .batch-edit-sheet {
    width: min(90vw, 600px);
    border-radius: 24px;
    padding-top: 24px;
  }

  .batch-edit-actions {
    padding-bottom: 16px;
  }
}

:global(html.theme-dark) .batch-edit-popup.van-popup {
    --van-popup-background: var(--app-surface);
    background: var(--app-surface) !important;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.42);
    border: none;
  }

:global(html.theme-dark) .batch-edit-sheet {
    background: var(--app-surface) !important;
    color: var(--app-text);
  }

:global(html.theme-dark .batch-edit-sheet .app-select__value--placeholder),
:global(html.theme-dark .batch-edit-sheet .multi-select__placeholder) {
    color: rgba(245, 245, 247, 0.72) !important;
    font-weight: 500;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__arrow),
:global(html.theme-dark .batch-edit-sheet .multi-select__arrow) {
    stroke: rgba(245, 245, 247, 0.72) !important;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__panel),
:global(html.theme-dark .batch-edit-sheet .multi-select__panel) {
    border-color: rgba(255, 255, 255, 0.08) !important;
    background: rgba(24, 24, 28, 0.96) !important;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42) !important;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__option),
:global(html.theme-dark .batch-edit-sheet .multi-select__option) {
    color: #f5f5f7 !important;
    font-weight: 500;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__option--active),
:global(html.theme-dark .batch-edit-sheet .multi-select__option--active) {
    background: rgba(255, 255, 255, 0.10) !important;
    color: #f5f5f7 !important;
    font-weight: 600;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__check),
:global(html.theme-dark .batch-edit-sheet .multi-select__check) {
    stroke: #f5f5f7 !important;
  }

:global(html.theme-dark .batch-edit-sheet .app-select__empty),
:global(html.theme-dark .batch-edit-sheet .multi-select__empty) {
    color: rgba(245, 245, 247, 0.68) !important;
  }

:global(html.theme-dark) .batch-edit-sheet__handle {
    background: rgba(255, 255, 255, 0.15);
  }

:global(html.theme-dark) .mark-owned-card {
    background: rgba(199, 55, 93, 0.14);
  }

:global(html.theme-dark) .mark-owned-card--active {
    background: rgba(199, 55, 93, 0.22);
  }

:global(html.theme-dark) .mark-owned-check {
    border-color: rgba(255, 255, 255, 0.16);
  }

:global(html.theme-dark) .date-field,
  :global(html.theme-dark) .multi-select__trigger {
    border-color: rgba(255, 255, 255, 0.08) !important;
    background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
  }

:global(html.theme-dark .multi-select__panel) {
    border-color: rgba(255, 255, 255, 0.08) !important;
    background: rgba(24, 24, 28, 0.96) !important;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42) !important;
  }

:global(html.theme-dark .multi-select__chip) {
    border: 1px solid rgba(124, 154, 216, 0.30) !important;
    background: #1c3558 !important;
    color: #8ab4f8 !important;
  }

:global(html.theme-dark .multi-select__chip-remove) {
    background: rgba(255, 255, 255, 0.16) !important;
    color: #f5f5f7 !important;
  }

:global(html.theme-dark .multi-select__option) {
    color: #f5f5f7 !important;
  }

:global(html.theme-dark .multi-select__option:active) {
    background: rgba(255, 255, 255, 0.08) !important;
  }

:global(html.theme-dark .multi-select__option--active) {
    background: rgba(255, 255, 255, 0.10) !important;
    color: #f5f5f7 !important;
  }

:global(html.theme-dark .multi-select__check) {
    stroke: #f5f5f7 !important;
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

:global(html.theme-dark) .confirm-btn--danger {
    background: #f5f5f7;
    color: #141416;
  }

  :global(html.theme-dark) .batch-edit-hero {
    color: var(--app-text);
  }

  :global(html.theme-dark) .batch-edit-hero__label {
    color: var(--app-text-secondary);
  }

  :global(html.theme-dark) .batch-edit-hero__title {
    color: var(--app-text);
  }

  :global(html.theme-dark) .batch-edit-hero__desc {
    color: var(--app-text-secondary);
  }
</style>
