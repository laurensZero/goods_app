<template>
  <div
    class="page event-add-page"
    :class="{ 'event-add-page--navigating': isNavigatingToPicker, 'event-add-page--restoring': !pageDisplayReady }"
  >
    <main class="page-body">
      <NavBar :title="isEdit ? t('events.addEdit.editTitle') : t('events.addEdit.addTitle')" show-back />
      <form class="editor-form" @submit.prevent="handleSubmit">
        <section class="editor-shell">
          <aside class="preview-column">
            <div class="preview-stage">
              <div class="preview-stage__glow" />
              <div class="preview-card" :class="{ 'preview-card--empty': !form.coverImage }">
                <LazyCachedImage
                  v-if="form.coverImage"
                  :src="form.coverImage"
                  :alt="form.name || t('events.addEdit.eventCover')"
                  :lazy="false"
                  :image-attrs="{ class: 'preview-card__image' }"
                />
                <span v-else class="preview-card__fallback">{{ form.name?.trim().charAt(0).toUpperCase() || t('goods.heroFallbackEvent') }}</span>
              </div>

              <article class="preview-copy-card">
                <p class="preview-copy-card__label">{{ isEdit ? t('events.addEdit.editLabel') : t('events.addEdit.newLabel') }}</p>
                <h1 class="preview-copy-card__title">{{ heroTitle }}</h1>
                <p class="preview-copy-card__desc">{{ t('events.addEdit.heroDesc') }}</p>
              </article>
            </div>
          </aside>

            <section class="form-column">
              <section class="hero-panel">
                <article class="hero-panel__card">
                  <p class="hero-panel__label">{{ isEdit ? t('events.addEdit.editLabel') : t('events.addEdit.newLabel') }}</p>
                  <h2 class="hero-panel__title">{{ heroTitle }}</h2>
                  <div class="hero-panel__metrics">
                    <div class="metric-box">
                      <span class="metric-box__label">{{ t('events.addEdit.linkedGoodsCount') }}</span>
                      <strong class="metric-box__value">{{ linkedGoodsList.length }}</strong>
                    </div>
                  <div class="metric-box">
                    <span class="metric-box__label">{{ t('events.addEdit.eventPhotos') }}</span>
                    <strong class="metric-box__value">{{ form.photos.length }}</strong>
                  </div>
                  <div v-if="form.type === 'concert'" class="metric-box">
                    <span class="metric-box__label">{{ t('events.addEdit.tracks') }}</span>
                    <strong class="metric-box__value">{{ form.tracks.length }}</strong>
                  </div>
                  </div>
                </article>
              </section>

              <section class="form-section form-section--tabs">
                <FormTabNav v-model="activeTab" :tabs="tabItems" class="form-tab-nav" />

                <div class="form-tab-content">
                  <section v-show="activeTab === 'basic'" class="tab-panel">
                    <div class="section-head">
                      <p class="section-label">Basics</p>
                      <h2 class="section-title">{{ t('events.addEdit.basicInfo') }}</h2>
                    </div>

                    <div class="field-card">
                      <div class="field-grid">
                        <label class="field field--full field--tablet-half" :class="{ 'field--error': nameError }">
                          <span class="field-label">{{ t('events.addEdit.eventName') }} <span class="required">*</span></span>
                          <input
                            v-model="form.name"
                            ref="nameInputRef"
                            type="text"
                            :placeholder="t('events.addEdit.eventNamePlaceholder')"
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

                        <div class="field field--half">
                          <span class="field-label">{{ t('events.addEdit.eventType') }}</span>
                          <AppSelect v-model="form.type" :options="typeOptions" :placeholder="t('events.addEdit.eventTypePlaceholder')" />
                        </div>

                        <div class="field field--full">
                          <span class="field-label">{{ t('events.addEdit.customTags') }}</span>
                          <TagInput v-model="form.tags" :placeholder="t('events.addEdit.customTagsPlaceholder')" />
                        </div>

                        <div class="field field--full">
                          <span class="field-label">{{ t('events.addEdit.eventCover') }}</span>
                          <button type="button" class="media-picker" @click="pickCoverImage">
                            <div class="media-picker__preview" :class="{ 'media-picker__preview--empty': !form.coverImage }">
                              <LazyCachedImage
                                v-if="form.coverImage"
                                :src="form.coverImage"
                                :alt="t('events.addEdit.eventCover')"
                                :lazy="false"
                                :image-attrs="{ class: 'media-picker__preview-img' }"
                              />
                              <span v-else>{{ t('events.addEdit.eventCover') }}</span>
                            </div>
                            <div class="media-picker__copy">
                              <strong>{{ form.coverImage ? t('events.addEdit.changeCover') : t('events.addEdit.selectCover') }}</strong>
                              <span>{{ t('events.addEdit.coverHint') }}</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section v-show="activeTab === 'schedule'" class="tab-panel">
                    <div class="section-head">
                      <p class="section-label">Schedule</p>
                      <h2 class="section-title">{{ t('events.addEdit.timeAndLocation') }}</h2>
                    </div>

                    <div class="field-card">
                      <div class="field-grid">
                        <label class="field field--half">
                          <span class="field-label">{{ t('events.addEdit.startDate') }}</span>
                          <button class="date-field" type="button" @click="openDatePicker('start')">
                            <span :class="{ 'date-field__value--placeholder': !form.startDate }">
                              {{ form.startDate || t('events.addEdit.selectDate') }}
                            </span>
                            <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <rect x="3" y="5" width="18" height="16" rx="3" />
                              <path d="M8 3V7" />
                              <path d="M16 3V7" />
                              <path d="M3 10H21" />
                            </svg>
                          </button>
                        </label>

                        <label class="field field--half">
                          <span class="field-label">{{ t('events.addEdit.endDate') }}</span>
                          <button class="date-field" type="button" @click="openDatePicker('end')">
                            <span :class="{ 'date-field__value--placeholder': !form.endDate }">
                              {{ form.endDate || (form.startDate || t('events.addEdit.defaultToStart')) }}
                            </span>
                            <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <rect x="3" y="5" width="18" height="16" rx="3" />
                              <path d="M8 3V7" />
                              <path d="M16 3V7" />
                              <path d="M3 10H21" />
                            </svg>
                          </button>
                        </label>

                        <label class="field field--full">
                          <span class="field-label">{{ t('events.addEdit.location') }}</span>
                          <input
                            v-model="form.location"
                            type="text"
                            :placeholder="t('events.addEdit.locationPlaceholder')"
                            @input="syncField('location', $event)"
                            @blur="syncField('location', $event)"
                            @change="syncField('location', $event)"
                            @compositionend="syncField('location', $event)"
                            @paste="syncFieldLater('location', $event)"
                          />
                        </label>
                      </div>
                    </div>
                  </section>

                  <section v-show="activeTab === 'ticket'" class="tab-panel">
                    <div class="section-head">
                      <p class="section-label">Ticket & Goods</p>
                      <h2 class="section-title">{{ t('events.addEdit.ticketAndGoods') }}</h2>
                    </div>

                    <div class="field-card">
                      <div class="field-grid">
                        <label class="field field--half" :class="{ 'field--error': ticketPriceError }">
                          <span class="field-label">{{ t('events.addEdit.ticketPrice') }}</span>
                          <input
                            v-model="form.ticketPrice"
                            ref="ticketPriceInputRef"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0.00"
                            :aria-invalid="Boolean(ticketPriceError)"
                          />
                          <span v-if="ticketPriceError" class="field-error">{{ ticketPriceError }}</span>
                        </label>

                        <div class="field field--full expense-section">
                          <div class="expense-section__head">
                            <div>
                              <span class="field-label">{{ t('events.addEdit.otherExpenses') }}</span>
                              <p class="expense-section__hint">{{ t('events.addEdit.otherExpensesHint') }}</p>
                            </div>
                            <button type="button" class="outline-action outline-action--compact" @click="addOtherExpense">
                              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 5V19" />
                                <path d="M5 12H19" />
                              </svg>
                              <span>{{ t('events.addEdit.addExpense') }}</span>
                            </button>
                          </div>

                          <div v-if="form.otherExpenses.length > 0" class="expense-list">
                            <article v-for="(expense, index) in form.otherExpenses" :key="expense.id || index" class="expense-item">
                              <div class="expense-item__grid">
                                <label class="field field--half" :class="{ 'field--error': otherExpenseValidation[index]?.nameError }">
                                  <span class="field-label">{{ t('events.addEdit.expenseName') }}</span>
                                  <input
                                    :value="expense.name"
                                    type="text"
                                    :placeholder="t('events.addEdit.expenseNamePlaceholder')"
                                    @input="updateOtherExpenseField(index, 'name', $event)"
                                  />
                                  <span v-if="otherExpenseValidation[index]?.nameError" class="field-error">{{ otherExpenseValidation[index].nameError }}</span>
                                </label>

                                <label class="field field--half" :class="{ 'field--error': otherExpenseValidation[index]?.amountError }">
                                  <span class="field-label">{{ t('events.addEdit.expenseAmount') }}</span>
                                  <input
                                    :value="expense.amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    @input="updateOtherExpenseField(index, 'amount', $event)"
                                  />
                                  <span v-if="otherExpenseValidation[index]?.amountError" class="field-error">{{ otherExpenseValidation[index].amountError }}</span>
                                </label>
                              </div>

                              <button type="button" class="expense-item__remove" @click="removeOtherExpense(index)">{{ t('events.addEdit.deleteExpense') }}</button>
                            </article>
                          </div>
                          <p v-else class="expense-section__empty">{{ t('events.addEdit.otherExpensesEmpty') }}</p>
                        </div>

                        <label v-if="form.type === 'exhibition'" class="field field--half">
                          <span class="field-label">{{ t('events.addEdit.ticketType') }}</span>
                          <input
                            v-model="form.ticketType"
                            type="text"
                            :placeholder="t('events.addEdit.ticketTypePlaceholder')"
                            @input="syncField('ticketType', $event)"
                            @blur="syncField('ticketType', $event)"
                            @change="syncField('ticketType', $event)"
                            @compositionend="syncField('ticketType', $event)"
                            @paste="syncFieldLater('ticketType', $event)"
                          />
                        </label>

                        <label v-if="form.type === 'concert'" class="field field--half">
                          <span class="field-label">{{ t('events.addEdit.seat') }}</span>
                          <input
                            v-model="form.seatInfo"
                            type="text"
                            :placeholder="t('events.addEdit.seatPlaceholder')"
                            @input="syncField('seatInfo', $event)"
                            @blur="syncField('seatInfo', $event)"
                            @change="syncField('seatInfo', $event)"
                            @compositionend="syncField('seatInfo', $event)"
                            @paste="syncFieldLater('seatInfo', $event)"
                          />
                        </label>

                        <div class="field field--full">
                          <span class="field-label">{{ t('events.addEdit.linkedGoods') }}</span>

                          <div v-if="linkedGoodsList.length > 0" class="linked-goods">
                            <div v-for="goods in linkedGoodsList" :key="goods.id" class="linked-goods__item">
                              <LazyCachedImage
                                v-if="goods.coverImage"
                                :src="goods.coverImage"
                                :alt="goods.name"
                                class="linked-goods__thumb"
                              />
                              <div v-else class="linked-goods__thumb linked-goods__thumb--empty">{{ goods.name?.charAt(0) || t('goods.heroFallbackGoods') }}</div>
                              <span class="linked-goods__name">{{ goods.name }}</span>
                              <button type="button" class="linked-goods__remove" @click="removeLinkedGoods(goods.id)">×</button>
                            </div>
                          </div>

                          <button type="button" class="outline-action" @click="openGoodsPicker">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M12 5V19" />
                              <path d="M5 12H19" />
                            </svg>
                            <span>{{ linkedGoodsList.length > 0 ? t('events.addEdit.continueAddGoods') : t('events.addEdit.selectGoods') }}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section v-show="activeTab === 'gallery'" class="tab-panel">
                    <div class="section-head">
                      <p class="section-label">Gallery & Notes</p>
                      <h2 class="section-title">{{ t('events.addEdit.photosAndNotes') }}</h2>
                    </div>

                    <div class="field-card">
                      <div class="field-grid">
                        <div class="field field--full">
                          <span class="field-label">{{ t('events.addEdit.eventPhotosLabel') }}</span>
                          <div class="photo-upload-grid">
                            <button type="button" class="photo-upload__add" @click="pickPhoto">
                              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 5V19" />
                                <path d="M5 12H19" />
                              </svg>
                            </button>

                            <div v-for="(photo, index) in form.photos" :key="photo.id || index" class="photo-upload__item">
                              <LazyCachedImage
                                :src="photo.uri"
                                :alt="photo.caption || `${t('events.addEdit.eventPhotosLabel')} ${index + 1}`"
                                :image-attrs="{ class: 'photo-upload__img' }"
                              />
                              <button type="button" class="photo-upload__remove" @click="removePhoto(index)">×</button>
                            </div>
                          </div>
                        </div>

                        <label class="field field--full field--textarea">
                          <span class="field-label">{{ t('events.addEdit.notes') }}</span>
                          <textarea
                            v-model="form.description"
                            ref="descInputRef"
                            rows="5"
                            :placeholder="t('events.addEdit.notesPlaceholder')"
                            @input="syncField('description', $event)"
                            @blur="syncField('description', $event)"
                            @change="syncField('description', $event)"
                            @compositionend="syncField('description', $event)"
                            @paste="syncFieldLater('description', $event)"
                          ></textarea>
                        </label>
                      </div>
                    </div>
                  </section>

                  <section v-if="form.type === 'concert'" v-show="activeTab === 'music'" class="tab-panel">
                    <div class="section-head">
                      <p class="section-label">Setlist</p>
                      <h2 class="section-title">{{ t('events.addEdit.concertSetlist') }}</h2>
                    </div>

                    <div class="field-card">
                      <EventTrackEditor v-model="form.tracks" />
                    </div>
                  </section>
                </div>
              </section>
            </section>
        </section>
      </form>
    </main>

    <Teleport to="body">
      <div class="float-footer">
        <button class="btn-primary btn-float" type="button" @pointerdown="flushActiveInput" @click="handleSubmit">{{ isEdit ? t('events.addEdit.saveEdit') : t('events.addEdit.saveNew') }}</button>
      </div>
    </Teleport>

    <AppDatePicker
      v-model:show="showDatePicker"
      v-model="datePickerValue"
      :z-index="2000"
      :is-tablet="isTabletViewport"
      :title="datePickerTarget === 'start' ? t('events.addEdit.selectStartDate') : t('events.addEdit.selectEndDate')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onDateConfirm"
    />

  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeMount, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { Capacitor } from '@capacitor/core'
import { pickLinkedLocalImage } from '@/utils/image/localImage'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'

// ...
import { useEventsStore } from '@/stores/events'
import { useGoodsStore } from '@/stores/goods'
import { formatDate } from '@/utils/format'
import { readEventLinkedGoodsPickerResult } from '@/utils/eventLinkedGoodsPicker'
import { syncFieldValue, syncFieldValueNextFrame } from '@/utils/sync/fieldValue'
import { validateName as validateTextName, validatePrice as validateNumericPrice } from '@/utils/validate'
import { useTabletViewport } from '@/composables/useTabletViewport'
import NavBar from '@/components/common/NavBar.vue'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import TagInput from '@/components/common/TagInput.vue'
import EventTrackEditor from '@/components/events/EventTrackEditor.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import FormTabNav from '@/components/goods/FormTabNav.vue'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'EventAddView' })

const { t } = useI18n()

const props = defineProps({
  id: { type: String, default: '' }
})

const typeOptions = computed(() => [
  { label: t('events.typeExhibition'), value: 'exhibition' },
  { label: t('events.typeConcert'), value: 'concert' },
  { label: t('events.typeOther'), value: 'other' }
])

const router = useRouter()
const route = useRoute()
const eventsStore = useEventsStore()
const goodsStore = useGoodsStore()

const EVENT_ADD_SCROLL_LOCK_CLASS = 'event-add-scroll-lock'
const EVENT_ADD_DRAFT_KEY = 'goods-app:event-add-draft'

function syncEventAddScrollLock(active) {
  document.documentElement.classList.toggle(EVENT_ADD_SCROLL_LOCK_CLASS, active)
  document.body.classList.toggle(EVENT_ADD_SCROLL_LOCK_CLASS, active)
}

const form = reactive({
  name: '',
  type: '',
  startDate: '',
  endDate: '',
  location: '',
  description: '',
  coverImage: '',
  photos: [],
  tracks: [],
  ticketPrice: '',
  ticketType: '',
  seatInfo: '',
  otherExpenses: [],
  linkedGoodsIds: [],
  tags: []
})

const isEdit = computed(() => !!props.id || !!route.params.id)
const editId = computed(() => props.id || route.params.id)
const heroTitle = computed(() => {
  if (form.name) return form.name
  return isEdit.value ? t('events.addEdit.editHeroTitle') : t('events.addEdit.newHeroTitle')
})

const nameError = ref('')
const nameInputRef = ref(null)
const ticketPriceError = ref('')
const ticketPriceInputRef = ref(null)
const descInputRef = ref(null)
const showDatePicker = ref(false)
const datePickerValue = ref([])
const datePickerTarget = ref('start')
const isNavigatingToPicker = ref(false)
const pageDisplayReady = ref(true)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
const { isTabletViewport, updateViewport } = useTabletViewport()

const activeTab = ref('basic')
const tabItems = computed(() => {
  const items = [
    { key: 'basic', label: t('events.addEdit.basics'), badge: Boolean(nameError.value || !String(form.name || '').trim()) },
    { key: 'schedule', label: t('events.addEdit.schedule') },
    { key: 'ticket', label: t('events.addEdit.ticketGoods'), badge: Boolean(ticketPriceError.value || hasOtherExpenseValidationError.value) },
    { key: 'gallery', label: t('events.addEdit.galleryNotes') }
  ]

  if (form.type === 'concert') {
    items.push({ key: 'music', label: t('events.addEdit.tracks') })
  }

  return items
})

const linkedGoodsList = computed(() =>
  form.linkedGoodsIds.map((id) => goodsStore.getById(id)).filter(Boolean)
)

function buildOtherExpenseRow() {
  return {
    id: `expense_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    amount: ''
  }
}

function normalizeOtherExpenseRow(item = {}) {
  return {
    id: String(item.id || `expense_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    name: String(item.name || '').trim(),
    amount: String(item.amount || '').trim()
  }
}

function sanitizeOtherExpenses(expenses) {
  return (Array.isArray(expenses) ? expenses : [])
    .map((item) => normalizeOtherExpenseRow(item))
    .filter((item) => item.name || item.amount)
}

const otherExpenseValidation = computed(() => (
  form.otherExpenses.map((expense) => {
    const name = String(expense?.name || '').trim()
    const amount = String(expense?.amount || '').trim()

    if (!name && !amount) {
      return { nameError: '', amountError: '' }
    }

    const amountResult = amount ? validateNumericPrice(amount) : { valid: false, message: t('events.addEdit.priceRequired') }
    return {
      nameError: name ? '' : t('events.addEdit.expenseNameRequired'),
      amountError: amountResult.valid ? '' : amountResult.message
    }
  })
))

const hasOtherExpenseValidationError = computed(() => (
  otherExpenseValidation.value.some((item) => item.nameError || item.amountError)
))

function setActiveTab(tabKey, options = {}) {
  if (!tabItems.value.some((item) => item.key === tabKey)) return
  activeTab.value = tabKey
  if (options.scroll === false) return
  nextTick(() => {
    const scrollRoot = document.querySelector('.event-add-page .page-body')
    scrollToTopAnimated(() => scrollRoot, 220)
  })
}

function buildDraftPayload() {
  return {
    routeKey: route.fullPath,
    mode: isEdit.value ? 'edit' : 'add',
    editId: editId.value ? String(editId.value) : '',
    form: {
      name: String(form.name || ''),
      type: String(form.type || ''),
      startDate: String(form.startDate || ''),
      endDate: String(form.endDate || ''),
      location: String(form.location || ''),
      description: String(form.description || ''),
      coverImage: String(form.coverImage || ''),
      photos: Array.isArray(form.photos) ? form.photos.map((item) => ({ ...item })) : [],
      tracks: Array.isArray(form.tracks) ? form.tracks.map((item) => ({ ...item })) : [],
      ticketPrice: String(form.ticketPrice || ''),
      ticketType: String(form.ticketType || ''),
      seatInfo: String(form.seatInfo || ''),
      otherExpenses: Array.isArray(form.otherExpenses) ? form.otherExpenses.map((item) => ({ ...item })) : [],
      linkedGoodsIds: Array.isArray(form.linkedGoodsIds) ? [...form.linkedGoodsIds] : [],
      tags: Array.isArray(form.tags) ? [...form.tags] : []
    }
  }
}

function applyFormSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return
  form.name = String(snapshot.name || '')
  form.type = String(snapshot.type || '')
  form.startDate = String(snapshot.startDate || '')
  form.endDate = String(snapshot.endDate || '')
  form.location = String(snapshot.location || '')
  form.description = String(snapshot.description || '')
  form.coverImage = String(snapshot.coverImage || '')
  form.photos = Array.isArray(snapshot.photos) ? snapshot.photos.map((item) => ({ ...item })) : []
  form.tracks = Array.isArray(snapshot.tracks) ? snapshot.tracks.map((item) => ({ ...item })) : []
  form.ticketPrice = String(snapshot.ticketPrice || '')
  form.ticketType = String(snapshot.ticketType || '')
  form.seatInfo = String(snapshot.seatInfo || '')
  form.otherExpenses = Array.isArray(snapshot.otherExpenses) ? snapshot.otherExpenses.map((item) => normalizeOtherExpenseRow(item)) : []
  form.linkedGoodsIds = Array.isArray(snapshot.linkedGoodsIds) ? [...snapshot.linkedGoodsIds] : []
  form.tags = Array.isArray(snapshot.tags) ? [...snapshot.tags] : []
}

function saveDraftForPicker() {
  sessionStorage.setItem(EVENT_ADD_DRAFT_KEY, JSON.stringify(buildDraftPayload()))
}

function restoreDraftFromPicker() {
  const raw = sessionStorage.getItem(EVENT_ADD_DRAFT_KEY)
  if (!raw) return false

  sessionStorage.removeItem(EVENT_ADD_DRAFT_KEY)

  try {
    const parsed = JSON.parse(raw)
    const mode = isEdit.value ? 'edit' : 'add'
    const currentEditId = editId.value ? String(editId.value) : ''
    if (parsed?.routeKey !== route.fullPath) return false
    if (parsed?.mode !== mode) return false
    if (String(parsed?.editId || '') !== currentEditId) return false
    applyFormSnapshot(parsed.form)
    return true
  } catch {
    return false
  }
}

function applyPickerSelectionResult() {
  const pickerResult = readEventLinkedGoodsPickerResult()
  if (pickerResult) {
    form.linkedGoodsIds = [...pickerResult]
    return true
  }
  return false
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
  () => form.ticketPrice,
  (value) => {
    if (validateNumericPrice(value).valid) {
      ticketPriceError.value = ''
    }
  }
)

watch(
  () => form.type,
  () => {
    if (form.type !== 'concert' && activeTab.value === 'music') {
      activeTab.value = 'basic'
    }
  }
)

watch(
  tabItems,
  (items) => {
    if (!items.some((item) => item.key === activeTab.value)) {
      activeTab.value = items[0]?.key || 'basic'
    }
  },
  { immediate: true }
)

// Do not persist event editor tab to sessionStorage; always default to 'basic'.

async function loadEditData() {
  if (!isEdit.value) return
  const id = editId.value
  const existing = eventsStore.getById(id)
  if (!existing) return

  form.name = existing.name || ''
  form.type = existing.type || ''
  form.startDate = existing.startDate || ''
  form.endDate = existing.endDate || ''
  form.location = existing.location || ''
  form.description = existing.description || ''
  form.coverImage = existing.coverImage || ''
  form.photos = existing.photos ? [...existing.photos] : []
  form.tracks = Array.isArray(existing.tracks) ? existing.tracks.map((item) => ({ ...item })) : []
  form.ticketPrice = existing.ticketPrice || ''
  form.ticketType = existing.ticketType || ''
  form.seatInfo = existing.seatInfo || ''
  form.otherExpenses = Array.isArray(existing.otherExpenses) ? existing.otherExpenses.map((item) => normalizeOtherExpenseRow(item)) : []
  form.linkedGoodsIds = existing.linkedGoodsIds ? [...existing.linkedGoodsIds] : []
  form.tags = existing.tags ? [...existing.tags] : []
}

function validateName() {
  const result = validateTextName(form.name, { label: t('events.addEdit.eventName') })
  if (result.valid) {
    nameError.value = ''
    return true
  }
  nameError.value = result.message
  nameInputRef.value?.focus?.()
  nameInputRef.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  return false
}

function validateTicketPrice() {
  const result = validateNumericPrice(form.ticketPrice)
  if (result.valid) {
    ticketPriceError.value = ''
    return true
  }

  ticketPriceError.value = result.message
  ticketPriceInputRef.value?.focus?.()
  ticketPriceInputRef.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  return false
}

function addOtherExpense() {
  form.otherExpenses.push(buildOtherExpenseRow())
}

function removeOtherExpense(index) {
  form.otherExpenses.splice(index, 1)
}

function updateOtherExpenseField(index, key, event) {
  const nextValue = String(event?.target?.value || '')
  form.otherExpenses = form.otherExpenses.map((item, currentIndex) => (
    currentIndex === index
      ? { ...item, [key]: nextValue }
      : item
  ))
}

function getReturnToRoute() {
  const value = route.query.returnTo
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed || ''
}

async function handleSubmit() {
  await commitActiveInput()
  form.name = String(form.name || '').trim()
  if (!validateName()) {
    setActiveTab('basic', { scroll: false })
    return
  }
  if (!validateTicketPrice()) {
    setActiveTab('ticket', { scroll: false })
    return
  }
  if (hasOtherExpenseValidationError.value) {
    setActiveTab('ticket', { scroll: false })
    return
  }

  if (!form.endDate && form.startDate) {
    form.endDate = form.startDate
  }

  if (form.type !== 'exhibition') {
    form.ticketType = ''
  }
  if (form.type !== 'concert') {
    form.seatInfo = ''
  }

  const payload = {
    ...form,
    otherExpenses: sanitizeOtherExpenses(form.otherExpenses)
  }
  let addedRecord = null
  if (isEdit.value) {
    await eventsStore.updateEventRecord(editId.value, payload)
  } else {
    addedRecord = await eventsStore.addEventRecord(payload)
    // 确保列表页面能立刻看到新增项：刷新 store 列表以同步来源数据库
    try {
      await eventsStore.refreshList()
    } catch (e) {
      // ignore
    }
  }
  sessionStorage.removeItem(EVENT_ADD_DRAFT_KEY)
  const fallbackTarget = isEdit.value ? `/events/${editId.value}` : '/events'
  const targetPath = getReturnToRoute() || fallbackTarget
  runWithRouteTransition(
    () => router.replace(targetPath),
    { direction: 'back' }
  )
}

function openDatePicker(target) {
  datePickerTarget.value = target
  const dateStr = target === 'start' ? form.startDate : (form.endDate || form.startDate)
  datePickerValue.value = toDatePickerValue(dateStr)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  const dateStr = `${year}-${month}-${day}`
  if (datePickerTarget.value === 'start') {
    form.startDate = dateStr
    if (!form.endDate) form.endDate = dateStr
  } else {
    form.endDate = dateStr
  }
  showDatePicker.value = false
}

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const [fallbackYear, fallbackMonth, fallbackDay] = formatDate(new Date(), 'YYYY-MM-DD').split('-')
  if (!dateString) return [fallbackYear, fallbackMonth, fallbackDay]
  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

async function pickCoverImage() {
  try {
    const result = await pickLinkedLocalImage()
    if (result?.uri) {
      form.coverImage = result.uri
    }
  } catch {
    // user cancelled
  }
}

async function pickPhoto() {
  try {
    const result = await pickLinkedLocalImage()
    if (result?.uri) {
      form.photos.push({
        id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        uri: result.uri,
        caption: ''
      })
    }
  } catch {
    // user cancelled
  }
}

function removePhoto(index) {
  form.photos.splice(index, 1)
}

function removeLinkedGoods(id) {
  form.linkedGoodsIds = form.linkedGoodsIds.filter((gid) => gid !== id)
}

async function openGoodsPicker() {
  saveDraftForPicker()
  isNavigatingToPicker.value = true
  await nextTick()
  runWithRouteTransition(
    () => router.push({
      name: 'event-link-goods',
      query: {
        selected: form.linkedGoodsIds.join(','),
        returnTo: route.fullPath
      }
    }),
    { direction: 'forward' }
  )
}

function syncField(key, event) {
  syncFieldValue(form, key, event)
}

function syncFieldLater(key, event) {
  syncFieldValueNextFrame(form, key, event)
}

onBeforeMount(() => {
  scrollToTopAnimated(() => null, 0)
  try {
    // Always default to 'basic' when entering event add/edit so the
    // user starts at 基础信息 instead of restoring a previously selected tab.
    activeTab.value = 'basic'
  } catch {
    // ignore
  }
})

onMounted(() => {
  syncEventAddScrollLock(true)
  updateViewport()

  // Prefer instant first paint: warm stores in background instead of blocking route enter.
  void (async () => {
    if (!eventsStore.isReady) {
      await eventsStore.init()
    }
    if (!goodsStore.isReady) {
      await goodsStore.init()
    }

    if (isEdit.value && !String(form.name || '').trim()) {
      await loadEditData()
    }
  })()

  void loadEditData()
  restoreDraftFromPicker()
  applyPickerSelectionResult()
  isNavigatingToPicker.value = false
})

onActivated(async () => {
  isNavigatingToPicker.value = false
  restoreDraftFromPicker()
  if (applyPickerSelectionResult()) {
    setActiveTab('ticket', { scroll: false })
  }
})

onDeactivated(() => {
  // keep view visible state stable; entering the page should feel instant.
})

onBeforeUnmount(() => {
  syncEventAddScrollLock(false)
})
</script>

<style scoped>
.event-add-page {
  height: 100dvh;
  overflow: hidden;
  background: var(--app-bg-gradient);
}

.event-add-page--navigating {
  visibility: hidden;
}

.event-add-page--restoring {
  visibility: hidden;
}

.event-add-page .page-body {
  padding: 0 0 120px;
  overscroll-behavior-y: contain;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.editor-form {
  width: min(100%, 2048px);
  margin: 0 auto;
  padding: 0 var(--page-padding);
}

.event-add-page .page-body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.editor-shell {
  display: grid;
  gap: 22px;
}

.preview-column,
.form-column {
  min-width: 0;
}

.preview-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-stage__glow {
  position: absolute;
  inset: 40px 16px auto;
  height: 220px;
  border-radius: 999px;
  background: rgba(80, 90, 120, 0.08);
  filter: blur(28px);
  pointer-events: none;
}

.preview-card {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 32px;
  overflow: hidden;
  background: linear-gradient(180deg, #2a2d35, #1d2028);
  box-shadow: var(--app-shadow);
}

.preview-card--empty {
  background: linear-gradient(180deg, #2c2f38, #242731);
}

.preview-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-card__fallback {
  color: rgba(255, 255, 255, 0.88);
  font-size: 78px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.preview-copy-card {
  padding: 28px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.preview-copy-card__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.preview-copy-card__title {
  margin-top: 10px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.04em;
}

.preview-copy-card__desc {
  margin-top: 12px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.hero-panel {
  position: relative;
  display: grid;
  gap: 18px;
}

.hero-panel__icon {
  width: 112px;
  height: 112px;
  margin: 0 auto;
  border-radius: 30px;
  background: color-mix(in srgb, var(--app-surface-soft) 92%, var(--app-surface));
  box-shadow: var(--app-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary);
  font-size: 56px;
  font-weight: 700;
}

.hero-panel__card,
.field-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.hero-panel__card {
  padding: 24px;
  border-radius: 32px;
}

.hero-panel__label,
.section-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-panel__title,
.section-title {
  color: var(--app-text);
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-panel__title {
  margin-top: 8px;
  font-size: 26px;
  line-height: 1.3;
}

.hero-panel__desc {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.hero-panel__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.metric-box {
  padding: 16px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
}

.metric-box__label {
  display: block;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.metric-box__value {
  display: block;
  margin-top: 8px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
}

.form-section {
  margin-top: 18px;
}

.form-section--tabs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-tab-nav {
  position: sticky;
  top: 0;
  z-index: 12;
}

:deep(.tab-nav) {
  display: flex;
  justify-content: safe center;
  align-items: center;
  width: 100%;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--app-text) 6%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 78%, transparent);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--app-text) 8%, transparent);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  scrollbar-width: none;
  overflow-x: auto;
  overflow-y: hidden;
}

:deep(.tab-nav__scroll) {
  display: flex;
  gap: 10px;
  width: max-content;
}

:deep(.tab-nav::-webkit-scrollbar) {
  display: none;
}

:deep(.tab-nav__item) {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: max-content;
  min-height: 42px;
  padding: 0 16px;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

:deep(.tab-nav__item--active) {
  background: linear-gradient(135deg, color-mix(in srgb, var(--app-text) 95%, transparent), color-mix(in srgb, var(--app-text) 18%, #303038));
  color: var(--app-surface);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--app-text) 18%, transparent);
}

:deep(.tab-nav__badge) {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(199, 68, 68, 0.12);
}

:deep(.tab-nav__item--active .tab-nav__badge) {
  background: #ff9f8f;
  box-shadow: 0 0 0 4px rgba(255, 159, 143, 0.18);
}

.form-tab-content {
  position: relative;
}

.tab-panel {
  animation: tab-panel-enter 0.22s ease;
}

@keyframes tab-panel-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.section-head {
  margin-bottom: 12px;
}

.section-title {
  margin-top: 4px;
  font-size: 20px;
}

.field-card {
  padding: 18px;
  border-radius: 28px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.field input,
.field textarea {
  max-width: 100%;
}

.field--half {
  grid-column: span 1;
}

.field--full {
  grid-column: 1 / -1;
}

.field--textarea textarea {
  min-height: 132px;
}

.field-label {
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.field-hint,
.field-error {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.required {
  color: #d15353;
}

.field input,
.field textarea {
  width: 100%;
  min-height: var(--input-height);
  padding: 0 16px;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: 18px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.field textarea {
  padding: 14px 16px;
  resize: vertical;
}

.field input:focus,
.field textarea:focus,
.date-field:focus-visible,
.outline-action:focus-visible,
.media-picker:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.field--error input {
  border-color: rgba(209, 83, 83, 0.35);
}

.date-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--input-height);
  padding: 0 16px;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: 18px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
}

.date-field__value--placeholder {
  color: var(--app-placeholder);
}

.date-field__icon {
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.media-picker {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface-soft) 82%, var(--app-surface));
  text-align: left;
}

.media-picker__preview {
  width: 88px;
  height: 88px;
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(180deg, #2a2d35, #1d2028);
  flex-shrink: 0;
}

.media-picker__preview--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #2c2f38, #242731);
  color: rgba(255, 255, 255, 0.84);
  font-size: 16px;
  font-weight: 700;
}

.media-picker__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-picker__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.media-picker__copy strong {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 700;
}

.media-picker__copy span {
  color: var(--app-text-tertiary);
  font-size: 13px;
  line-height: 1.6;
}

.linked-goods {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  max-height: 260px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.linked-goods::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.linked-goods__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--app-surface-soft);
}

.linked-goods__thumb {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #2c2f38, #242731);
  color: rgba(255, 255, 255, 0.84);
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.linked-goods__name {
  flex: 1;
  color: var(--app-text);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.linked-goods__remove {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
  font-size: 16px;
  line-height: 1;
}

.outline-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  border: 1px dashed color-mix(in srgb, var(--app-border) 90%, transparent);
  border-radius: 18px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.outline-action svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
}

.outline-action--compact {
  flex: 0 0 auto;
  width: auto;
  min-height: 40px;
  padding: 0 14px;
  white-space: nowrap;
  align-self: flex-start;
}

.outline-action--compact span {
  white-space: nowrap;
}

.expense-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.expense-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.expense-section__hint {
  margin-top: 6px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.expense-list {
  display: grid;
  gap: 10px;
}

.expense-item {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 90%, var(--app-surface));
}

.expense-item__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.expense-item__remove {
  width: fit-content;
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: rgba(209, 83, 83, 0.1);
  color: #c54f4f;
  font-size: 13px;
  font-weight: 600;
}

.expense-section__empty {
  color: var(--app-text-tertiary);
  font-size: 13px;
  line-height: 1.5;
}

.photo-upload-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.photo-upload__add,
.photo-upload__item {
  aspect-ratio: 1;
  border-radius: 18px;
  overflow: hidden;
}

.photo-upload__add {
  border: 1px dashed color-mix(in srgb, var(--app-border) 90%, transparent);
  background: color-mix(in srgb, var(--app-surface-soft) 88%, var(--app-surface));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
}

.photo-upload__add svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2;
}

.photo-upload__item {
  position: relative;
}

.photo-upload__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-upload__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-text) 72%, transparent);
  color: var(--app-surface);
  font-size: 14px;
}

.float-footer {
  padding: 0;
}

.btn-primary {
  width: 100%;
  height: var(--button-height);
  border: none;
  border-radius: 16px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.btn-primary:active {
  transform: scale(0.96);
  opacity: 0.94;
}

.btn-float {
  pointer-events: auto;
  border-radius: 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--app-text) 28%, transparent);
}

@media (min-width: 900px) {
  .editor-shell {
    grid-template-columns: 480px minmax(0, 1fr);
    align-items: start;
    column-gap: 28px;
  }

  .preview-column {
    position: sticky;
    top: 0;
  }

  .hero-panel {
    margin-top: 0;
  }

  .form-tab-nav {
    width: fit-content;
    max-width: 100%;
    margin-inline: auto;
  }

  :deep(.tab-nav) {
    overflow-x: visible;
  }

  :deep(.tab-nav__item) {
    min-width: 132px;
  }

  .field--tablet-half {
    grid-column: span 1;
  }
}

@media (max-width: 899px) {
  .preview-copy-card {
    display: none;
  }

  .hero-panel__icon {
    width: 92px;
    height: 92px;
    font-size: 44px;
  }
}

@media (max-width: 720px) {
  .page-body {
    padding-bottom: 120px;
  }

  .field-grid,
  .hero-panel__metrics {
    grid-template-columns: 1fr;
  }

  .photo-upload-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .media-picker {
    align-items: flex-start;
  }
}

:global(html.theme-dark) .btn-float {
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
}


</style>
