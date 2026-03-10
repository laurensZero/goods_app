<template>
  <div class="page page--transition add-page" :class="{ 'page--leaving': isPageLeaving }">
    <NavBar title="添加谷子" show-back />

    <main class="page-body">
      <form class="editor-form" @submit.prevent="handleSubmit">
        <section class="manage-hero">
          <div class="preview-stage">
            <div class="preview-glow" />
            <div class="preview-media" :class="{ 'preview-media--empty': !form.image }">
              <img v-if="form.image" :src="form.image" :alt="form.name || '预览图'" class="preview-image" />
              <span v-else class="preview-fallback">{{ form.name?.trim().charAt(0).toUpperCase() || '谷' }}</span>
            </div>
          </div>

          <article class="hero-card">
            <p class="hero-label">新增收藏</p>
            <h1 class="hero-title">{{ form.name || '记录一件新的收藏' }}</h1>
            <p class="hero-desc">填写基础信息和购买信息，让你的谷子清单保持整洁。</p>
          </article>
        </section>

        <section class="form-section">
          <div class="section-head">
            <p class="section-label">基础信息</p>
            <h2 class="section-title">商品资料</h2>
          </div>

          <div class="field-card">
            <label class="field">
              <span class="field-label">名称 <span class="required">*</span></span>
              <input
                v-model="form.name"
                ref="nameInputRef"
                type="text"
                placeholder="例如：初音未来 手办"
                required
                @input="syncField('name', $event)"
                @blur="syncField('name', $event)"
                @change="syncField('name', $event)"
                @compositionend="syncField('name', $event)"
                @paste="syncFieldLater('name', $event)"
              />
            </label>

            <label class="field">
              <span class="field-label">分类</span>
              <AppSelect v-model="form.category" :options="presets.categories" placeholder="请选择分类" />
            </label>

            <label class="field">
              <span class="field-label">IP</span>
              <AppSelect v-model="form.ip" :options="presets.ips" placeholder="请选择 IP" />
            </label>

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
            </div>

            <div class="field">
              <span class="field-label">图片 URL</span>
              <MihoyoImagePicker
                ref="imagePickerRef"
                v-model="form.image"
                :hint="form.characters[0] || form.variant || ''"
              />
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="section-head">
            <p class="section-label">购入信息</p>
            <h2 class="section-title">价格与时间</h2>
          </div>

          <div class="field-card">
            <label class="field">
              <span class="field-label">购入价格（¥）</span>
              <input v-model="form.price" type="number" min="0" step="0.01" placeholder="0.00" />
            </label>

            <label class="field">              <span class="field-label">数量</span>
              <input v-model.number="form.quantity" type="number" min="1" step="1" placeholder="1" />
            </label>

            <label class="field">              <span class="field-label">购入日期</span>
              <button class="date-field" type="button" @pointerdown="flushActiveInput" @click="openDatePicker">
                <span :class="{ 'date-field__value--placeholder': !form.acquiredAt }">
                  {{ form.acquiredAt || '请选择日期' }}
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
        <button class="btn-primary btn-float" type="button" @pointerdown="flushActiveInput" @click="handleSubmit">保存谷子</button>
      </div>
    </Teleport>

    <Popup v-model:show="showDatePicker" teleport="body" :z-index="2000" position="bottom" round class="picker-popup">
      <DatePicker
        v-model="datePickerValue"
        title="选择购入日期"
        :min-date="minDate"
        :max-date="maxDate"
        @cancel="showDatePicker = false"
        @confirm="onDateConfirm"
      />
    </Popup>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { DatePicker, Popup } from 'vant'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { formatDate } from '@/utils/format'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import { syncFieldValue, syncFieldValueNextFrame } from '@/utils/syncFieldValue'
import NavBar from '@/components/NavBar.vue'
import AppSelect from '@/components/AppSelect.vue'
import MihoyoImagePicker from '@/components/MihoyoImagePicker.vue'

const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()
const { isPageLeaving } = usePageLeaveAnimation()

const form = reactive({
  name: '',
  category: '',
  ip: '',
  characters: [],
  price: '',
  acquiredAt: formatDate(new Date(), 'YYYY-MM-DD'),
  image: '',
  note: '',
  quantity: 1
})

const charactersFieldRef = ref(null)
const nameInputRef = ref(null)
const imagePickerRef = ref(null)
const noteInputRef = ref(null)
const showDatePicker = ref(false)
const showCharPicker = ref(false)
const datePickerValue = ref(toDatePickerValue(form.acquiredAt))
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

const availableCharacters = computed(() =>
  form.ip ? presets.characters.filter((character) => character.ip === form.ip) : []
)

const characterPlaceholder = computed(() => {
  if (!form.ip) return '请先选择 IP'
  if (availableCharacters.value.length === 0) return '该 IP 暂无角色'
  return '请选择角色'
})

watch(
  () => form.ip,
  (ip) => {
    form.characters = form.characters.filter((name) =>
      presets.characters.some((character) => character.name === name && character.ip === ip)
    )
    showCharPicker.value = false
  }
)

async function handleSubmit() {
  await commitActiveInput()
  syncDomFields()
  // 如果用户填了米游铺链接并选中了某款式，使用该款式的封面图 URL
  const pickedImage = imagePickerRef.value?.resolvedUrl
  if (pickedImage) form.image = pickedImage
  await store.addGoods({ ...form })
  router.back()
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
  // imagePickerRef.value.inputRef 经 Vue 组件代理自动 unwrap，直接是 DOM 元素
  const imageInputEl = imagePickerRef.value?.inputRef
  if (imageInputEl) form.image = imageInputEl.value ?? ''
  if (noteInputRef.value) form.note = noteInputRef.value.value ?? ''
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('touchstart', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('touchstart', handleClickOutside)
})
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
  background: #ffffff;
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
  background: #f4f4f6;
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
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
  background: #ffffff;
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

.field input:focus,
.field textarea:focus {
  border-color: rgba(20, 20, 22, 0.16);
  background: #ffffff;
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
  background: #ffffff;
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.date-field:active,
.multi-select__trigger:active {
  transform: scale(0.98);
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
  background: #ffffff;
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

:deep(.picker-popup .van-picker) {
  --van-picker-background: #ffffff;
  --van-picker-toolbar-height: 52px;
  --van-picker-option-font-size: 17px;
  --van-picker-title-font-size: 16px;
  --van-picker-confirm-action-color: #141416;
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
  z-index: 40;
  pointer-events: none;
}

.btn-float {
  pointer-events: auto;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(20, 20, 22, 0.28);
}

</style>
