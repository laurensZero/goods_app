<template>
  <div class="page add-page">
    <main class="page-body">
      <NavBar :title="navBarTitle" show-back @back="handleBack" />

      <form ref="formRootRef" class="editor-form" @submit.prevent="handleFormSubmit($event)">
        <section class="manage-hero">
          <div class="preview-stage">
            <div class="preview-glow" />
            <div ref="previewMediaRef" class="preview-media" :class="{ 'preview-media--empty': !primaryPreviewImage }">
              <LazyCachedImage
                v-if="primaryPreviewImage"
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

                <label class="field">
                  <span class="field-label">{{ t('goods.editor.variant') }}</span>
                  <input
                    v-model="form.variant"
                    type="text"
                    :placeholder="t('goods.editor.variantPlaceholder')"
                  />
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

                <div class="field">
                  <span class="field-label">{{ t('goods.editor.customTags') }}</span>
                  <TagInput v-model="form.tags" :placeholder="t('goods.editor.tagPlaceholder')" />
                </div>
              </div>
            </section>

              <section v-show="activeTab === 'location'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'location' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.editor.locationInfo') }}</p>
                <h2 class="section-title">{{ t('goods.editor.locationTitle') }}</h2>
              </div>

              <div class="field-card">
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
            </section>

              <section v-show="activeTab === 'images'" class="tab-panel" :class="{ 'tab-panel--active': activeTab === 'images' }">
              <div class="section-head">
                <p class="section-label">{{ t('goods.editor.visualInfo') }}</p>
                <h2 class="section-title">{{ t('goods.editor.tabImages') }}</h2>
              </div>

              <div class="field-card">
                <div class="field">
                  <span class="field-label">{{ t('goods.editor.imageGallery') }}</span>
                  <GoodsImageManager v-model="form.images" :hint="form.characters[0] || ''" />
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
                        <label class="price-row__field price-row__field--small">
                          <span class="field-label">{{ t('goods.editor.shippingFee') }}</span>
                          <input
                            v-model="form.shippingFee"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0.00"
                            @blur="form.shippingFee = normalizeUnitPriceValue(form.shippingFee)"
                            @change="form.shippingFee = normalizeUnitPriceValue(form.shippingFee)"
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
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { flushActiveInput } from '@/utils/commitActiveInput'
import { useGoodsEditorForm } from '@/composables/goods/useGoodsEditorForm'
import { useSmartTagging } from '@/composables/goods/useSmartTagging'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
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
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { prepareGoodsHeroBack } from '@/utils/platform/nativeGoodsHeroTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import { useRouter } from 'vue-router'
import { resizeTextarea } from '@/utils/textarea'
import { CURRENCIES, CURRENCY_MAP } from '@/constants/currencies'

const { t } = useI18n()

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

const previewMediaRef = ref(null)
const formRootRef = ref(null)

const {
  presets,
  form,
  showPointsInput,
  showActualPriceInput,
  showUnitAcquiredAtInput,
  showUnitActualPriceInput,
  showUnitCharacterInput,
  showUnitCollectStatusInput,
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
  hasUnitCollectStatusValue,
  disableActualPriceInput,
  disableCollectStatusInput,
  isTabletViewport,
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
  clearUnitCollectStatusList,
  syncAllUnitDatesFromPrimaryDate,
  syncAllUnitPricesFromActualPrice,
  openDatePicker,
  openUnitDatePicker,
  onDateConfirm,
  onUnitDateConfirm,
  syncField,
  syncFieldLater,
  closeQuickCreate
} = useGoodsEditorForm({
  mode: props.mode,
  editId: props.editId,
  initialIsWishlist: props.initialIsWishlist,
  getMotionSourceEl: () => previewMediaRef.value
})

const router = useRouter()
function handleBack() {
  runWithRouteTransition(() => router.back(), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
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
const activeTab = ref('basic')
const tabItems = computed(() => {
  const items = [
    {
      key: 'basic',
      label: t('goods.editor.tabBasic'),
      badge: Boolean(nameError.value || !String(form.name || '').trim())
    },
    {
      key: 'location',
      label: t('goods.editor.tabLocation')
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

watch(showTrackEditor, (visible) => {
  if (!visible && activeTab.value === 'music') {
    setActiveTab('basic', { scroll: false })
  }
})

// Do not persist editor tab to sessionStorage for goods editor.

watch(
  () => form.note,
  async () => {
    await nextTick()
    resizeTextarea(noteInputRef.value)
  },
  { immediate: true }
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

