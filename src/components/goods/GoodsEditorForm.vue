<template>
  <div class="page add-page">
    <main class="page-body">
      <NavBar :title="navBarTitle" show-back @back="handleBack" />

      <form ref="formRootRef" class="editor-form" @submit.prevent="handleFormSubmit($event)">
        <section class="manage-hero">
          <div class="preview-stage">
            <div class="preview-glow" />
            <div
              ref="previewMediaRef"
              class="preview-media"
              :class="{ 'preview-media--empty': !primaryPreviewImage }"
              :data-cover-tone="previewCoverTone"
            >
              <LazyCachedImage
                v-if="primaryPreviewImage"
                :key="`${primaryPreviewImage}-${previewImageRefreshKey}`"
                :src="primaryPreviewImage"
                :alt="form.name || t('common.image')"
                :lazy="false"
                class="preview-image"
              />
              <span v-else class="preview-fallback">{{ form.name?.trim().charAt(0).toUpperCase() || t('goods.heroFallback') }}</span>
            </div>
          </div>

          <article class="hero-card">
            <p class="hero-label">{{ heroLabel }}</p>
            <h1 class="hero-title">{{ heroTitle }}</h1>
            <p class="hero-desc">{{ heroDesc }}</p>

            <!-- 拍照识别：上传一张订单截图 / 商品图，自动认出字段并预填表单 -->
            <template v-if="showPhotoRecognize">
              <div class="photo-recognize-actions">
                <button
                  type="button"
                  class="photo-recognize-btn"
                  :disabled="recognizing"
                  :aria-busy="recognizing"
                  @click="handlePhotoRecognize"
                >
                  <svg
                    class="photo-recognize-btn__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" />
                    <circle cx="12" cy="13.2" r="3.1" />
                    <path d="M18.4 2.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
                  </svg>
                  <span>{{ recognizing ? t('goods.photoScan.recognizing') : t('goods.photoScan.uploadButton') }}</span>
                </button>

                <!-- 慢端点可能要等一整分钟：别让用户只能盯着转圈 -->
                <button
                  v-if="recognizing"
                  type="button"
                  class="photo-recognize-cancel"
                  @click="cancelPhotoRecognize"
                >
                  {{ t('goods.photoScan.cancel') }}
                </button>
              </div>

              <p
                v-if="photoRecognizeHint"
                class="photo-recognize-hint"
                :class="{ 'photo-recognize-hint--error': photoRecognizeHasError }"
              >
                <span>{{ photoRecognizeHint }}</span>
                <button
                  v-if="photoRecognizeNeedsConfig"
                  type="button"
                  class="photo-recognize-hint__link"
                  @click="goConfigureAiService"
                >
                  {{ t('goods.photoScan.goConfigure') }}
                </button>
              </p>

              <div v-if="photoRecognizeSummary" class="photo-recognize-result">
                <p class="photo-recognize-result__title">
                  {{ t('goods.photoScan.filledTitle', { count: photoRecognizeSummary.filled.length }) }}
                </p>
                <div class="photo-recognize-result__chips">
                  <span
                    v-for="key in photoRecognizeSummary.filled"
                    :key="key"
                    class="photo-recognize-chip"
                  >
                    {{ t(PHOTO_RECOGNIZE_FIELD_LABEL_KEYS[key]) }}
                  </span>
                </div>
                <p v-if="photoRecognizeSummary.uncertain.length" class="photo-recognize-result__note">
                  {{ t('goods.photoScan.uncertainNote', { count: photoRecognizeSummary.uncertain.length }) }}
                </p>
                <p v-if="photoRecognizeSummary.skipped.length" class="photo-recognize-result__note">
                  {{ t('goods.photoScan.skippedNote', { count: photoRecognizeSummary.skipped.length }) }}
                </p>
                <p v-if="photoRecognizeSummary.notRecognized.length" class="photo-recognize-result__note">
                  {{ t('goods.photoScan.notFoundNote', { count: photoRecognizeSummary.notRecognized.length }) }}
                </p>
                <button type="button" class="photo-recognize-result__undo" @click="undoPhotoRecognize">
                  {{ t('goods.photoScan.undo') }}
                </button>
              </div>
            </template>
          </article>
        </section>

        <section class="form-main">
          <FormTabNav v-model="activeTab" :tabs="tabItems" class="form-tab-nav" />

          <section class="form-section form-section--tabs">
            <div class="form-tab-content">
              <section v-show="activeTab === 'basic'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'basic' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.editor.basicInfo') }}</p>
                <h2 class="section-title">{{ t('goods.editor.goodsData') }}</h2>
              </div>

              <div class="field-card">
                <div class="field">
                  <span class="field-label">{{ t('common.status') }}</span>
                  <div class="status-toggle">
                    <button
                      type="button"
                      :class="['status-toggle__option', { 'status-toggle__option--active': !form.isWishlist }]"
                      @click="setWishlist(false)"
                    >
                      {{ t('goods.editor.acquired') }}
                    </button>
                    <button
                      type="button"
                      :class="['status-toggle__option', { 'status-toggle__option--active': form.isWishlist }]"
                      @click="setWishlist(true)"
                    >
                      {{ t('goods.editor.wishlist') }}
                    </button>
                  </div>
                </div>

                <div v-if="!form.isWishlist" class="field">
                  <span class="field-label">{{ t('goods.editor.collectStatus') }}</span>
                  <AppSelect
                    v-model="form.collectStatus"
                    :options="collectStatusOptions"
                    :placeholder="t('goods.editor.selectStatus')"
                    :disabled="disableCollectStatusInput"
                    :class="{ 'app-select--disabled': disableCollectStatusInput }"
                  />

                  <div v-if="quantityNumber >= 2" class="actual-price-block" :class="{ 'actual-price-block--open': showUnitCollectStatusInput }">
                    <button class="actual-price-toggle" type="button" @click="showUnitCollectStatusInput = !showUnitCollectStatusInput">
                      <span class="actual-price-toggle__copy">
                        <span class="actual-price-toggle__title">
                          {{ showUnitCollectStatusInput ? t('goods.editor.collapseUnitStatus') : (hasUnitCollectStatusValue ? t('goods.editor.unitStatusFilled') : t('goods.editor.setUnitStatus')) }}
                        </span>
                        <span class="actual-price-toggle__desc">
                          {{ showUnitCollectStatusInput ? t('goods.editor.unitStatusDescOpen') : (hasUnitCollectStatusValue ? t('goods.editor.unitStatusDescPartial') : t('goods.editor.unitStatusDescClosed')) }}
                        </span>
                      </span>
                      <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showUnitCollectStatusInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 10L12 15L17 10" />
                      </svg>
                    </button>

                    <Transition name="unit-character-panel">
                      <div v-if="showUnitCollectStatusInput" class="actual-price-panel">
                        <div class="inline-actions">
                          <span class="inline-actions__label">{{ t('goods.editor.unitDetail') }}</span>
                          <button class="inline-clear-btn" type="button" @click="clearUnitCollectStatusList">{{ t('common.clear') }}</button>
                        </div>

                        <label v-for="index in quantityNumber" :key="`unit-status-${index}`" class="unit-date-field">
                          <span class="field-label">{{ t('goods.editor.unitStatus', { index }) }}</span>
                          <AppSelect
                            v-model="form.unitCollectStatusList[index - 1]"
                            :options="collectStatusOptions"
                            :placeholder="t('goods.editor.selectStatus')"
                          />
                        </label>
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- 出谷信息:状态为在售/已出时编辑(存 sell* 列;在售=挂牌信息,已出=成交信息) -->
                <div v-if="!form.isWishlist && showSaleSection" class="field">
                  <span class="field-label">{{ t('goods.detail.saleInfo') }}</span>

                  <div v-if="!hasUnitSaleStatuses" class="sale-info-grid">
                    <label class="sale-info-cell">
                      <span class="sale-info-cell__label">{{ form.collectStatus === '已出' ? t('sale.dealPrice') : t('sale.listingPrice') }}</span>
                      <input
                        v-model="form.sellPrice"
                        type="number" inputmode="decimal" min="0"
                        class="sale-info-input"
                        :placeholder="t('sale.pricePlaceholder')"
                      />
                    </label>
                    <label class="sale-info-cell">
                      <span class="sale-info-cell__label">{{ t('sale.platform') }}</span>
                      <input
                        v-model="form.sellPlatform"
                        type="text"
                        class="sale-info-input"
                        :placeholder="t('sale.platformPlaceholder')"
                      />
                    </label>
                    <label v-if="form.collectStatus === '已出'" class="sale-info-cell">
                      <span class="sale-info-cell__label">{{ t('sale.fee') }}</span>
                      <input
                        v-model="form.sellFee"
                        type="number" inputmode="decimal" min="0"
                        class="sale-info-input"
                        :placeholder="t('sale.feePlaceholder')"
                      />
                    </label>
                    <label class="sale-info-cell">
                      <span class="sale-info-cell__label">{{ t('sale.date') }}</span>
                      <button type="button" class="sale-info-input sale-info-date-btn" @click="openSellDatePicker(null)">
                        {{ form.sellDate || t('common.selectDate') }}
                      </button>
                    </label>
                  </div>

                  <div v-else class="sale-info-units">
                    <div v-for="unit in saleUnits" :key="`sale-unit-${unit.index}`" class="sale-info-unit">
                      <span class="sale-info-unit__tag">{{ t('sale.unitLabel', { n: unit.index + 1 }) }} · {{ unit.statusLabel }}</span>
                      <div class="sale-info-grid">
                        <label class="sale-info-cell">
                          <span class="sale-info-cell__label">{{ unit.status === '已出' ? t('sale.dealPrice') : t('sale.listingPrice') }}</span>
                          <input
                            :value="unit.info.price || ''"
                            type="number" inputmode="decimal" min="0"
                            class="sale-info-input"
                            :placeholder="t('sale.pricePlaceholder')"
                            @change="updateUnitSaleInfo(unit.index, 'price', $event.target.value)"
                          />
                        </label>
                        <label class="sale-info-cell">
                          <span class="sale-info-cell__label">{{ t('sale.platform') }}</span>
                          <input
                            :value="unit.info.platform || ''"
                            type="text"
                            class="sale-info-input"
                            :placeholder="t('sale.platformPlaceholder')"
                            @change="updateUnitSaleInfo(unit.index, 'platform', $event.target.value)"
                          />
                        </label>
                        <label v-if="unit.status === '已出'" class="sale-info-cell">
                          <span class="sale-info-cell__label">{{ t('sale.fee') }}</span>
                          <input
                            :value="unit.info.fee || ''"
                            type="number" inputmode="decimal" min="0"
                            class="sale-info-input"
                            :placeholder="t('sale.feePlaceholder')"
                            @change="updateUnitSaleInfo(unit.index, 'fee', $event.target.value)"
                          />
                        </label>
                        <label class="sale-info-cell">
                          <span class="sale-info-cell__label">{{ t('sale.date') }}</span>
                          <button type="button" class="sale-info-input sale-info-date-btn" @click="openSellDatePicker(unit.index)">
                            {{ unit.info.date || t('common.selectDate') }}
                          </button>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <label class="field" :class="{ 'field--error': nameError }">
                  <span class="field-label">{{ t('goods.editor.nameRequired') }} <span class="required">*</span></span>
                  <input
                    v-model="form.name"
                    ref="nameInputRef"
                    type="text"
                    :placeholder="t('goods.editor.namePlaceholder')"
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

                <TagSuggestionPanel
                  :suggestions="tagSuggestions"
                  @apply="applySuggestion"
                  @ignore="ignoreSuggestion"
                  @apply-all="applyAllSuggestions"
                />

                <div class="field">
                  <span class="field-label">{{ t('common.category') }}</span>
                  <AppSelect v-model="form.category" :options="presets.categories" :placeholder="t('goods.editor.categoryPlaceholder')" />
                  <button class="field-add-btn" type="button" @click="toggleQuickCreate('category')">
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 3V13" />
                      <path d="M3 8H13" />
                    </svg>
                    {{ t('goods.editor.newCategory') }}
                  </button>
                  <QuickPresetCreator
                    v-if="quickCreateTarget === 'category'"
                    :show="quickCreateTarget === 'category'"
                    v-model="quickCategoryName"
                    :placeholder="t('goods.editor.newCategoryPlaceholder')"
                    :maxlength="20"
                    :submit-text="t('goods.editor.newCategorySubmit')"
                    @cancel="closeQuickCreate"
                    @submit="submitQuickCategory"
                  />
                </div>

                <div class="field">
                  <span class="field-label">{{ t('common.ip') }}</span>
                  <AppSelect v-model="form.ip" :options="presets.ips" :placeholder="t('goods.editor.ipPlaceholder')" />
                  <button class="field-add-btn" type="button" @click="toggleQuickCreate('ip')">
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 3V13" />
                      <path d="M3 8H13" />
                    </svg>
                    {{ t('goods.editor.newIp') }}
                  </button>
                  <QuickPresetCreator
                    v-if="quickCreateTarget === 'ip'"
                    :show="quickCreateTarget === 'ip'"
                    v-model="quickIpName"
                    :placeholder="t('goods.editor.newIpPlaceholder')"
                    :maxlength="40"
                    :submit-text="t('goods.editor.newIpSubmit')"
                    @cancel="closeQuickCreate"
                    @submit="submitQuickIp"
                  />
                </div>

                <div ref="charactersFieldRef" class="field">
                  <span class="field-label">{{ t('common.character') }}</span>

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
                              v-if="isFavoriteCharacter(character.ip, character.name)"
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

                        <div v-if="!form.ip" class="multi-select__empty">{{ t('goods.editor.selectIpFirst') }}</div>
                        <div v-else-if="availableCharacters.length === 0" class="multi-select__empty">{{ t('goods.editor.noCharacterPresets') }}</div>
                      </div>
                    </transition>
                  </div>

                  <div v-if="!form.isWishlist && quantityNumber >= 2 && form.characters.length > 0" class="field">
                    <div class="actual-price-block" :class="{ 'actual-price-block--open': showUnitCharacterInput }">
                      <button class="actual-price-toggle" type="button" @pointerdown="flushActiveInput" @click="showUnitCharacterInput = !showUnitCharacterInput">
                        <span class="actual-price-toggle__copy">
                          <span class="actual-price-toggle__title">
                            {{ showUnitCharacterInput ? t('goods.editor.collapseUnitCharacter') : (hasUnitCharacterValue ? t('goods.editor.unitCharacterFilled') : t('goods.editor.setUnitCharacter')) }}
                          </span>
                          <span class="actual-price-toggle__desc">
                            {{ showUnitCharacterInput ? t('goods.editor.unitCharacterDescOpen') : (hasUnitCharacterValue ? t('goods.editor.unitCharacterDescPartial') : t('goods.editor.unitCharacterDescClosed')) }}
                          </span>
                        </span>
                        <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showUnitCharacterInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7 10L12 15L17 10" />
                        </svg>
                      </button>

                      <Transition name="unit-character-panel">
                        <div v-if="showUnitCharacterInput" class="actual-price-panel">
                          <div class="inline-actions">
                            <span class="inline-actions__label">{{ t('goods.editor.unitDetail') }}</span>
                            <button class="inline-clear-btn" type="button" @click="clearUnitCharacterList">{{ t('common.clear') }}</button>
                          </div>

                          <label v-for="index in quantityNumber" :key="`unit-character-${index}`" class="unit-date-field">
                            <span class="field-label">{{ t('goods.editor.unitCharacter', { index }) }}</span>
                            <AppSelect
                              v-model="form.unitCharacterList[index - 1]"
                              :options="selectedCharacterOptions"
                              :placeholder="t('goods.editor.selectCharacterPlaceholder')"
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
                    {{ t('goods.editor.newCharacter') }}
                  </button>

                  <QuickPresetCreator
                    v-if="quickCreateTarget === 'character'"
                    :show="quickCreateTarget === 'character'"
                    v-model="quickCharacterName"
                    :placeholder="t('goods.editor.newCharacterPlaceholder')"
                    :maxlength="30"
                    :submit-text="t('goods.editor.newCharacterSubmit')"
                    :secondary-value="quickCharacterIp"
                    :secondary-options="quickCharacterIpOptions"
                    :secondary-label="form.ip ? t('goods.editor.characterIpAssigned') : t('goods.editor.characterIpSelect')"
                    :secondary-placeholder="t('goods.editor.characterIpNone')"
                    @update:secondary-value="quickCharacterIp = $event"
                    @cancel="closeQuickCreate"
                    @submit="submitQuickCharacter"
                  />
                </div>
              </div>
            </section>

              <section v-show="activeTab === 'extra'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'extra' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.editor.extraInfo') }}</p>
                <h2 class="section-title">{{ t('goods.editor.tabExtra') }}</h2>
              </div>

              <div class="field-card">
                <label class="field">
                  <span class="field-label">{{ t('goods.editor.variant') }}</span>
                  <input
                    v-model="form.variant"
                    type="text"
                    :placeholder="t('goods.editor.variantPlaceholder')"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ t('goods.editor.size') }}</span>
                  <input
                    v-model="form.size"
                    type="text"
                    :placeholder="t('goods.editor.sizePlaceholder')"
                  />
                </label>

                <div class="field">
                  <span class="field-label">{{ t('goods.editor.customTags') }}</span>
                  <TagInput v-model="form.tags" :placeholder="t('goods.editor.tagPlaceholder')" />
                </div>

                <div class="field">
                  <span class="field-label">{{ t('goods.editor.storageLocation') }}</span>
                  <StorageLocationInput
                    v-model="form.storageLocation"
                    :options="storageLocationOptions"
                    :placeholder="t('goods.editor.storageLocationPlaceholder')"
                    quick-create
                  />
                </div>
              </div>

              <div class="section-head">
                <p class="section-label">{{ t('goods.editor.extraInfo') }}</p>
                <h2 class="section-title">{{ t('goods.editor.customFieldsSection') }}</h2>
              </div>

              <div class="field-card">
                <div v-if="attachedCustomFieldDefs.length === 0" class="field">
                  <span class="field-label">{{ t('goods.editor.customFieldsSection') }}</span>
                  <p class="custom-fields-empty">{{ t('goods.editor.customFieldsEmptyHint') }}</p>
                </div>

                <div v-for="def in attachedCustomFieldDefs" :key="def.id" class="field">
                  <div class="inline-actions">
                    <span class="inline-actions__label">{{ def.name }}</span>
                    <button class="inline-clear-btn" type="button" @click="detachCustomField(def.id)">
                      {{ t('goods.editor.customFieldRemove') }}
                    </button>
                  </div>

                  <AppSelect
                    v-if="def.type === 'select'"
                    v-model="form.customFields[def.id]"
                    :options="customFieldOptions(def)"
                    :placeholder="t('goods.editor.customFieldSelectPlaceholder')"
                  />

                  <button
                    v-else-if="def.type === 'date'"
                    class="date-field"
                    type="button"
                    @pointerdown="flushActiveInput"
                    @click="openCustomFieldDatePicker(def.id)"
                  >
                    <span :class="{ 'date-field__value--placeholder': !form.customFields[def.id] }">
                      {{ form.customFields[def.id] || t('goods.editor.customFieldDatePlaceholder') }}
                    </span>

                    <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="16" rx="3" />
                      <path d="M8 3V7" />
                      <path d="M16 3V7" />
                      <path d="M3 10H21" />
                    </svg>
                  </button>

                  <input
                    v-else-if="def.type === 'number'"
                    v-model="form.customFields[def.id]"
                    type="number"
                    inputmode="decimal"
                    step="any"
                    :placeholder="t('goods.editor.customFieldNumberPlaceholder')"
                  />

                  <input
                    v-else
                    v-model="form.customFields[def.id]"
                    type="text"
                    :placeholder="t('goods.editor.customFieldTextPlaceholder')"
                  />
                </div>

                <button class="field-add-btn" type="button" @click="openCustomFieldPicker">
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3V13" />
                    <path d="M3 8H13" />
                  </svg>
                  {{ t('goods.editor.customFieldAdd') }}
                </button>
              </div>
            </section>

              <section v-show="activeTab === 'images'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'images' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.editor.visualInfo') }}</p>
                <h2 class="section-title">{{ t('goods.editor.tabImages') }}</h2>
              </div>

              <div class="field-card">
                <div class="field">
                  <span class="field-label">{{ t('goods.editor.imageGallery') }}</span>
                  <GoodsImageManager v-model="form.images" :hint="form.characters[0] || ''" :goods-id="editId" />
                </div>
              </div>
            </section>

              <section v-show="activeTab === 'price'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'price' }">
              <div class="section-head">
                <p class="section-label">{{ form.isWishlist ? t('goods.editor.targetInfo') : t('goods.editor.purchaseInfo') }}</p>
                <h2 class="section-title">{{ form.isWishlist ? t('goods.editor.budgetAndTime') : t('goods.editor.priceAndTime') }}</h2>
              </div>

              <div class="field-card">
                <label class="field" :class="{ 'field--error': priceError }">
                  <span class="field-label">{{ form.isWishlist ? t('goods.editor.targetPriceLabel') : t('goods.editor.priceLabel') }}</span>
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
                    <AppSelect v-model="form.currency" :options="currencyOptions" :placeholder="t('common.currency')" class="currency-select" />
                    <button
                      v-if="!form.isWishlist"
                      type="button"
                      :class="['points-toggle-btn', showPointsInput && 'points-toggle-btn--active']"
                      :aria-label="showPointsInput ? t('goods.editor.hidePoints') : t('goods.editor.showPoints')"
                      @click="showPointsInput = !showPointsInput"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </button>
                  </div>
                  <span v-if="priceError" class="field-error">{{ priceError }}</span>
                  <div v-if="showPointsInput" class="points-input-wrap">
                    <span class="points-input-label">{{ t('goods.editor.pointsLabel') }}</span>
                    <input v-model.number="form.points" type="number" min="0" step="1" placeholder="0" />
                  </div>
                  <div v-if="!form.isWishlist" class="actual-price-block" :class="{ 'actual-price-block--open': showActualPriceInput }">
                    <button class="actual-price-toggle" type="button" @click="showActualPriceInput = !showActualPriceInput">
                      <span class="actual-price-toggle__copy">
                        <span class="actual-price-toggle__title">
                          {{ showActualPriceInput ? t('goods.editor.collapseActualPrice') : ((hasActualPriceValue(form.actualPrice) || hasUnitActualPriceValue) ? t('goods.editor.actualPriceFilled') : t('goods.editor.supplementActualPrice')) }}
                        </span>
                        <span class="actual-price-toggle__desc">
                          {{ showActualPriceInput ? t('goods.editor.actualPriceDescOpen') : ((hasActualPriceValue(form.actualPrice) || hasUnitActualPriceValue) ? t('goods.editor.actualPriceDescPartial') : t('goods.editor.actualPriceDescClosed')) }}
                        </span>
                      </span>
                      <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showActualPriceInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 10L12 15L17 10" />
                      </svg>
                    </button>

                    <div v-if="showActualPriceInput" class="actual-price-panel">
                      <div class="price-row price-row--labeled">
                        <label class="price-row__field">
                          <span class="field-label">{{ t('goods.editor.actualPrice') }}</span>
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
                        </label>
                        <AppSelect v-model="form.actualPriceCurrency" :options="currencyOptions" :placeholder="t('common.currency')" class="currency-select" />
                      </div>

                      <template v-if="quantityNumber >= 2">
                        <div class="actual-price-block" :class="{ 'actual-price-block--open': showUnitActualPriceInput }">
                          <button class="actual-price-toggle" type="button" @click="showUnitActualPriceInput = !showUnitActualPriceInput">
                            <span class="actual-price-toggle__copy">
                              <span class="actual-price-toggle__title">
                                {{ showUnitActualPriceInput ? t('goods.editor.collapseUnitPrice') : (hasUnitActualPriceValue ? t('goods.editor.unitPriceFilled') : t('goods.editor.setUnitPrice')) }}
                              </span>
                              <span class="actual-price-toggle__desc">
                                {{ showUnitActualPriceInput ? t('goods.editor.unitPriceDescOpen') : (hasUnitActualPriceValue ? t('goods.editor.unitPriceDescPartial') : t('goods.editor.unitPriceDescClosed')) }}
                              </span>
                            </span>
                            <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showUnitActualPriceInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M7 10L12 15L17 10" />
                            </svg>
                          </button>

                          <div v-if="showUnitActualPriceInput" class="actual-price-panel">
                            <div class="inline-actions">
                              <span class="inline-actions__label">{{ t('goods.editor.unitDetail') }}</span>
                              <button class="inline-clear-btn" type="button" @click="clearUnitActualPriceList">{{ t('common.clear') }}</button>
                            </div>
                            <label v-for="index in quantityNumber" :key="`unit-price-${index}`" class="unit-date-field">
                              <span class="field-label">{{ t('goods.editor.unitPrice', { index, symbol: currencySymbol }) }}</span>
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

                <label class="field">
                  <span class="field-label">{{ t('goods.editor.quantity') }}</span>
                  <input v-model.number="form.quantity" type="number" min="1" step="1" placeholder="1" />
                </label>

                <div v-if="!form.isWishlist" class="field shipping-field">
                  <label class="shipping-field__fee">
                    <span class="field-label">{{ t('goods.editor.shippingFee') }}</span>
                    <input
                      v-model="form.shippingFee"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0.00"
                      :disabled="form.shippingEvents.length > 0"
                      @blur="form.shippingFee = normalizeUnitPriceValue(form.shippingFee)"
                      @change="form.shippingFee = normalizeUnitPriceValue(form.shippingFee)"
                    />
                  </label>

                  <div class="actual-price-block" :class="{ 'actual-price-block--open': showShippingEvents }">
                    <button class="actual-price-toggle" type="button" @click="showShippingEvents = !showShippingEvents">
                      <span class="actual-price-toggle__copy">
                        <span class="actual-price-toggle__title">
                          {{ showShippingEvents ? t('goods.editor.collapseShippingDetail') : t('goods.editor.shippingDetail') }}
                        </span>
                        <span class="actual-price-toggle__desc">
                          {{ t('goods.editor.shippingEventsHint') }}
                        </span>
                      </span>
                      <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showShippingEvents }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 10L12 15L17 10" />
                      </svg>
                    </button>

                    <div v-if="showShippingEvents" class="actual-price-panel shipping-events-block">
                      <div class="inline-actions">
                        <span class="inline-actions__label">{{ t('goods.editor.addShippingEvent') }}</span>
                        <button
                          v-if="form.shippingEvents.length > 0"
                          type="button"
                          class="inline-clear-btn"
                          @click="clearShippingEvents"
                        >
                          {{ t('common.clear') }}
                        </button>
                      </div>

                      <div
                        v-for="(event, index) in form.shippingEvents"
                        :key="`shipping-event-${index}`"
                        class="shipping-event-item"
                      >
                        <button
                          class="date-field shipping-event-item__date"
                          type="button"
                          @pointerdown="flushActiveInput"
                          @click="openShippingDatePicker(index)"
                        >
                          <span class="shipping-event-item__date-text" :class="{ 'date-field__value--placeholder': !event.date }">
                            {{ event.date || t('goods.editor.selectDate') }}
                          </span>
                          <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="16" rx="3" />
                            <path d="M8 3V7" />
                            <path d="M16 3V7" />
                            <path d="M3 10H21" />
                          </svg>
                        </button>
                        <input
                          v-model="event.fee"
                          class="shipping-event-item__fee"
                          type="number"
                          inputmode="decimal"
                          min="0"
                          step="1"
                          placeholder="0.00"
                          :aria-label="t('goods.editor.shippingEventItem', { index: index + 1 })"
                          @blur="normalizeShippingEventFee(index)"
                          @change="normalizeShippingEventFee(index)"
                        />
                        <button
                          type="button"
                          class="shipping-event-item__delete"
                          :aria-label="t('common.delete')"
                          @click="removeShippingEvent(index)"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <button type="button" class="shipping-events-add-btn" @click="addShippingEvent">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        <span>{{ t('goods.editor.addShippingEvent') }}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <label class="field">
                  <span class="field-label">{{ form.isWishlist ? t('goods.editor.expectedDate') : t('goods.editor.purchaseDate') }}</span>
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
                      {{ form.acquiredAt || (form.isWishlist ? t('goods.editor.optionalDate') : t('goods.editor.selectDate')) }}
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
                          {{ showUnitAcquiredAtInput ? t('goods.editor.collapseUnitDate') : (hasUnitAcquiredAtValue ? t('goods.editor.unitDateFilled') : t('goods.editor.setUnitDate')) }}
                        </span>
                        <span class="actual-price-toggle__desc">
                          {{ showUnitAcquiredAtInput ? t('goods.editor.unitDateDescOpen') : (hasUnitAcquiredAtValue ? t('goods.editor.unitDateDescPartial') : t('goods.editor.unitDateDescClosed')) }}
                        </span>
                      </span>
                      <svg class="actual-price-toggle__arrow" :class="{ 'actual-price-toggle__arrow--open': showUnitAcquiredAtInput }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 10L12 15L17 10" />
                      </svg>
                    </button>

                    <div v-if="showUnitAcquiredAtInput" class="actual-price-panel">
                      <div class="inline-actions">
                        <span class="inline-actions__label">{{ t('goods.editor.unitDetail') }}</span>
                        <button class="inline-clear-btn" type="button" @click="clearUnitAcquiredAtList">{{ t('common.clear') }}</button>
                      </div>
                      <label v-for="index in quantityNumber" :key="`unit-date-${index}`" class="unit-date-field">
                        <span class="field-label">{{ t('goods.editor.unitDate', { index }) }}</span>
                        <button
                          class="date-field"
                          type="button"
                          @pointerdown="flushActiveInput"
                          @click="openUnitDatePicker(index - 1)"
                        >
                          <span :class="{ 'date-field__value--placeholder': !form.unitAcquiredAtList[index - 1] }">
                            {{ form.unitAcquiredAtList[index - 1] || t('goods.editor.selectDate') }}
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

                <section v-if="showSaleReminderSection" class="field sale-reminder-field">
                  <div class="sale-reminder-head">
                    <div>
                      <span class="field-label">{{ t(saleReminderTitleKey) }}</span>
                      <p class="field-hint">{{ t(saleReminderDescKey) }}</p>
                    </div>
                    <button
                      type="button"
                      :class="['sale-reminder-switch', { 'sale-reminder-switch--active': form.saleReminderEnabled }]"
                      :aria-pressed="form.saleReminderEnabled"
                      @click="setSaleReminderEnabled(!form.saleReminderEnabled)"
                    >
                      <span />
                    </button>
                  </div>

                  <label class="unit-date-field">
                    <span class="field-label">{{ t(saleAtLabelKey) }}</span>
                    <button
                      type="button"
                      class="sale-datetime-display"
                      :disabled="!form.saleReminderEnabled"
                      @click="openSaleDateTimePicker"
                    >
                      {{ form.saleAt ? formatSaleAtDisplay(form.saleAt) : t(saleAtSelectKey) }}
                    </button>
                    <SaleCountdown
                      v-if="form.saleAt && form.saleReminderEnabled"
                      :sale-at="form.saleAt"
                      :kind="saleReminderKind"
                    />
                  </label>

                  <div class="sale-reminder-offsets" :class="{ 'sale-reminder-offsets--disabled': !form.saleReminderEnabled }">
                    <span class="field-label">{{ t('goods.editor.remindBefore') }}</span>
                    <div class="sale-reminder-chips">
                      <button
                        v-for="offset in saleReminderPresetOffsets"
                        :key="offset"
                        type="button"
                        :disabled="!form.saleReminderEnabled"
                        :class="['sale-reminder-chip', { 'sale-reminder-chip--active': form.saleReminderOffsets.includes(offset) }]"
                        @click="toggleSaleReminderOffset(offset)"
                      >
                        {{ formatSaleReminderOffset(offset) }}
                      </button>
                    </div>
                  </div>

                  <div class="sale-reminder-custom" :class="{ 'sale-reminder-offsets--disabled': !form.saleReminderEnabled }">
                    <input
                      v-model.number="customSaleReminderMinutes"
                      type="number"
                      min="0"
                      step="1"
                      :disabled="!form.saleReminderEnabled"
                      :placeholder="t('goods.editor.customReminderPlaceholder')"
                      @keydown.enter.prevent="addCustomSaleReminder"
                    />
                    <button type="button" :disabled="!form.saleReminderEnabled" @click="addCustomSaleReminder">
                      {{ t('common.add') }}
                    </button>
                  </div>

                  <div v-if="customSaleReminderOffsets.length" class="sale-reminder-custom-list">
                    <button
                      v-for="offset in customSaleReminderOffsets"
                      :key="offset"
                      type="button"
                      class="sale-reminder-custom-pill"
                      @click="removeSaleReminderOffset(offset)"
                    >
                      {{ formatSaleReminderOffset(offset) }} ×
                    </button>
                  </div>
                </section>
              </div>
            </section>

              <section v-show="activeTab === 'notes'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'notes' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.detail.extraInfo') }}</p>
                <h2 class="section-title">{{ t('common.note') }}</h2>
              </div>

              <div class="field-card">
                <label class="field field--textarea">
                  <span class="field-label">{{ t('goods.editor.notesContent') }}</span>
                  <textarea
                    v-model="form.note"
                    ref="noteInputRef"
                    class="markdown-textarea"
                    rows="5"
                    :placeholder="t('goods.editor.notesPlaceholder')"
                    @input="syncField('note', $event)"
                    @blur="syncField('note', $event)"
                    @change="syncField('note', $event)"
                    @compositionend="syncField('note', $event)"
                    @paste="syncFieldLater('note', $event)"
                  ></textarea>
                </label>
                <MarkdownPreviewCard :content="form.note" :title="t('goods.editor.livePreview')" />
              </div>
            </section>

              <section v-if="showTrackEditor" v-show="activeTab === 'music'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'music' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.editor.musicTitle') }}</p>
                <h2 class="section-title">{{ t('goods.detail.albumTracks') }}</h2>
              </div>

              <div class="field-card">
                <EventTrackEditor
                  v-model="form.tracks"
                  eyebrow="Album Tracklist"
                  :title="t('goods.detail.albumTracks')"
                  :add-button-text="t('goods.editor.addSongManually')"
                  :empty-text="t('goods.editor.noSongs')"
                />
              </div>
              </section>

              <section v-if="!form.isWishlist" v-show="activeTab === 'timeline'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'timeline' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.detail.statusTimeline') }}</p>
                <h2 class="section-title">{{ t('goods.detail.statusTimelineLabel') }}</h2>
              </div>

              <div v-if="hasUnitCollectStatusValue" class="timeline-unit-hint">
                {{ t('goods.editor.timelineUnitDisabledHint') }}
              </div>

              <div class="field-card">
                <StatusTimelineEditor
                  v-model="form.statusTimeline"
                  :collect-status-options="collectStatusOptions"
                  :quantity="quantityNumber"
                  :unit-acquired-at-list="form.unitAcquiredAtList"
                  :unit-collect-status-list="form.unitCollectStatusList"
                />
              </div>
              </section>
            </div>
          </section>
        </section>
      </form>
    </main>

    <Teleport to="body">
      <div class="float-footer">
        <button class="btn-primary btn-float" type="button" @pointerdown="flushActiveInput" @click="handleFormSubmit($event)">{{ submitButtonLabel }}</button>
      </div>
    </Teleport>

    <AppDatePicker
      v-model:show="showDatePicker"
      v-model="datePickerValue"
      :z-index="2000"
      :is-tablet="isTabletViewport"
      :title="t('goods.editor.datePickerTitle')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onDateConfirm"
    />

    <AppDatePicker
      v-model:show="showUnitDatePicker"
      v-model="unitDatePickerValue"
      :z-index="2001"
      :is-tablet="isTabletViewport"
      :title="t('goods.editor.unitDatePickerTitle')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onUnitDateConfirm"
    />

    <AppDatePicker
      v-model:show="showShippingDatePicker"
      v-model="shippingDatePickerValue"
      :z-index="2004"
      :is-tablet="isTabletViewport"
      :title="t('goods.editor.shippingDetail')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onShippingDateConfirm"
    />

    <AppDateTimePicker
      v-model:show="showSaleDateTimePicker"
      v-model="form.saleAt"
      :z-index="2002"
      :is-tablet="isTabletViewport"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onSaleDateTimeConfirm"
    />

    <AppDatePicker
      v-model:show="showSellDatePicker"
      v-model="sellDatePickerValue"
      :z-index="2003"
      :is-tablet="isTabletViewport"
      :title="t('sale.date')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onSellDateConfirm"
    />

    <AppDatePicker
      v-model:show="showCustomFieldDatePicker"
      v-model="customFieldDatePickerValue"
      :z-index="2005"
      :is-tablet="isTabletViewport"
      :title="customFieldDatePickerTitle"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onCustomFieldDateConfirm"
    />

    <CustomFieldPickerSheet
      v-model="showCustomFieldPicker"
      :attached-ids="attachedCustomFieldIds"
      :scope="editorScope"
      @pick="attachCustomField"
    />

    <DangerConfirmDialog
      v-model:show="showLeaveConfirm"
      :title="t('common.unsavedLeaveTitle')"
      :description="t('common.unsavedLeaveDesc')"
      :confirm-text="t('common.unsavedLeaveConfirm')"
      @confirm="confirmDiscardLeave"
      @cancel="cancelLeaveConfirm"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { flushActiveInput } from '@/utils/commitActiveInput'
import { useGoodsEditorForm } from '@/composables/goods/useGoodsEditorForm'
import { useSmartTagging } from '@/composables/goods/useSmartTagging'
import { useUnsavedLeaveGuard } from '@/composables/useUnsavedLeaveGuard'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import AppDateTimePicker from '@/components/common/AppDateTimePicker.vue'
import SaleCountdown from '@/components/goods/SaleCountdown.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import NavBar from '@/components/common/NavBar.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import FormTabNav from '@/components/goods/FormTabNav.vue'
import MarkdownPreviewCard from '@/components/common/MarkdownPreviewCard.vue'
import GoodsImageManager from '@/components/goods/GoodsImageManager.vue'
import StorageLocationInput from '@/components/storage/StorageLocationInput.vue'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'
import TagInput from '@/components/common/TagInput.vue'
import EventTrackEditor from '@/components/events/EventTrackEditor.vue'
import TagSuggestionPanel from '@/components/goods/TagSuggestionPanel.vue'
import CustomFieldPickerSheet from '@/components/goods/CustomFieldPickerSheet.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import StatusTimelineEditor from '@/components/goods/StatusTimelineEditor.vue'
import { pickImageForRecognition } from '@/utils/image/localImage'
import { showGlobalToast } from '@/utils/globalToast'
import { NAVIGATE_PAGES } from '@/utils/ai/jumpLinks'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { resizeTextarea } from '@/utils/textarea'
import { CURRENCIES, CURRENCY_MAP } from '@/constants/currencies'
import { getCoverTone } from '@/utils/goods/coverTone'
import { SALE_REMINDER_PRESET_OFFSETS, formatSaleAtDisplay, getSaleReminderKind } from '@/utils/goods/saleReminder'

const { t } = useI18n()
const router = useRouter()

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
  },
  // 单个新增草稿槽位（'collection' | 'wishlist'）：add 模式下与批量队列草稿共用同一行
  draftSlot: {
    type: String,
    default: ''
  },
  // 进入时是否恢复该槽位已有草稿；false = 本次「重新开始」
  resumeDraft: {
    type: Boolean,
    default: true
  }
})

const previewMediaRef = ref(null)
const previewImageRefreshKey = ref(0)
const formRootRef = ref(null)
const leaveGuardSlot = { current: null }

function onImageCacheRefreshEvent(event) {
  if (String(event?.detail?.reason || '') !== 'force') return
  previewImageRefreshKey.value += 1
}

onMounted(() => {
  window.addEventListener('goodsapp:image-cache-refresh', onImageCacheRefreshEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener('goodsapp:image-cache-refresh', onImageCacheRefreshEvent)
})

const {
  presets,
  form,
  showPointsInput,
  showActualPriceInput,
  showUnitAcquiredAtInput,
  showUnitActualPriceInput,
  showUnitCharacterInput,
  showUnitCollectStatusInput,
  showShippingEvents,
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
  showShippingDatePicker,
  showCustomFieldDatePicker,
  customFieldDatePickerValue,
  activeCustomFieldDateId,
  openCustomFieldDatePicker,
  onCustomFieldDateConfirm,
  showSaleDateTimePicker,
  showCharPicker,
  datePickerValue,
  unitDatePickerValue,
  shippingDatePickerValue,
  minDate,
  maxDate,
  availableCharacters,
  isFavoriteCharacter,
  selectedCharacterOptions,
  storageLocationOptions,
  quickCharacterIpOptions,
  characterPlaceholder,
  primaryPreviewImage,
  quantityNumber,
  hasUnitAcquiredAtValue,
  hasUnitActualPriceValue,
  hasUnitCharacterValue,
  hasUnitCollectStatusValue,
  disableActualPriceInput,
  disableCollectStatusInput,
  isTabletViewport,
  hasUnsavedChanges,
  handleSubmit,
  toggleCharPicker,
  toggleQuickCreate,
  submitQuickCategory,
  submitQuickIp,
  submitQuickCharacter,
  toggleChar,
  setWishlist,
  setSaleReminderEnabled,
  toggleSaleReminderOffset,
  addSaleReminderOffset,
  removeSaleReminderOffset,
  hasActualPriceValue,
  clearUnitAcquiredAtList,
  normalizeUnitPriceValue,
  normalizeUnitPriceAt,
  clearUnitActualPriceList,
  clearUnitCharacterList,
  clearUnitCollectStatusList,
  syncAllUnitPricesFromActualPrice,
  openDatePicker,
  openUnitDatePicker,
  openSaleDateTimePicker,
  onDateConfirm,
  onUnitDateConfirm,
  openShippingDatePicker,
  onShippingDateConfirm,
  addShippingEvent,
  removeShippingEvent,
  normalizeShippingEventFee,
  clearShippingEvents,
  onSaleDateTimeConfirm,
  syncField,
  syncFieldLater,
  closeQuickCreate
} = useGoodsEditorForm({
  mode: props.mode,
  editId: props.editId,
  initialIsWishlist: props.initialIsWishlist,
  draftSlot: props.draftSlot,
  resumeDraft: props.resumeDraft,
  getMotionSourceEl: () => previewMediaRef.value,
  beforeNavigateAway: () => leaveGuardSlot.current?.markLeaveAllowed()
})

const previewCoverTone = computed(() => (
  primaryPreviewImage.value ? null : getCoverTone(form.category)
))

// ── 自定义字段（定义来自 presets，值随商品保存）──
// 「这件谷子添加了哪些字段」= customFields 里是否存在该键（空串 = 已添加未填）。
// 因此编辑页只渲染已添加的字段，而不是把所有定义都铺出来。
const attachedCustomFieldIds = computed(() =>
  Object.keys(form.customFields || {})
)

const attachedCustomFieldDefs = computed(() =>
  presets.customFieldDefs.filter((def) => hasCustomFieldKey(def.id))
)

/**
 * 当前编辑的是收藏还是心愿：字段定义的「生效范围」据此过滤选择器里的可选项。
 * 已添加的字段不受范围影响照常渲染 —— 收藏↔心愿互转时不能让已填的值凭空消失。
 */
const editorScope = computed(() => (form.isWishlist ? 'wishlist' : 'collection'))

function hasCustomFieldKey(defId) {
  return Object.prototype.hasOwnProperty.call(form.customFields || {}, defId)
}

/** select 的可选项；值不在定义里（选项被删/改名前的旧值）时也补进去，避免看不到已存值 */
function customFieldOptions(def) {
  const options = Array.isArray(def?.options) ? [...def.options] : []
  const current = String(form.customFields?.[def.id] || '').trim()
  if (current && !options.includes(current)) options.unshift(current)
  return options
}

/** 把某个字段添加到这件谷子（空串 = 已添加未填） */
function attachCustomField(defId) {
  if (!defId) return
  const current = form.customFields && typeof form.customFields === 'object' && !Array.isArray(form.customFields)
    ? form.customFields
    : {}
  if (Object.prototype.hasOwnProperty.call(current, defId)) return
  form.customFields = { ...current, [defId]: '' }
}

/** 从这件谷子移除某个字段（整对象替换，确保响应式一定刷新） */
function detachCustomField(defId) {
  const current = form.customFields
  if (!current || typeof current !== 'object' || Array.isArray(current)) return
  if (!Object.prototype.hasOwnProperty.call(current, defId)) return
  const next = { ...current }
  delete next[defId]
  form.customFields = next
}

const showCustomFieldPicker = ref(false)

function openCustomFieldPicker() {
  showCustomFieldPicker.value = true
}

const customFieldDatePickerTitle = computed(() => {
  const def = presets.customFieldDefs.find((item) => item.id === activeCustomFieldDateId.value)
  return def?.name || t('goods.editor.customFieldDatePlaceholder')
})

// add 模式下未保存离开不再二次确认：改由「单个草稿」承接未完成内容
const leaveGuard = useUnsavedLeaveGuard({
  isDirty: computed(() => props.mode === 'edit' && hasUnsavedChanges.value)
})
leaveGuardSlot.current = leaveGuard
const {
  showLeaveConfirm,
  requestLeave,
  confirmDiscard: confirmDiscardLeave,
  cancelLeaveConfirm
} = leaveGuard

function handleBack() {
  requestLeave()
}

const { tagSuggestions, applySuggestion, ignoreSuggestion, applyAllSuggestions } = useSmartTagging(form)

const isEditMode = computed(() => props.mode === 'edit')
const navBarTitle = computed(() => (isEditMode.value ? t('goods.editor.editGoods') : t('goods.editor.addGoods')))
const heroLabel = computed(() => {
  if (isEditMode.value) {
    return form.isWishlist ? t('goods.editor.editWishlist') : t('goods.editor.editCollection')
  }

  return form.isWishlist ? t('goods.editor.addWishlist') : t('goods.editor.addCollection')
})

const heroTitle = computed(() => {
  if (form.name) return form.name

  if (isEditMode.value) {
    return form.isWishlist ? t('goods.editor.adjustWishlistInfo') : t('goods.editor.adjustCollectionInfo')
  }

  return form.isWishlist ? t('goods.editor.noteDesiredGoods') : t('goods.editor.recordNewCollection')
})

const heroDesc = computed(() => {
  if (isEditMode.value) {
    return form.isWishlist
      ? t('goods.editor.editWishlistDesc')
      : t('goods.editor.editCollectionDesc')
  }

  return form.isWishlist
    ? t('goods.editor.addWishlistDesc')
    : t('goods.editor.addCollectionDesc')
})

const submitButtonLabel = computed(() => {
  if (form.isWishlist) return t('goods.editor.saveWishlist')
  return isEditMode.value ? t('goods.editor.saveChanges') : t('goods.editor.saveGoods')
})
const showTrackEditor = computed(() => String(form.category || '').trim() === 'CD/专辑')
const currencyOptions = computed(() =>
  CURRENCIES.map((c) => ({ label: `${c.symbol} ${c.name}`, value: c.code }))
)
const collectStatusOptions = computed(() => [
  { label: t('status.pendingShipment'), value: '待发货' },
  { label: t('status.pendingPayment'), value: '待补款' },
  { label: t('status.pendingShipping'), value: '待补邮' },
  { label: t('status.owned'), value: '已拥有' },
  { label: t('status.lost'), value: '丢失' },
  { label: t('status.gifted'), value: '已赠出' },
  { label: t('status.wantToSell'), value: '想出' },
  { label: t('status.sold'), value: '已出' },
  { label: t('status.onSale'), value: '在售' }
])
const currencySymbol = computed(() => CURRENCY_MAP[form.currency]?.symbol || '¥')

// ── 出谷信息(sell* 列)──
const hasUnitSaleStatuses = computed(() =>
  quantityNumber.value >= 2 &&
  (Array.isArray(form.unitCollectStatusList) ? form.unitCollectStatusList : []).some((s) => s === '在售' || s === '已出')
)
const showSaleSection = computed(() =>
  form.collectStatus === '在售' || form.collectStatus === '已出' || hasUnitSaleStatuses.value
)
const saleUnits = computed(() => {
  const units = []
  const list = Array.isArray(form.unitCollectStatusList) ? form.unitCollectStatusList : []
  list.forEach((status, index) => {
    if (status !== '在售' && status !== '已出') return
    const label = collectStatusOptions.value.find((o) => o.value === status)?.label || status
    units.push({ index, status, statusLabel: label, info: form.unitSaleInfoList?.[index] || {} })
  })
  return units
})
const showSellDatePicker = ref(false)
const sellDatePickerValue = ref([])
const sellDateTarget = ref(null) // null=整条,数字=件号

function openSellDatePicker(unitIndex) {
  sellDateTarget.value = unitIndex
  const current = unitIndex == null ? form.sellDate : (form.unitSaleInfoList?.[unitIndex]?.date || '')
  const normalized = String(current || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-')
    sellDatePickerValue.value = [year, String(Number(month)), String(Number(day))]
  } else {
    const now = new Date()
    sellDatePickerValue.value = [String(now.getFullYear()), String(now.getMonth() + 1), String(now.getDate())]
  }
  showSellDatePicker.value = true
}

function onSellDateConfirm({ selectedValues }) {
  if (Array.isArray(selectedValues) && selectedValues.length >= 3) {
    const date = `${selectedValues[0]}-${String(selectedValues[1]).padStart(2, '0')}-${String(selectedValues[2]).padStart(2, '0')}`
    if (sellDateTarget.value == null) form.sellDate = date
    else updateUnitSaleInfo(sellDateTarget.value, 'date', date)
  }
  showSellDatePicker.value = false
}

function updateUnitSaleInfo(index, field, value) {
  const list = Array.isArray(form.unitSaleInfoList) ? [...form.unitSaleInfoList] : []
  while (list.length <= index) list.push(null)
  const info = { ...(list[index] || {}) }
  const trimmed = String(value || '').trim()
  if (trimmed) info[field] = trimmed
  else delete info[field]
  list[index] = Object.keys(info).length > 0 ? info : null
  form.unitSaleInfoList = list
}
const saleReminderPresetOffsets = SALE_REMINDER_PRESET_OFFSETS
const customSaleReminderMinutes = ref('')
const customSaleReminderOffsets = computed(() =>
  form.saleReminderOffsets.filter((offset) => !saleReminderPresetOffsets.includes(offset))
)

// 心愿单=开售提醒；收藏待补邮/待补款=补邮/补款提醒（复用 saleAt 字段）
const saleReminderKind = computed(() =>
  getSaleReminderKind({
    isWishlist: form.isWishlist,
    collectStatus: form.collectStatus,
    unitCollectStatusList: form.unitCollectStatusList
  })
)
const showSaleReminderSection = computed(() => form.isWishlist || saleReminderKind.value !== 'sale')
const saleReminderTitleKey = computed(() => {
  if (saleReminderKind.value === 'postage') return 'goods.editor.pendingPostageReminder'
  if (saleReminderKind.value === 'payment') return 'goods.editor.pendingPaymentReminder'
  return 'goods.editor.saleReminder'
})
const saleReminderDescKey = computed(() => {
  if (saleReminderKind.value === 'postage') return 'goods.editor.pendingPostageReminderDesc'
  if (saleReminderKind.value === 'payment') return 'goods.editor.pendingPaymentReminderDesc'
  return 'goods.editor.saleReminderDesc'
})
const saleAtLabelKey = computed(() => {
  if (saleReminderKind.value === 'postage') return 'goods.editor.pendingPostageAt'
  if (saleReminderKind.value === 'payment') return 'goods.editor.pendingPaymentAt'
  return 'goods.editor.saleAt'
})
const saleAtSelectKey = computed(() => {
  if (saleReminderKind.value === 'postage') return 'goods.editor.selectPendingPostageTime'
  if (saleReminderKind.value === 'payment') return 'goods.editor.selectPendingPaymentTime'
  return 'goods.editor.selectSaleTime'
})

function formatSaleReminderOffset(offset) {
  const minutes = Number(offset)
  if (minutes === 0) {
    if (saleReminderKind.value === 'postage') return t('goods.editor.reminderAtPostage')
    if (saleReminderKind.value === 'payment') return t('goods.editor.reminderAtPayment')
    return t('goods.editor.reminderAtSale')
  }
  const key = {
    1440: 'goods.editor.reminderBeforeOneDay',
    60: 'goods.editor.reminderBeforeOneHour',
    10: 'goods.editor.reminderBeforeTenMinutes'
  }[minutes]
  if (key) return t(key)
  if (minutes % 1440 === 0) return t('goods.editor.reminderBeforeDays', { count: minutes / 1440 })
  if (minutes % 60 === 0) return t('goods.editor.reminderBeforeHours', { count: minutes / 60 })
  return t('goods.editor.reminderBeforeMinutes', { count: minutes })
}
function addCustomSaleReminder() {
  const minutes = Number(customSaleReminderMinutes.value)
  if (!Number.isInteger(minutes) || minutes < 0) return
  if (addSaleReminderOffset(minutes)) {
    customSaleReminderMinutes.value = ''
  }
}
const activeTab = ref('basic')
const tabItems = computed(() => {
  const items = [
    {
      key: 'basic',
      label: t('goods.editor.tabBasic'),
      badge: Boolean(nameError.value || !String(form.name || '').trim())
    },
    {
      key: 'extra',
      label: t('goods.editor.tabExtra')
    },
    {
      key: 'images',
      label: t('goods.editor.tabImages')
    },
    {
      key: 'price',
      label: t('goods.editor.tabPrice'),
      badge: Boolean(priceError.value)
    },
    {
      key: 'notes',
      label: t('goods.editor.tabNotes')
    }
  ]

  if (!form.isWishlist) {
    items.push({
      key: 'timeline',
      label: t('goods.editor.tabTimeline')
    })
  }

  if (showTrackEditor.value) {
    items.push({
      key: 'music',
      label: t('goods.editor.tabMusic')
    })
  }

  return items
})

function getScrollContainer() {
  return formRootRef.value?.closest?.('.page-body') || null
}

function scrollCurrentTabToTop() {
  scrollToTopAnimated(() => getScrollContainer(), 220)
}

function setActiveTab(tabKey, options = {}) {
  if (!tabItems.value.some((item) => item.key === tabKey)) return
  if (activeTab.value === tabKey && !options.force) {
    if (options.scroll !== false) scrollCurrentTabToTop()
    return
  }
  activeTab.value = tabKey
  if (options.scroll !== false) {
    nextTick(() => {
      scrollCurrentTabToTop()
    })
  }
}

function focusActiveErrorField() {
  if (nameError.value) {
    nameInputRef.value?.focus?.()
    nameInputRef.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    return true
  }
  if (priceError.value) {
    priceInputRef.value?.focus?.()
    priceInputRef.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    return true
  }
  return false
}

async function handleFormSubmit(event) {
  await handleSubmit(event)
  await nextTick()

  if (nameError.value) {
    setActiveTab('basic', { force: true })
    await nextTick()
    focusActiveErrorField()
    return
  }

  if (priceError.value) {
    setActiveTab('price', { force: true })
    await nextTick()
    focusActiveErrorField()
  }
}

// ============ 拍照识别：上传一张图 → 认出字段 → 预填表单 ============

/**
 * 识别结果字段 → 表单字段标签。直接复用编辑页已有文案，不新造一套同义词
 * （name 取 nameRequired 是因为该 key 的值就是「名称」，星号在模板里单独渲染）。
 */
const PHOTO_RECOGNIZE_FIELD_LABEL_KEYS = {
  name: 'goods.editor.nameRequired',
  category: 'common.category',
  ip: 'common.ip',
  characters: 'common.character',
  price: 'goods.editor.priceLabel',
  actualPrice: 'goods.editor.actualPrice',
  acquiredAt: 'goods.editor.purchaseDate'
}

/** 只在新增页出现：编辑页是在改既有数据，不该拿识别结果去覆盖 */
const showPhotoRecognize = computed(() => props.mode === 'add')

const recognizing = ref(false)
const photoRecognizeController = ref(null)
const photoRecognizeSummary = ref(null)
const photoRecognizeNeedsConfig = ref(false)
const photoRecognizeErrorText = ref('')
const photoRecognizeUndo = ref(null)

const photoRecognizeHasError = computed(
  () => photoRecognizeNeedsConfig.value || Boolean(photoRecognizeErrorText.value)
)
const photoRecognizeHint = computed(() => {
  if (photoRecognizeNeedsConfig.value) return t('goods.photoScan.notConfigured')
  return photoRecognizeErrorText.value
})

function resetPhotoRecognizeFeedback() {
  photoRecognizeSummary.value = null
  photoRecognizeNeedsConfig.value = false
  photoRecognizeErrorText.value = ''
  photoRecognizeUndo.value = null
}

/**
 * 识别链路动态 import：/add 是高频入口，识别栈（结构化抽取 → visionClient →
 * @capacitor/core）只在真的点按钮时才进这个 chunk。
 */
async function loadPhotoRecognition() {
  const [recognize, planner, vocabulary, backends] = await Promise.all([
    import('@/services/recognition/recognizeImage'),
    import('@/services/recognition/planFormPrefill'),
    import('@/services/recognition/mapToPresets'),
    import('@/services/recognition/backends')
  ])
  return {
    recognizeImage: recognize.recognizeImage,
    planFormPrefill: planner.planFormPrefill,
    buildVocabulary: vocabulary.buildVocabulary,
    hasRecognitionBackend: backends.hasRecognitionBackend
  }
}

async function handlePhotoRecognize() {
  if (recognizing.value) return
  resetPhotoRecognizeFeedback()

  const picked = await pickImageForRecognition().catch((error) => {
    console.warn('[photo-recognize] 选择图片失败', error)
    return null
  })
  if (!picked) return // 用户取消

  recognizing.value = true
  // 慢端点一次要等几十秒：给用户一条自己结束等待的路
  photoRecognizeController.value = new AbortController()
  flushActiveInput()
  try {
    const { recognizeImage, planFormPrefill, buildVocabulary, hasRecognitionBackend } =
      await loadPhotoRecognition()

    // 入口不隐藏：没配模型时点一下才知道该去配，比藏起来更容易被发现
    if (!hasRecognitionBackend()) {
      photoRecognizeNeedsConfig.value = true
      return
    }

    const result = await recognizeImage({
      image: picked,
      vocabulary: buildVocabulary(presets),
      signal: photoRecognizeController.value.signal
    })

    await applyPhotoRecognition(result, planFormPrefill)
  } catch (error) {
    if (error?.name === 'AbortError') return
    console.warn('[photo-recognize] 识别失败', error)
    photoRecognizeErrorText.value = String(error?.message || '').trim() || t('goods.photoScan.failed')
    showGlobalToast(photoRecognizeErrorText.value)
  } finally {
    photoRecognizeController.value = null
    recognizing.value = false
  }
}

/** 用户主动结束等待（慢端点 / 点错了） */
function cancelPhotoRecognize() {
  photoRecognizeController.value?.abort()
}

/**
 * 把识别结果落进表单。只填空字段、不改用户已填内容（判定在 planFormPrefill 里，纯函数可测）。
 * @param {{ fields: Record<string, any> }} result
 * @param {Function} planFormPrefill
 */
async function applyPhotoRecognition(result, planFormPrefill) {
  const plan = planFormPrefill({
    fields: result?.fields,
    current: {
      name: form.name,
      category: form.category,
      ip: form.ip,
      characters: form.characters,
      price: form.price,
      actualPrice: form.actualPrice,
      acquiredAt: form.acquiredAt
    },
    // 心愿单模式下这两个字段会被表单自己清空，预填只会留一个看不见的脏值
    exclude: form.isWishlist ? ['actualPrice', 'acquiredAt'] : []
  })

  const undo = {}
  for (const field of Object.keys(plan.assignments)) {
    undo[field] = Array.isArray(form[field]) ? [...form[field]] : form[field]
  }

  // 先写 ip 再写角色：ip 变化会触发「按 IP 过滤角色」的 watcher，
  // 若同一次 flush 里已经写了角色，识别出的角色会在词表里找不到而被抹掉。
  if (plan.assignments.ip !== undefined) {
    form.ip = plan.assignments.ip
    await nextTick()
  }

  for (const [field, value] of Object.entries(plan.assignments)) {
    if (field === 'ip') continue
    form[field] = Array.isArray(value) ? [...value] : value
  }

  // 入手价默认折叠在「补充入手价」里，填了就把面板展开，否则用户看不到
  if (plan.assignments.actualPrice !== undefined) showActualPriceInput.value = true

  photoRecognizeUndo.value = Object.keys(undo).length > 0 ? undo : null

  if (plan.filled.length === 0 && plan.skipped.length === 0) {
    showGlobalToast(t('goods.photoScan.empty'))
    return
  }

  photoRecognizeSummary.value = plan

  // 带用户去填了东西的 tab，否则在别的 tab 上根本看不到识别结果
  const onBasicTab = ['name', 'category', 'ip', 'characters']
  if (plan.filled.some((field) => onBasicTab.includes(field))) setActiveTab('basic', { force: true })
  else if (plan.filled.length > 0) setActiveTab('price', { force: true })
}

/** 撤销本次识别填入的内容（只回滚它填过的字段） */
function undoPhotoRecognize() {
  const undo = photoRecognizeUndo.value
  if (undo) {
    for (const [field, value] of Object.entries(undo)) {
      form[field] = Array.isArray(value) ? [...value] : value
    }
  }
  resetPhotoRecognizeFeedback()
}

function goConfigureAiService() {
  router.push({ name: NAVIGATE_PAGES.ai_service }).catch(() => {})
}

watch(showTrackEditor, (visible) => {
  if (!visible && activeTab.value === 'music') {
    setActiveTab('basic', { scroll: false })
  }
})

// Do not persist editor tab to sessionStorage for goods editor.

function resizeNoteTextarea() {
  const el = noteInputRef.value
  if (!el || el.offsetParent === null) return
  resizeTextarea(el)
}

watch(
  () => form.note,
  async () => {
    await nextTick()
    resizeNoteTextarea()
  },
  { immediate: true }
)

watch(activeTab, async () => {
  if (activeTab.value === 'notes') {
    await nextTick()
    resizeNoteTextarea()
  }
})

watch(
  tabItems,
  (items) => {
    if (!items.some((item) => item.key === activeTab.value)) {
      activeTab.value = items[0]?.key || 'basic'
    }
  },
  { immediate: true }
)

// Always default to 'basic' when adding or editing so entering editor
// always lands on 基础信息. Do not restore previously selected tab.
try {
  if (props.mode === 'add' || props.mode === 'edit') {
    activeTab.value = 'basic'
  }
} catch {
  // ignore
}
</script>

<style scoped src="../../assets/goodsEditorForm.css"></style>

