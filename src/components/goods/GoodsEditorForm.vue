<template>
  <div class="page add-page">
    <NavBar :title="navBarTitle" show-back />

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
            <p class="hero-label">{{ heroLabel }}</p>
            <h1 class="hero-title">{{ heroTitle }}</h1>
            <p class="hero-desc">{{ heroDesc }}</p>
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
                  @click="setWishlist(false)"
                >
                  已入手
                </button>
                <button
                  type="button"
                  :class="['status-toggle__option', { 'status-toggle__option--active': form.isWishlist }]"
                  @click="setWishlist(true)"
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

              <div v-if="!form.isWishlist && quantityNumber >= 2 && form.characters.length > 0" class="field">
                <span class="field-label">逐份角色分配</span>

                <div class="actual-price-block" :class="{ 'actual-price-block--open': showUnitCharacterInput }">
                  <button class="actual-price-toggle" type="button" @pointerdown="flushActiveInput" @click="showUnitCharacterInput = !showUnitCharacterInput">
                    <span class="actual-price-toggle__copy">
                      <span class="actual-price-toggle__title">
                        {{ showUnitCharacterInput ? '收起逐份角色' : (hasUnitCharacterValue ? '已填写逐份角色' : '设置逐份角色') }}
                      </span>
                      <span class="actual-price-toggle__desc">
                        {{ showUnitCharacterInput ? '每一份谷子对应一个角色' : (hasUnitCharacterValue ? '已保存部分逐份角色' : '可以为每一份单独指定角色') }}
                      </span>
                    </span>
                    <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showUnitCharacterInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M7 10L12 15L17 10" />
                    </svg>
                  </button>

                  <Transition name="unit-character-panel">
                    <div v-if="showUnitCharacterInput" class="actual-price-panel">
                      <div class="inline-actions">
                        <span class="inline-actions__label">逐份明细</span>
                        <button class="inline-clear-btn" type="button" @click="clearUnitCharacterList">清空</button>
                      </div>

                      <label v-for="index in quantityNumber" :key="`unit-character-${index}`" class="unit-date-field">
                        <span class="field-label">第 {{ index }} 份角色</span>
                        <AppSelect
                          v-model="form.unitCharacterList[index - 1]"
                          :options="selectedCharacterOptions"
                          placeholder="请选择角色"
                        />
                      </label>
                    </div>
                  </Transition>
                </div>
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
            <label class="field" :class="{ 'field--error': priceError }">
              <span class="field-label">{{ form.isWishlist ? '目标价格（¥）' : '价格（¥）' }}</span>
              <div class="price-row">
                <input
                  v-model="form.price"
                  ref="priceInputRef"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0.00"
                  :aria-invalid="Boolean(priceError)"
                />
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
              <span v-if="priceError" class="field-error">{{ priceError }}</span>
              <div v-if="showPointsInput" class="points-input-wrap">
                <span class="points-input-label">消耗积分</span>
                <input v-model.number="form.points" type="number" min="0" step="1" placeholder="0" />
              </div>
              <div v-if="!form.isWishlist" class="actual-price-block" :class="{ 'actual-price-block--open': showActualPriceInput }">
                <button class="actual-price-toggle" type="button" @click="showActualPriceInput = !showActualPriceInput">
                  <span class="actual-price-toggle__copy">
                    <span class="actual-price-toggle__title">
                      {{ showActualPriceInput ? '收起入手价信息' : ((hasActualPriceValue(form.actualPrice) || hasUnitActualPriceValue) ? '已填写入手价信息' : '补充入手价信息') }}
                    </span>
                    <span class="actual-price-toggle__desc">
                      {{ showActualPriceInput ? '可记录总入手价与逐份入手价' : ((hasActualPriceValue(form.actualPrice) || hasUnitActualPriceValue) ? '已保存部分价格信息' : '如果成交价和标价不同，可以补充总价或逐份价格') }}
                    </span>
                  </span>
                  <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showActualPriceInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 10L12 15L17 10" />
                  </svg>
                </button>

                <div v-if="showActualPriceInput" class="actual-price-panel">
                  <span class="field-label">入手价（¥）</span>
                  <input
                    v-model="form.actualPrice"
                    :class="{ 'actual-price-input--disabled': disableActualPriceInput }"
                    :disabled="disableActualPriceInput"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0.00"
                    @blur="form.actualPrice = normalizeUnitPriceValue(form.actualPrice); syncAllUnitPricesFromActualPrice()"
                    @change="form.actualPrice = normalizeUnitPriceValue(form.actualPrice); syncAllUnitPricesFromActualPrice()"
                  />

                  <template v-if="quantityNumber >= 2">
                    <div class="actual-price-block" :class="{ 'actual-price-block--open': showUnitActualPriceInput }">
                      <button class="actual-price-toggle" type="button" @click="showUnitActualPriceInput = !showUnitActualPriceInput">
                        <span class="actual-price-toggle__copy">
                          <span class="actual-price-toggle__title">
                            {{ showUnitActualPriceInput ? '收起逐份入手价' : (hasUnitActualPriceValue ? '已填写逐份入手价' : '设置逐份入手价') }}
                          </span>
                          <span class="actual-price-toggle__desc">
                            {{ showUnitActualPriceInput ? '可分别记录每一份谷子的成交价' : (hasUnitActualPriceValue ? '已保存部分逐份价格' : '数量大于等于 2 时可单独设置每份价格') }}
                          </span>
                        </span>
                        <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showUnitActualPriceInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7 10L12 15L17 10" />
                        </svg>
                      </button>

                      <div v-if="showUnitActualPriceInput" class="actual-price-panel">
                        <div class="inline-actions">
                          <span class="inline-actions__label">逐份明细</span>
                          <button class="inline-clear-btn" type="button" @click="clearUnitActualPriceList">清空</button>
                        </div>
                        <label v-for="index in quantityNumber" :key="`unit-price-${index}`" class="unit-date-field">
                          <span class="field-label">第 {{ index }} 份入手价（¥）</span>
                          <input
                            v-model="form.unitActualPriceList[index - 1]"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0.00"
                            @blur="normalizeUnitPriceAt(index - 1)"
                            @change="normalizeUnitPriceAt(index - 1)"
                          />
                        </label>
                      </div>
                    </div>
                  </template>
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
                  <div class="inline-actions">
                    <span class="inline-actions__label">逐份明细</span>
                    <button class="inline-clear-btn" type="button" @click="clearUnitAcquiredAtList">清空</button>
                  </div>
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
        <button class="btn-primary btn-float" type="button" @pointerdown="flushActiveInput" @click="handleSubmit">{{ submitButtonLabel }}</button>
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
import { computed } from 'vue'
import { DatePicker, Popup } from 'vant'
import { flushActiveInput } from '@/utils/commitActiveInput'
import { useGoodsEditorForm } from '@/composables/goods/useGoodsEditorForm'
import NavBar from '@/components/common/NavBar.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import GoodsImageManager from '@/components/goods/GoodsImageManager.vue'
import StorageLocationInput from '@/components/storage/StorageLocationInput.vue'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'
import TagInput from '@/components/common/TagInput.vue'

const props = defineProps({
  mode: {
    type: String,
    default: 'add'
  },
  initialIsWishlist: {
    type: Boolean,
    default: false
  },
  editId: {
    type: String,
    default: ''
  }
})

const {
  presets,
  form,
  showPointsInput,
  showActualPriceInput,
  showUnitAcquiredAtInput,
  showUnitActualPriceInput,
  showUnitCharacterInput,
  quickCreateTarget,
  quickCategoryName,
  quickIpName,
  quickCharacterName,
  quickCharacterIp,
  nameError,
  priceError,
  charactersFieldRef,
  nameInputRef,
  priceInputRef,
  noteInputRef,
  showDatePicker,
  showUnitDatePicker,
  showCharPicker,
  datePickerValue,
  unitDatePickerValue,
  minDate,
  maxDate,
  availableCharacters,
  selectedCharacterOptions,
  storageLocationOptions,
  quickCharacterIpOptions,
  characterPlaceholder,
  primaryPreviewImage,
  quantityNumber,
  hasUnitAcquiredAtValue,
  hasUnitActualPriceValue,
  hasUnitCharacterValue,
  disableActualPriceInput,
  datePickerPopupPosition,
  handleSubmit,
  toggleCharPicker,
  toggleQuickCreate,
  submitQuickCategory,
  submitQuickIp,
  submitQuickCharacter,
  toggleChar,
  setWishlist,
  hasActualPriceValue,
  normalizeUnitDateAt,
  clearUnitAcquiredAtList,
  normalizeUnitPriceValue,
  normalizeUnitPriceAt,
  clearUnitActualPriceList,
  clearUnitCharacterList,
  syncAllUnitDatesFromPrimaryDate,
  syncAllUnitPricesFromActualPrice,
  openDatePicker,
  openUnitDatePicker,
  onDateConfirm,
  onUnitDateConfirm,
  syncField,
  syncFieldLater,
  closeQuickCreate
} = useGoodsEditorForm({ mode: props.mode, editId: props.editId, initialIsWishlist: props.initialIsWishlist })

const isEditMode = computed(() => props.mode === 'edit')
const navBarTitle = computed(() => (isEditMode.value ? '编辑谷子' : '添加谷子'))
const heroLabel = computed(() => {
  if (isEditMode.value) {
    return form.isWishlist ? '编辑心愿' : '编辑收藏'
  }

  return form.isWishlist ? '新增心愿' : '新增收藏'
})

const heroTitle = computed(() => {
  if (form.name) return form.name

  if (isEditMode.value) {
    return form.isWishlist ? '调整心愿信息' : '调整收藏信息'
  }

  return form.isWishlist ? '记下一件想要的谷子' : '记录一件新的收藏'
})

const heroDesc = computed(() => {
  if (isEditMode.value) {
    return form.isWishlist
      ? '更新目标、预算和备注，保持心愿单清晰。'
      : '更新图片、价格和备注，让这件收藏的信息保持最新。'
  }

  return form.isWishlist
    ? '先保存目标、预算和备注，入手后再补完整。'
    : '填写基础信息和购买信息，让你的谷子清单保持整洁。'
})

const submitButtonLabel = computed(() => {
  if (form.isWishlist) return '保存心愿'
  return isEditMode.value ? '保存修改' : '保存谷子'
})
</script>

<style scoped src="../../assets/goodsEditorForm.css"></style>

