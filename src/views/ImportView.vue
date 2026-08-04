<template>
  <div class="page import-page">
    <NavBar :title="pageTitle" show-back @back="handleBack" />

    <main class="page-body">
      <section class="search-section">
        <div class="search-card">
          <div class="search-head">
            <p class="search-label">{{ quickSearchLabel }}</p>
            <h2 class="search-title">{{ quickSearchTitle }}</h2>
          </div>

          <div class="search-row">
            <input
              v-model="searchKeyword"
              type="text"
              class="search-input"
              :placeholder="quickSearchPlaceholder"
              @keydown.enter.prevent="handleGoodsSearch"
            />
            <button class="search-btn" type="button" :disabled="searching" @click="handleGoodsSearch">
              {{ searching ? t('import.searching') : t('common.search') }}
            </button>
          </div>

          <p v-if="searchError" class="search-error">{{ searchError }}</p>

          <div v-if="visibleSearchResults.length > 0" class="search-results">
            <button
              v-for="item in visibleSearchResults"
              :key="item.goods_id"
              type="button"
              class="search-result-card"
              :class="{ 'search-result-card--selected': selectedSearchGoodsId === item.goods_id }"
              @click="selectSearchResult(item)"
            >
              <div class="search-result-thumb">
                <img v-if="getSearchResultCover(item)" :src="getSearchResultCover(item)" :alt="item.name" loading="lazy" />
                <span v-else>{{ (item.name || '?').charAt(0) }}</span>
              </div>
              <span class="search-result-name">{{ item.name }}</span>
            </button>
          </div>

          <div v-if="showSearchToggle" class="search-results-toggle-wrap">
            <button
              type="button"
              class="search-results-toggle"
              :class="{ 'search-results-toggle--expanded': searchExpanded }"
              @click="toggleSearchExpanded"
            >
              {{ searchExpanded ? t('import.collapseResults') : t('import.expandMore') }}
            </button>
          </div>

          <div
            v-if="showSearchLoadMoreStatus"
            ref="searchLoadMoreRef"
            class="search-results-status"
          >
            <span v-if="searchLoadingMore">{{ t('import.loadingMore') }}</span>
            <template v-else>
              <span>{{ t('import.scrollForMore') }}</span>
              <button type="button" class="search-results-load-more" @click="loadMoreSearchResults">
                {{ t('import.loadMore') }}
              </button>
            </template>
          </div>
        </div>
      </section>

      <!-- ① URL 输入区 -->
      <section class="url-section">
        <div class="url-card">
          <div class="url-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div class="url-body">
            <p class="url-hint">{{ urlHintText }}</p>
            <div class="url-input-row">
              <textarea
                ref="urlInputRef"
                :value="urlInput"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                class="url-input"
                :placeholder="urlPlaceholder"
                @input="syncUrlInput($event)"
                @blur="syncUrlInput($event)"
                @change="syncUrlInput($event)"
                @compositionend="syncUrlInput($event)"
                @paste="syncUrlInputLater"
              />
              <button
                class="btn-parse"
                :class="{ 'btn-parse--loading': parsing || batchParsing }"
                :disabled="parsing || batchParsing || batchStep === 'list'"
                @pointerdown="syncUrlInput()"
                @click="batchMode ? handleBatchImport() : handleParse()"
              >
                <span v-if="!parsing && !batchParsing">{{ batchMode ? batchParseButtonText : parseButtonText }}</span>
                <span v-else class="parse-spinner" />
              </button>
            </div>
            <p v-if="parseError" class="parse-error">{{ parseError }}</p>
          </div>
        </div>
      </section>

      <div class="import-entry-list">
        <button
          class="import-entry import-entry--cart"
          type="button"
          @click="runWithRouteTransition(() => $router.push(isWishlistMode ? '/cart-import?mode=wishlist' : '/cart-import'), { direction: 'forward' })"
        >
          <div class="ie-icon ie-icon--cart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="18" cy="20" r="1.5" />
              <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.9a1 1 0 0 0 1-.77L21 7H7.4" />
            </svg>
          </div>
          <div class="ie-body">
            <p class="ie-title">{{ isWishlistMode ? t('import.cartImportWishlist') : t('import.cartImport') }}</p>
            <p class="ie-sub">{{ isWishlistMode ? t('import.cartImportWishlistDesc') : t('import.cartImportDesc') }}</p>
          </div>
          <svg class="ie-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>

        <button v-if="!isWishlistMode" class="import-entry" type="button" @click="runWithRouteTransition(() => $router.push('/account-import'), { direction: 'forward' })">
          <div class="ie-icon ie-icon--account">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="7" r="4"/>
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
            <path d="M16 11h6M19 8v6"/>
          </svg>
          </div>
          <div class="ie-body">
            <p class="ie-title">{{ t('import.account') }}</p>
            <p class="ie-sub">{{ t('import.accountDesc') }}</p>
          </div>
          <svg class="ie-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      <!-- ② 解析结果 / 编辑表单（解析成功后展示，仅单一模式） -->
      <transition name="result-fade">
        <div v-if="parsed && !batchMode" class="result-area">
          <!-- 预览卡 -->
          <section class="manage-hero">
            <div class="preview-stage">
              <div class="preview-glow" />
              <div class="preview-media" :class="{ 'preview-media--empty': !form.image }">
                <img v-if="form.image" :src="form.image" :alt="form.name" class="preview-image" />
                <span v-else class="preview-fallback">{{ form.name?.trim().charAt(0).toUpperCase() || t('goods.heroFallbackGoods') }}</span>
              </div>
            </div>

            <article class="hero-card">
              <p class="hero-label">{{ isWishlistMode ? t('import.fromMihoyoWishlist') : t('import.fromMihoyo') }}</p>
              <h1 class="hero-title">{{ form.name || t('import.goodsName') }}</h1>
              <p class="hero-desc">{{ isWishlistMode ? t('import.wishlistDesc') : t('import.collectionDesc') }}</p>
            </article>
          </section>

          <!-- 基础信息 -->
          <section class="form-section">
            <div class="section-head">
              <p class="section-label">{{ t('import.recognizedInfo') }}</p>
              <h2 class="section-title">{{ t('import.goodsInfo') }}</h2>
            </div>
            <div class="field-card">
              <label class="field">
                <span class="field-label">{{ t('common.name') }} <span class="required">*</span></span>
                <input v-model="form.name" type="text" :placeholder="t('import.goodsName')" />
              </label>
              <label class="field">
                <span class="field-label">{{ t('common.category') }}</span>
                <AppSelect v-model="form.category" :options="presets.categories" :placeholder="t('import.selectCategory')" />
              </label>
              <label class="field">
                <span class="field-label">IP</span>
                <AppSelect v-model="form.ip" :options="presets.ips" :placeholder="t('import.selectIp')" />
              </label>
              <!-- 角色款式选择器：用户点选要买的那个 -->
              <div v-if="parsedVariants.length > 0" class="field">
                <div class="variant-field-head">
                  <span class="field-label">
                    {{ t('import.selectVariant') }}
                    <span class="auto-badge">{{ t('import.variantCount', { count: parsedVariants.length }) }}</span>
                  </span>
                  <button
                    v-if="selectedVariantKey"
                    type="button"
                    class="variant-field-toggle"
                    @click="variantSectionCollapsed = !variantSectionCollapsed"
                  >
                    {{ variantSectionCollapsed ? t('import.expand') : t('import.collapse') }}
                  </button>
                </div>
                <p v-if="variantSectionCollapsed && selectedVariantName" class="variant-field-match">
                  {{ t('import.matched', { name: selectedVariantName }) }}
                </p>
                <div v-if="!variantSectionCollapsed" class="variant-grid">
                  <button
                    v-for="v in sortedParsedVariants"
                    :key="v.key || v.text"
                    type="button"
                    class="variant-btn"
                    :class="{ 'variant-btn--selected': isVariantSelected(v) }"
                    @click="handleVariantSelect(v)"
                  >
                    <div v-if="isVariantSuggested(v)" class="variant-suggest-tag">{{ t('import.guessYouWant') }}</div>
                    <div v-if="v.cover_url || v.img_url" class="variant-img-wrap">
                      <img :src="v.cover_url || v.img_url" class="variant-img" />
                    </div>
                    <span class="variant-name">{{ displayVariantText(v.text) }}</span>
                    <div v-if="isVariantSelected(v)" class="variant-check">✓</div>
                  </button>
                </div>
              </div>
              <!-- 角色显示（智能建议或已识别） -->
              <div v-if="form.characters.length > 0" class="field">
                <span class="field-label">{{ t('common.character') }} <span class="auto-badge">{{ t('import.autoRecognized') }}</span></span>
                <div class="char-chips">
                  <span
                    v-for="char in form.characters"
                    :key="char"
                    class="char-chip"
                  >
                    {{ char }}
                    <button class="char-chip-del" type="button" @click="form.characters = form.characters.filter(c => c !== char)">×</button>
                  </span>
                </div>
              </div>
              <TagSuggestionPanel
                :suggestions="tagSuggestions"
                @apply="applySuggestion"
                @ignore="ignoreSuggestion"
                @apply-all="applyAllSuggestions"
              />
              <label class="field">
                <span class="field-label">{{ t('import.imageUrl') }}</span>
                <input v-model="form.image" type="text" inputmode="url"
                  autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
                  placeholder="https://..." />
              </label>
              <!-- 图片选择器：横向滚动所有可用图（支持多选） -->
              <div v-if="parsedImages.length > 1" class="field">
                <span class="field-label">{{ t('import.selectImages') }} <span v-if="form.images.length > 1" class="img-picker-count">{{ form.images.length }}</span></span>
                <div class="img-picker-scroll">
                  <button
                    v-for="(imgUrl, idx) in parsedImages"
                    :key="idx"
                    type="button"
                    class="img-picker-item"
                    :class="{ 'img-picker-item--active': form.images.includes(imgUrl) }"
                    @click="toggleFormImage(imgUrl)"
                  >
                    <img :src="imgUrl + '?x-oss-process=image/resize,m_lfit,w_120,h_120,limit_1/format,webp'" :alt="t('import.imageAlt', { index: idx + 1 })" />
                    <span v-if="idx === 0" class="img-picker-badge">{{ t('import.cover') }}</span>
                    <div v-if="form.images.includes(imgUrl)" class="img-picker-check">✓</div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 购入信息 -->
          <section class="form-section">
            <div class="section-head">
              <p class="section-label">{{ isWishlistMode ? t('import.targetInfo') : t('import.purchaseRecord') }}</p>
              <h2 class="section-title">{{ isWishlistMode ? t('import.budgetAndSource') : t('import.priceAndSource') }}</h2>
            </div>
            <div class="field-card">
              <label class="field">
                <span class="field-label">{{ isWishlistMode ? t('import.targetPrice') : t('import.price') }}</span>
                <input v-model.number="form.price" type="number" placeholder="0.00" min="0" step="1" />
                <p v-if="formPriceError" class="parse-error">{{ formPriceError }}</p>
              </label>
              <label class="field">
                <span class="field-label">{{ t('import.purchaseChannel') }}</span>
                <input v-model="form.source" type="text" :placeholder="t('import.mihoyo')" />
              </label>
              <label class="field">
                <span class="field-label">{{ isWishlistMode ? t('import.expectedDate') : t('import.purchaseDate') }}</span>
                <button class="date-field" type="button" @click="openDatePicker">
                  <span :class="{ 'date-field__value--placeholder': !form.purchaseDate }">
                    {{ form.purchaseDate || (isWishlistMode ? t('import.optionalNoPlan') : t('import.selectDate')) }}
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

          <!-- 备注 -->
          <section class="form-section">
            <div class="section-head">
              <p class="section-label">{{ t('import.extraInfo') }}</p>
              <h2 class="section-title">{{ t('common.note') }}</h2>
            </div>
            <div class="field-card">
              <label class="field">
                <span class="field-label">{{ t('common.note') }}</span>
                <textarea
                  ref="notesTextareaRef"
                  v-model="form.notes"
                  class="markdown-textarea"
                  :placeholder="t('import.notesPlaceholder')"
                  rows="3"
                />
              </label>
              <MarkdownPreviewCard :content="form.notes" :title="t('import.livePreview')" />
            </div>
          </section>
        </div>
      </transition>

      <!-- 批量解析进度 -->
      <transition name="result-fade">
        <section v-if="batchStep === 'parsing'" class="batch-section">
          <div class="section-head">
            <p class="section-label">{{ t('import.batchParse') }}</p>
            <h2 class="section-title">{{ t('import.identifyingProgress', { done: batchParsedDoneCount, total: batchItems.length }) }}</h2>
          </div>
          <div class="field-card batch-progress-card">
            <div v-for="(item, i) in batchItems" :key="i" class="batch-progress-row">
              <span class="batch-status-indicator" :class="`batch-si--${item.status}`">
                <svg v-if="item.status === 'ready'" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span v-else-if="item.status === 'parsing'" class="parse-spinner batch-spinner" />
                <svg v-else-if="item.status === 'error'" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                </svg>
                <span v-else class="batch-si-dot" />
              </span>
              <span class="batch-progress-text">
                {{ item.status === 'ready' ? item.data?.name : shortenUrl(item.url) }}
              </span>
              <span v-if="item.status === 'error'" class="batch-progress-err">{{ item.error }}</span>
            </div>
          </div>
          <button class="batch-reparse-link" type="button" @click="cancelBatchParsing">
            {{ t('import.stopParsing') }}
          </button>
        </section>
      </transition>

      <!-- 批量导入结果列表 -->
      <transition name="result-fade">
        <section v-if="batchStep === 'list'" class="batch-section">
          <div class="section-head">
            <p class="section-label">
              {{ t('import.identifyComplete', { errorCount: batchErrorCount }) }}
            </p>
            <h2 class="section-title">{{ t('import.resultsReady', { count: batchReadyCount }) }}</h2>
          </div>
          <ul class="field-card batch-goods-list">
            <li
              v-for="(item, i) in batchItems"
              :key="i"
              class="batch-goods-row"
              :class="{ 'batch-goods-row--saved': item.status === 'saved', 'batch-goods-row--error': item.status === 'error' }"
            >
              <div class="batch-goods-thumb">
                <img
                  v-if="item.data?.image"
                  :src="item.data.image"
                  class="batch-goods-img"
                  loading="lazy"
                />
                <span v-else class="batch-goods-initial">{{ (item.data?.name || '?').charAt(0) }}</span>
              </div>
              <div class="batch-goods-info">
                <p class="batch-goods-name">{{ item.data?.name || shortenUrl(item.url) }}</p>
                <div class="batch-goods-meta">
                  <span v-if="isBatchItemOwned(item)" class="batch-meta-tag batch-meta-tag--owned">{{ t('import.maybeOwned') }}</span>
                  <span v-if="item.data?.price" class="batch-meta-tag batch-meta-tag--price">¥{{ item.data.price }}</span>
                  <span v-if="item.data?.ip" class="batch-meta-tag">{{ item.data.ip }}</span>
                  <span v-if="item.data?.variant" class="batch-meta-tag">{{ item.data.variant }}</span>
                  <span v-if="item.data?.variants?.length && !item.data?.variant" class="batch-meta-tag batch-meta-tag--hint">{{ t('import.variantsAvailable', { count: item.data.variants.length }) }}</span>
                  <span v-if="item.status === 'error'" class="batch-meta-tag batch-meta-tag--error">{{ item.error }}</span>
                </div>
              </div>
              <span v-if="item.status === 'saved'" class="batch-saved-badge">{{ t('import.saved') }}</span>
              <button
                v-if="item.status === 'ready'"
                class="batch-goods-edit-btn"
                type="button"
                :aria-label="t('common.edit')"
                @click="openBatchEdit(i)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                v-if="item.status !== 'saved'"
                class="batch-goods-remove-btn"
                type="button"
                :aria-label="t('common.remove')"
                @click="removeBatchItem(i)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          </ul>
          <button class="batch-reparse-link" type="button" @click="batchStep = 'input'; batchItems = []">
            {{ t('import.reinputLinks') }}
          </button>
        </section>
      </transition>

      <!-- 底部空白，防止内容被浮动按钮遮挡 -->
      <div style="height: 120px" />
    </main>

    <!-- 浮动保存按钮（Teleport 到 body，避免 will-change 影响 fixed 定位） -->
    <Teleport to="body">
      <!-- 单条模式保存 -->
      <div v-if="parsed && !batchMode" class="float-footer">
        <button class="btn-primary btn-float" @click="handleSave">{{ isWishlistMode ? t('import.addToWishlist') : t('import.saveGoods') }}</button>
      </div>
      <!-- 批量模式保存全部 -->
      <div v-if="batchStep === 'list' && batchItems.some(i => i.status === 'ready')" class="float-footer">
        <button class="btn-primary btn-float" :disabled="savingAll" @click="saveAllBatch">
          {{ savingAll ? t('import.saving') : t('import.saveAll', { count: batchReadyCount }) }}
        </button>
      </div>
      <!-- 批量编辑遮罩 -->
      <Transition name="batch-sheet-backdrop">
        <div v-if="editingBatchIdx >= 0" class="batch-edit-backdrop" @click="editingBatchIdx = -1" />
      </Transition>
      <!-- 批量编辑底部面板 -->
      <Transition name="batch-sheet-slide">
        <div v-if="editingBatchIdx >= 0" class="batch-edit-sheet">
          <div class="batch-edit-handle" />
          <p class="batch-edit-title">{{ t('import.editGoodsInfo') }}</p>
          <div class="batch-edit-form">
            <label class="field">
              <span class="field-label">{{ t('common.name') }}</span>
              <input v-model="batchEditForm.name" type="text" :placeholder="t('import.goodsName')" />
            </label>
            <label class="field">
              <span class="field-label">{{ t('common.category') }}</span>
              <AppSelect v-model="batchEditForm.category" :options="presets.categories" :placeholder="t('import.selectCategory')" />
            </label>
            <label class="field">
              <span class="field-label">IP</span>
              <AppSelect v-model="batchEditForm.ip" :options="presets.ips" :placeholder="t('import.selectIp')" />
            </label>
            <label class="field">
              <span class="field-label">{{ t('import.price') }}</span>
              <input v-model.number="batchEditForm.price" type="number" placeholder="0.00" min="0" step="1" />
              <p v-if="batchEditPriceError" class="parse-error">{{ batchEditPriceError }}</p>
            </label>
            <!-- 款式选择（有 SKU 变体时显示） -->
            <div v-if="batchEditVariants.length > 0" class="field">
              <span class="field-label">
                {{ t('import.selectVariant') }}
                <span class="auto-badge">{{ t('import.variantCount', { count: batchEditVariants.length }) }}</span>
              </span>
              <div class="variant-grid">
                <button
                  v-for="v in sortedBatchEditVariants"
                  :key="v.key"
                  type="button"
                  class="variant-btn"
                  :class="{ 'variant-btn--selected': batchEditSelectedVariantKey === v.key }"
                  @click="handleBatchVariantSelect(v)"
                >
                  <div v-if="isVariantSuggested(v)" class="variant-suggest-tag">{{ t('import.guessYouWant') }}</div>
                  <div class="variant-img-wrap">
                    <img
                      class="variant-img"
                      :src="v.cover_url || v.img_url"
                      :alt="v.text"
                    />
                  </div>
                  <span class="variant-name">{{ displayVariantText(v.text) }}</span>
                  <div v-if="batchEditSelectedVariantKey === v.key" class="variant-check">✓</div>
                </button>
              </div>
              <div v-if="batchEditSelectedVariantKey && batchEditSelectedCharacterName" class="save-char-row" @click="toggleBatchSaveAsCharacter">
                <span class="save-char-label">
                  {{ t('import.saveAsCharacter', { name: batchEditSelectedCharacterName }) }}
                </span>
                <div class="save-char-toggle" :class="{ 'save-char-toggle--on': batchEditSaveAsCharacter }">
                  <div class="save-char-knob" />
                </div>
              </div>
            </div>
            <!-- 图片选择（支持多选） -->
            <div v-if="batchEditImages.length > 1" class="field">
              <span class="field-label">{{ t('import.selectImages') }} <span v-if="batchEditForm.images.length > 1" class="img-picker-count">{{ batchEditForm.images.length }}</span></span>
              <div class="img-picker-scroll">
                <button
                  v-for="(imgUrl, idx) in batchEditImages"
                  :key="idx"
                  type="button"
                  class="img-picker-item"
                  :class="{ 'img-picker-item--active': batchEditForm.images.includes(imgUrl) }"
                  @click="toggleBatchEditImage(imgUrl)"
                >
                  <img :src="imgUrl + '?x-oss-process=image/resize,m_lfit,w_120,h_120,limit_1/format,webp'" :alt="t('import.imageAlt', { index: idx + 1 })" />
                  <span v-if="idx === 0" class="img-picker-badge">{{ t('import.cover') }}</span>
                  <div v-if="batchEditForm.images.includes(imgUrl)" class="img-picker-check">✓</div>
                </button>
              </div>
            </div>
            <label class="field">
              <span class="field-label">{{ t('import.purchaseDate') }}</span>
              <button class="date-field" type="button" @click="openBatchDatePicker">
                <span :class="{ 'date-field__value--placeholder': !batchEditForm.purchaseDate }">
                  {{ batchEditForm.purchaseDate || t('import.selectDate') }}
                </span>
                <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M8 3V7" />
                  <path d="M16 3V7" />
                  <path d="M3 10H21" />
                </svg>
              </button>
            </label>
            <label class="field">
              <span class="field-label">{{ t('common.note') }}</span>
              <textarea
                ref="batchNotesTextareaRef"
                v-model="batchEditForm.notes"
                class="markdown-textarea"
                rows="4"
                :placeholder="t('import.batchNotesPlaceholder')"
              />
            </label>
            <label class="field">
              <span class="field-label">{{ t('common.tag') }}</span>
              <TagInput v-model="batchEditForm.tags" :placeholder="t('import.tagsPlaceholder')" />
            </label>
            <MarkdownPreviewCard :content="batchEditForm.notes" :title="t('import.livePreview')" />
          </div>
          <div class="batch-edit-actions">
            <button class="batch-edit-cancel" type="button" @click="editingBatchIdx = -1">{{ t('common.cancel') }}</button>
            <button class="batch-edit-save" type="button" @click="saveBatchEdit">{{ t('common.done') }}</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 日期选择器弹层（teleport 到 body 防止被 float-footer 遮挡） -->
    <AppDatePicker
      v-model:show="showDatePicker"
      v-model="datePickerValue"
      :z-index="2000"
      :is-tablet="isTabletViewport"
      :title="t('import.selectPurchaseDate')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onDateConfirm"
    />

    <!-- 批量编辑日期选择器（z-index 高于批量编辑面板） -->
    <AppDatePicker
      v-model:show="showBatchDatePicker"
      v-model="batchDatePickerValue"
      :z-index="2100"
      :is-tablet="isTabletViewport"
      :title="t('import.selectPurchaseDate')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onBatchDateConfirm"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { useTabletViewport } from '@/composables/useTabletViewport'
import NavBar from '@/components/common/NavBar.vue'
import { runWithRouteTransition } from '@/utils/routeTransition'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import MarkdownPreviewCard from '@/components/common/MarkdownPreviewCard.vue'
import TagInput from '@/components/common/TagInput.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import {
  parseMihoyoUrl,
  isMihoyoGiftUrl,
  fetchGoodsDetail,
  getMihoyoShopCodeByIp,
} from '@/utils/mihoyo/index'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { showGlobalToast } from '@/utils/globalToast'
import { validatePrice } from '@/utils/validate'
import { resizeTextarea } from '@/utils/textarea'
import {
  displayVariantText,
  normalizeCharacterName,
} from '@/utils/variantText'
import {
  addMihoyoImportContextItem,
  applyMihoyoVariantMedia,
  buildMihoyoImportContext,
  getDefaultMihoyoImages,
  normalizeMihoyoImageList,
  resolveMihoyoImportDraft,
  resolveMihoyoVariantDraft,
} from '@/utils/mihoyo/importResolver'
import { useImportSearch, normalizeSearchHintText } from '@/composables/import/useImportSearch'
import { useBatchImport } from '@/composables/import/useBatchImport'
import { pinyinIncludes } from '@/utils/pinyin'
import { useSmartTagging } from '@/composables/goods/useSmartTagging'
import TagSuggestionPanel from '@/components/goods/TagSuggestionPanel.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const goodsStore = useGoodsStore()
const presets = usePresetsStore()

// 每个 IP 谷子数 top5 的角色集合（用于款式推荐）
const topCharactersPerIp = computed(() => {
  const countMap = goodsStore.characterCountMap
  const ipBuckets = new Map()
  for (const { name, ip } of presets.characters) {
    if (!name) continue
    const count = countMap.get(name) || 0
    if (count <= 0) continue
    const key = ip || ''
    if (!ipBuckets.has(key)) ipBuckets.set(key, [])
    ipBuckets.get(key).push({ name, count })
  }
  const result = new Set()
  for (const bucket of ipBuckets.values()) {
    bucket.sort((a, b) => b.count - a.count)
    for (const { name } of bucket.slice(0, 5)) {
      result.add(name)
    }
  }
  return result
})

function isVariantSelected(variant) {
  return selectedVariantKey.value === variant.key
}

function isVariantSuggested(variant) {
  const name = normalizeCharacterName(variant.text)
  return name ? topCharactersPerIp.value.has(name) : false
}

function getVariantCharacterCount(variant) {
  const name = normalizeCharacterName(variant.text)
  if (!name) return 0
  return goodsStore.characterCountMap.get(name) || 0
}

const isWishlistMode = computed(() => route.query.mode === 'wishlist')
const pageTitle = computed(() => isWishlistMode.value ? t('import.wishlistTitle') : t('import.mihoyo'))
const quickSearchLabel = computed(() => isWishlistMode.value ? t('import.wishlistQuickSearch') : t('import.mihoyoQuickSearch'))
const quickSearchTitle = computed(() => isWishlistMode.value ? t('import.searchByCharacter') : t('import.searchByKeyword'))
const quickSearchPlaceholder = computed(() => (
  isWishlistMode.value
    ? t('import.wishlistSearchPlaceholder')
    : t('import.searchPlaceholder')
))

function handleBack() {
  runWithRouteTransition(() => router.back(), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
}
const urlHintText = computed(() =>
  isWishlistMode.value
    ? t('import.wishlistUrlHint')
    : t('import.urlHint')
)
const urlPlaceholder = computed(() =>
  isWishlistMode.value
    ? t('import.wishlistUrlPlaceholder')
    : t('import.urlPlaceholder')
)
const parseButtonText = computed(() => t('import.parse'))

const { isTabletViewport, updateViewport } = useTabletViewport()

const urlInputRef = ref(null)
const urlInput = ref('')
const notesTextareaRef = ref(null)
const batchNotesTextareaRef = ref(null)
const parsing = ref(false)
const parseError = ref('')
const formPriceError = ref('')
const parsed = ref(false)

const wishlistCharacterOptions = computed(() => {
  const seen = new Map()

  for (const item of presets.characters) {
    const name = String(item?.name || item || '').trim()
    const ip = String(item?.ip || '').trim()
    if (!getMihoyoShopCodeByIp(ip)) continue
    if (!name) continue
    if (!seen.has(name)) {
      seen.set(name, { name, ip })
      continue
    }
    if (!seen.get(name).ip && ip) {
      seen.set(name, { name, ip })
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
})

// ── Composables ──
const {
  searchKeyword, searchExpanded, searching, searchLoadingMore, searchError,
  variantSearchHint, selectedSearchCharacter, selectedSearchGoodsId, searchLoadMoreRef,
  visibleSearchResults, showSearchToggle, showSearchLoadMoreStatus,
  getSearchResultCover, handleGoodsSearch, loadMoreSearchResults, toggleSearchExpanded, selectSearchResult, shortenUrl
} = useImportSearch({ goodsStore, wishlistCharacterOptions, setUrlInputValue, handleParse })

const {
  batchStep, batchItems, batchParsing, savingAll, editingBatchIdx,
  batchEditForm, batchEditPriceError, batchEditImages,
  batchEditVariants, batchEditSelectedVariantKey, batchEditSelectedCharacterName,
  batchEditSaveAsCharacter, batchMode,
  batchParseButtonText, batchReadyCount, batchErrorCount,
  batchParsedDoneCount, isBatchItemOwned,
  handleBatchImport, cancelBatchParsing, removeBatchItem,
  openBatchEdit, saveBatchEdit, handleBatchVariantSelect,
  toggleBatchSaveAsCharacter, toggleBatchEditImage, saveAllBatch
} = useBatchImport({
  urlInput, urlInputRef, syncUrlInput, isWishlistMode,
  ensureHistoricalTagContext, updateHistoricalTagContextFromItem
})


const parsedImages = ref([])  // 当前商品可用图
const parsedBaseImages = ref([])  // 不区分款式的基础图
const parsedVariants = ref([])  // SKU 变体对象 { text, key, img_url, cover_url? }
const variantSectionCollapsed = ref(false)
const selectedVariantKey = ref('')  // 当前选中的 SKU key
const selectedVariantName = ref('')  // 选中款式清洗后的显示名
const selectedCharacterName = ref('')  // 选中款式对应的角色名（会归并 A/B/C/D 尾缀）
const saveAsCharacter = ref(false)  // 是否将选中款式记录为角色
const resolvedBaseCharacters = ref([])

// 按角色谷子数量降序排列的款式列表（推荐在前）
const sortedParsedVariants = computed(() => {
  const variants = parsedVariants.value
  if (!variants.length) return variants
  return [...variants].sort((a, b) => getVariantCharacterCount(b) - getVariantCharacterCount(a))
})

const sortedBatchEditVariants = computed(() => {
  const variants = batchEditVariants.value
  if (!variants.length) return variants
  return [...variants].sort((a, b) => getVariantCharacterCount(b) - getVariantCharacterCount(a))
})

// ── 日期选择器 ──
const showDatePicker = ref(false)
const showBatchDatePicker = ref(false)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
const datePickerValue = ref(toDatePickerValue(''))
const batchDatePickerValue = ref(toDatePickerValue(''))

const form = reactive({
  name: '',
  category: '',
  ip: '',
  goodsId: '',
  image: '',
  images: [],
  price: '',
  source: '米游铺',
  purchaseDate: '',
  notes: '',
  characters: [],
})

const { tagSuggestions, applySuggestion, ignoreSuggestion, applyAllSuggestions } = useSmartTagging(form)

watch(() => form.price, () => {
  if (formPriceError.value) {
    formPriceError.value = ''
  }
})

watch(() => batchEditForm.price, () => {
  if (batchEditPriceError.value) {
    batchEditPriceError.value = ''
  }
})

watch(
  () => form.notes,
  async () => {
    await nextTick()
    resizeTextarea(notesTextareaRef.value)
  },
  { immediate: true }
)

watch(
  [editingBatchIdx, () => batchEditForm.notes],
  async () => {
    if (editingBatchIdx.value < 0) return
    await nextTick()
    resizeTextarea(batchNotesTextareaRef.value)
  },
  { immediate: true }
)

const preferredSearchCharacterName = computed(() =>
  normalizeSearchHintText(selectedSearchCharacter.value || searchKeyword.value)
)

let historicalTagContextCache = null

function seedHistoricalTagContextFromGoods() {
  historicalTagContextCache = buildMihoyoImportContext({
    goodsList: goodsStore?.list || [],
    presetCharacters: presets.characters || [],
    categories: presets.categories || [],
    ips: presets.ips || [],
  })
  return historicalTagContextCache
}

function ensureHistoricalTagContext() {
  return historicalTagContextCache || seedHistoricalTagContextFromGoods()
}

function updateHistoricalTagContextFromItem(item) {
  const context = ensureHistoricalTagContext()
  return addMihoyoImportContextItem(context, item)
}


function syncUrlInput(event) {
  if (event?.target) {
    urlInput.value = event.target.value ?? ''
    return
  }

  if (urlInputRef.value) {
    urlInput.value = urlInputRef.value.value ?? ''
  }
}

function syncUrlInputLater() {
  requestAnimationFrame(() => {
    syncUrlInput()
  })
}

function setUrlInputValue(value) {
  const nextValue = String(value || '')
  urlInput.value = nextValue
  if (urlInputRef.value) {
    urlInputRef.value.value = nextValue
  }
}

// ── 图片多选切换 ──
function toggleFormImage(imgUrl) {
  const idx = form.images.indexOf(imgUrl)
  if (idx >= 0) {
    form.images.splice(idx, 1)
  } else {
    form.images.push(imgUrl)
  }
  // 同步主图：始终以第一张选中的图为主图
  form.image = form.images[0] || ''
}

function applySelectedVariantMedia(variant) {
  const media = applyMihoyoVariantMedia(variant, parsedBaseImages.value, form.image)
  parsedImages.value = media.parsedImages
  form.images = media.images
  form.image = media.image

  if (media.price != null) {
    form.price = media.price
  }
}

function autoSelectVariantByHint() {
  const hint = normalizeSearchHintText(variantSearchHint.value).toLowerCase()
  if (!hint || !parsedVariants.value.length || selectedVariantKey.value) return

  const matched = parsedVariants.value.filter((variant) => {
    const text = String(variant.text || '').trim().toLowerCase()
    const display = displayVariantText(variant.text).trim().toLowerCase()
    const normalizedChar = normalizeCharacterName(variant.text).trim().toLowerCase()
    if (text.includes(hint) || display.includes(hint) || normalizedChar.includes(hint)) return true
    return pinyinIncludes(variant.text, hint) || pinyinIncludes(displayVariantText(variant.text), hint)
  })

  if (matched.length === 1) {
    handleVariantSelect(matched[0])
    variantSectionCollapsed.value = true
  }
}

function autoSelectSingleVariant() {
  if (selectedVariantKey.value) return
  if (!Array.isArray(parsedVariants.value) || parsedVariants.value.length !== 1) return

  handleVariantSelect(parsedVariants.value[0])
  variantSectionCollapsed.value = true
}

// ── 智能推算 ──
// ── 用户点击款式按钮：单选 + 自动匹配 SKU 专属图 ──
function handleVariantSelect(v) {
  if (selectedVariantKey.value === v.key) {
    // 再次点击同一个：取消选中
    selectedVariantKey.value = ''
    selectedVariantName.value = ''
    selectedCharacterName.value = ''
    saveAsCharacter.value = false
    variantSectionCollapsed.value = false
    parsedImages.value = [...parsedBaseImages.value]
    form.images = getDefaultMihoyoImages(parsedBaseImages.value)
    form.image = parsedBaseImages.value[0] || ''
    form.characters = [...resolvedBaseCharacters.value]
  } else {
    selectedVariantKey.value = v.key
    const resolvedVariant = resolveMihoyoVariantDraft({
      name: form.name,
      variant: v,
      context: ensureHistoricalTagContext(),
      preferredCharacter: selectedSearchCharacter.value ? preferredSearchCharacterName.value : '',
      currentCategory: form.category,
    })
    selectedVariantName.value = resolvedVariant.variantName
    selectedCharacterName.value = resolvedVariant.selectedCharacterName

    if (resolvedVariant.category) {
      if (!presets.categories.includes(resolvedVariant.category)) presets.addCategory(resolvedVariant.category)
      form.category = resolvedVariant.category
    }

    saveAsCharacter.value = Boolean(selectedCharacterName.value)
    form.characters = selectedCharacterName.value ? [selectedCharacterName.value] : []
    applySelectedVariantMedia(v)
  }
}

async function handleParse() {
  // Android 上 v-model 可能滞后，直接从 DOM 同步最新值
  syncUrlInput()
  const url = urlInput.value.trim()
  if (!url) return
  if (!isMihoyoGiftUrl(url)) {
    parseError.value = t('import.errorInvalidUrl')
    return
  }

  parsing.value = true
  parseError.value = ''
  parsed.value = false
  parsedVariants.value = []
  variantSectionCollapsed.value = false
  parsedImages.value = []
  parsedBaseImages.value = []
  resolvedBaseCharacters.value = []
  form.images = []
  selectedVariantKey.value = ''

  try {
    const result = await parseMihoyoUrl(url)
    const draft = resolveMihoyoImportDraft(result, {
      context: ensureHistoricalTagContext(),
      preferredCharacter: selectedSearchCharacter.value ? preferredSearchCharacterName.value : '',
    })

    // 1. 填入基础字段
    form.name = draft.name || ''
    form.category = draft.category || ''
    form.ip = draft.ip || ''
    form.image = draft.image || ''
    form.images = [...draft.images]
    form.price = draft.price !== '' ? draft.price : ''
    form.goodsId = draft.goodsId || ''
    form.characters = [...draft.characters]
    resolvedBaseCharacters.value = [...draft.characters]
    parsedBaseImages.value = [...draft.baseParsedImages]
    parsedImages.value = [...draft.parsedImages]
    parsedVariants.value = [...draft.variants]

    if (form.ip && !presets.ips.includes(form.ip)) presets.addIp(form.ip)
    if (form.category && !presets.categories.includes(form.category)) presets.addCategory(form.category)

    // 异步补充 main_url 展示图 + SKU 专属封面（不阻塞显示）
    if (result.goodsId) {
      fetchGoodsDetail(result.goodsId).then(({ mainImages, skuCovers, skuPrices, skuVariants, coverUrl }) => {
        const sourceVariants = skuVariants.length
          ? skuVariants
          : parsedVariants.value
        // 把 SKU cover_url + price 回填到对应变体
        parsedVariants.value = sourceVariants.map(v => ({
          ...v,
          cover_url: skuCovers[v.key] || v.cover_url || coverUrl || '',
          price: v.price ?? skuPrices[v.key] ?? null,
        }))
        // 多款式商品不再把整组 main_url 当成同一件商品的图片，避免不同款式混图
        if (!parsedVariants.value.length) {
          const extras = mainImages
            .map(u => (u || '').split('?')[0])
            .filter(u => u && !parsedBaseImages.value.includes(u))
          if (extras.length) {
            parsedBaseImages.value = normalizeMihoyoImageList([...parsedBaseImages.value, ...extras])
            parsedImages.value = [...parsedBaseImages.value]
            if (!form.images.length) {
              form.images = getDefaultMihoyoImages(parsedBaseImages.value)
              form.image = form.images[0] || form.image
            }
          }
        }
        autoSelectSingleVariant()
        autoSelectVariantByHint()
        if (selectedVariantKey.value) {
          const selected = parsedVariants.value.find(v => v.key === selectedVariantKey.value)
          applySelectedVariantMedia(selected)
        }
      }).catch(() => {})
    }

    selectedVariantKey.value = ''  // 重置选中状态
    autoSelectSingleVariant()
    autoSelectVariantByHint()
    updateHistoricalTagContextFromItem({
      ip: form.ip,
      characters: form.characters,
      tags: [],
    })

    parsed.value = true
  } catch (e) {
    parseError.value = e.message || t('import.errorParseFailed')
  } finally {
    parsing.value = false
  }
}

// ── 日期选择器逻辑 ──
function openDatePicker() {
  datePickerValue.value = toDatePickerValue(form.purchaseDate)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  form.purchaseDate = `${year}-${month}-${day}`
  datePickerValue.value = [year, month, day]
  showDatePicker.value = false
}

// ── 批量编辑日期选择器 ──
function openBatchDatePicker() {
  batchDatePickerValue.value = toDatePickerValue(batchEditForm.purchaseDate)
  showBatchDatePicker.value = true
}

function onBatchDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  batchEditForm.purchaseDate = `${year}-${month}-${day}`
  batchDatePickerValue.value = [year, month, day]
  showBatchDatePicker.value = false
}

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const [fy, fm, fd] = formatDate(new Date(), 'YYYY-MM-DD').split('-')
  if (!dateString) return [fy, fm, fd]
  const [year = fy, month = fm, day = fd] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

async function handleSave() {
  formPriceError.value = ''
  await commitActiveInput()
  if (!form.name.trim()) {
    parseError.value = t('import.errorNameRequired')
    return
  }

  const priceValidation = validatePrice(form.price)
  if (!priceValidation.valid) {
    formPriceError.value = priceValidation.message
    return
  }

  try {
    // 把用户选中的角色加入预设（如果还没有的话）
    for (const charName of form.characters) {
      const exists = presets.characters.some(c =>
        (typeof c === 'string' ? c : c.name) === charName
      )
      if (!exists) {
        presets.addCharacter(charName, form.ip || '')
      }
    }
    await goodsStore.addGoods({
      name: form.name.trim(),
      category: form.category,
      ip: form.ip,
      goodsId: form.goodsId || '',
      variant: selectedVariantName.value,
      image: form.image,
      images: form.images,
      price: form.price === '' ? null : Number(form.price),
      source: form.source,
      purchaseDate: form.purchaseDate,
      notes: form.notes,
      characters: form.characters,
      isWishlist: isWishlistMode.value,
    })
    updateHistoricalTagContextFromItem({
      ip: form.ip,
      characters: form.characters,
      tags: [],
    })
    showGlobalToast(t(
      isWishlistMode.value ? 'import.importedWishlistToast' : 'import.importedToast',
      { count: 1 }
    ))
    runWithRouteTransition(() => router.replace(isWishlistMode.value ? '/wishlist' : '/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
  } catch (e) {
    parseError.value = t('import.errorSaveFailed', { message: e.message })
  }
}

onMounted(() => {
  updateViewport()
})
</script>

<style scoped src="../assets/views/ImportView.css"></style>
