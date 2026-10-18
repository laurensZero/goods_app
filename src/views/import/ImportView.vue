<template>
  <ImportPage class="import-page" :title="pageTitle">
    <template #right>
      <!-- 内嵌购物车/账号 Tab 的切号胶囊 Teleport 目标（同 NavBar 右上角） -->
      <div id="import-nav-account-slot" />
    </template>
    <main class="page-body">
      <ImportTabs v-model="activeTab" :tabs="importTabs" :aria-label="pageTitle" />

      <ImportSearchCard
        v-model="searchKeyword"
        v-show="activeTab === 'search'"
        :label="quickSearchLabel"
        :title="quickSearchTitle"
        :placeholder="quickSearchPlaceholder"
        :searching="searching"
        :error="searchError"
        @search="handleGoodsSearch"
      >
        <!-- v-memo：deps 不含 activeTab，切 Tab 时父组件重渲染会整段跳过，避免大列表重建拖垮 INP -->
        <div
          v-memo="[
            visibleSearchResults,
            queue.length,
            searchExpanded,
            showSearchToggle,
            showSearchLoadMoreStatus,
            searchLoadingMore,
          ]"
        >
        <div v-if="visibleSearchResults.length > 0" class="search-results-toolbar">
            <span class="search-results-toolbar__hint">{{ t('import.searchAddHint') }}</span>
            <span v-if="queue.length > 0" class="search-results-toolbar__actions">
              <span class="search-results-toolbar__count">{{ t('import.queueSelectedCount', { count: queue.length }) }}</span>
              <button type="button" class="search-results-toolbar__clear" @click="clearQueue">
                {{ t('import.clearQueue') }}
              </button>
            </span>
          </div>

          <div v-if="visibleSearchResults.length > 0" class="search-results">
            <button
              v-for="item in visibleSearchResults"
              :key="item.goods_id"
              type="button"
              class="search-result-card"
              :class="{ 'search-result-card--selected': isQueued(item) }"
              @click="onSearchResultClick(item)"
            >
              <div class="search-result-thumb">
                <img v-if="getSearchResultCover(item)" :src="getSearchResultCover(item)" :alt="item.name" loading="lazy" />
                <span v-else>{{ (item.name || '?').charAt(0) }}</span>
              </div>
              <span class="search-result-name">{{ item.name }}</span>
              <span
                v-if="isQueued(item)"
                class="search-result-queued"
                :aria-label="t('mihoyoStock.inQueue')"
                :title="t('mihoyoStock.inQueue')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
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
      </ImportSearchCard>

      <!-- ① URL 输入区（Tab 2：链接导入）；外层管显示，内层 v-memo 切 Tab 时跳过重建 -->
      <div v-show="activeTab === 'link'" class="url-section-wrap">
      <section class="url-section" v-memo="[urlInput, parsing, parsingLinks, parseError, batchMode, batchParseButtonText, parseButtonText, urlHintText, urlPlaceholder]">
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
                :class="{ 'btn-parse--loading': parsing || parsingLinks }"
                :disabled="parsing || parsingLinks"
                @pointerdown="syncUrlInput()"
                @click="batchMode ? handleBatchImport() : handleParse()"
              >
                <span v-if="!parsing && !parsingLinks">{{ batchMode ? batchParseButtonText : parseButtonText }}</span>
                <span v-else class="parse-spinner" />
              </button>
            </div>
            <p v-if="parseError" class="parse-error">{{ parseError }}</p>
          </div>
        </div>
      </section>
      </div>

      <!-- 批量链接解析进度（多链接 / 带数量入队解析时显示） -->
      <transition name="result-fade">
        <section v-if="parsingLinks" class="batch-section">
          <div class="section-head">
            <p class="section-label">{{ t('import.batchParse') }}</p>
            <h2 class="section-title">{{ t('import.identifyingProgress', { done: linkProgress.done, total: linkProgress.total }) }}</h2>
          </div>
          <div class="field-card batch-progress-card">
            <div class="batch-progress-row">
              <span class="batch-status-indicator batch-si--parsing">
                <span class="parse-spinner batch-spinner" />
              </span>
              <span class="batch-progress-text">{{ t('import.identifyingLinks') }}</span>
            </div>
          </div>
          <button class="batch-reparse-link" type="button" @click="stopBatchParsing">
            {{ t('import.stopParsing') }}
          </button>
        </section>
      </transition>

      <!-- 待导入队列：手机端左右滑动、平板端右侧条切换；选择款式 + 填入/修改信息 -->
      <!-- 与有货监控共用同一套队列面板（MihoyoGoodsQueuePanel + useMihoyoGoodsQueue） -->
      <!-- v-memo 锁在外层 div：切购物车/账号等无关重渲染时跳过整块面板；activeUid/布局变化仍放行 -->
      <section v-if="queue.length > 0" v-show="activeTab === 'search'" class="queue-section">
        <div v-memo="[activeUid, isTabletViewport]">
        <MihoyoGoodsQueuePanel
          ref="queuePanelRef"
          :queue="queue"
          :active-uid="activeUid"
          :is-tablet="isTabletViewport"
          :queue-summary="queueSummary"
          @activate="activateQueueEntry($event, { scrollDeck: true })"
          @remove="removeFromQueue($event)"
          @deck-scroll="onDeckScroll"
        >
          <template #slide="{ entry }">
            <div class="import-queue-slide">
              <!-- 链接解析失败项：留在队列里可重试/移除 -->
              <div v-if="entry.parseFailed" class="queue-parse-error">
                <span class="queue-parse-error__thumb">
                  <span class="queue-parse-error__initial">{{ (entry.name || '?').charAt(0) }}</span>
                </span>
                <div class="queue-parse-error__copy">
                  <p class="queue-parse-error__title">{{ entry.name }}</p>
                  <p class="queue-parse-error__msg">{{ entry.parseError || t('import.linkParseFailed') }}</p>
                </div>
                <button
                  type="button"
                  class="queue-parse-error__retry"
                  :disabled="entry.loading"
                  @click="retryParseLink(entry)"
                >
                  <span v-if="entry.loading" class="parse-spinner" />
                  <span v-else>{{ t('import.retryParse') }}</span>
                </button>
                <button
                  type="button"
                  class="queue-parse-error__remove"
                  :aria-label="t('common.remove')"
                  @click="removeFromQueue(entry.uid)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <template v-else>
                <!-- 款式选择（共享 SKU 卡片：自动选款 / 多选 / 整件） -->
                <MihoyoSkuPickerCard
                  :entry="entry"
                  :show-remove="queue.length > 1"
                  :counter="queue.length > 1 ? `${queue.indexOf(entry) + 1} / ${queue.length}` : ''"
                  :label="t('import.selectVariant')"
                  :multi-select="false"
                  :show-whole="false"
                  :large-thumb="true"
                  @select-sku="selectSingleSku(entry, $event)"
                  @select-whole="selectWholeGoods(entry)"
                  @expand="expandSkuPicker(entry)"
                  @collapse="collapseSkuPicker(entry)"
                  @retry="retryLoadVariants(entry)"
                  @remove="removeFromQueue(entry.uid)"
                />

                <!-- 信息编辑（展开/收起）：按钮与上方 SKU 卡片的「修改款式」按钮右侧对齐 -->
                <div class="import-queue-info">
                  <div class="import-queue-info__head">
                    <span v-if="isQueueItemOwned(entry)" class="queue-owned-tag">{{ t('import.maybeOwned') }}</span>
                    <!-- 收起态展示基础信息：IP / 分类 / 角色 -->
                    <div v-if="!entry.infoExpanded" class="queue-info-mini">
                      <span v-if="entry.info.ip" class="queue-mini-chip">{{ entry.info.ip }}</span>
                      <span v-if="entry.info.category" class="queue-mini-chip">{{ entry.info.category }}</span>
                      <span
                        v-for="char in entry.info.characters"
                        :key="char"
                        class="queue-mini-chip queue-mini-chip--char"
                      >{{ char }}</span>
                    </div>
                    <button
                      type="button"
                      class="info-toggle"
                      :class="{ 'info-toggle--open': entry.infoExpanded }"
                      @click="entry.infoExpanded = !entry.infoExpanded"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-toggle__icon">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span>{{ entry.infoExpanded ? t('import.collapseInfo') : t('import.editInfo') }}</span>
                    </button>
                  </div>

                  <div v-if="entry.infoExpanded && entry.info" class="info-fields field-card">
                    <label class="field">
                      <span class="field-label">{{ t('common.name') }} <span class="required">*</span></span>
                      <input v-model="entry.name" type="text" :placeholder="t('import.goodsName')" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('common.category') }}</span>
                      <AppSelect v-model="entry.info.category" :options="presets.categories" :placeholder="t('import.selectCategory')" />
                    </label>
                    <label class="field">
                      <span class="field-label">IP</span>
                      <AppSelect v-model="entry.info.ip" :options="presets.ips" :placeholder="t('import.selectIp')" />
                    </label>
                    <!-- 角色显示（智能识别，随选中款式联动） -->
                    <div v-if="false" class="field">
                      <span class="field-label">{{ t('common.character') }} <span class="auto-badge">{{ t('import.autoRecognized') }}</span></span>
                      <div class="char-chips">
                        <span
                          v-for="char in entry.info.characters"
                          :key="char"
                          class="char-chip"
                        >
                          {{ char }}
                          <button
                            class="char-chip-del"
                            type="button"
                            @click="entry.info.characters = entry.info.characters.filter(c => c !== char)"
                          >×</button>
                        </span>
                      </div>
                    </div>
                    <!-- 智能识别建议（分类/IP/角色/标签） -->
                    <div class="field">
                      <span class="field-label">{{ t('common.character') }}</span>
                      <ImportCharacterPicker v-model="entry.info.characters" :ip="entry.info.ip" />
                    </div>
                    <ImportQueueTagSuggestions :entry="entry" />
                    <label class="field">
                      <span class="field-label">{{ t('import.price') }}</span>
                      <input v-model.number="entry.info.price" type="number" placeholder="0.00" min="0" step="1" />
                    </label>
                    <!-- 图片选择（支持多选） -->
                    <ImportImagePicker
                      v-if="entry.parsedImages.length > 1"
                      :model-value="entry.info.images"
                      :images="entry.parsedImages"
                      thumb-query="?x-oss-process=image/resize,m_lfit,w_120,h_120,limit_1/format,webp"
                      @update:model-value="(v) => setQueueImages(entry, v)"
                    />
                    <label class="field">
                      <span class="field-label">{{ t('import.imageUrl') }}</span>
                      <input v-model="entry.info.image" type="text" inputmode="url"
                        autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
                        placeholder="https://..." />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ isWishlistMode ? t('import.expectedDate') : t('import.purchaseDate') }}</span>
                      <button class="date-field" type="button" @click="openQueueDatePicker(entry)">
                        <span :class="{ 'date-field__value--placeholder': !entry.info.purchaseDate }">
                          {{ entry.info.purchaseDate || (isWishlistMode ? t('import.optionalNoPlan') : t('import.selectDate')) }}
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
                        v-model="entry.info.notes"
                        class="markdown-textarea"
                        :placeholder="t('import.notesPlaceholder')"
                        rows="3"
                      />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('common.tag') }}</span>
                      <TagInput v-model="entry.info.tags" :placeholder="t('import.tagsPlaceholder')" />
                    </label>
                  </div>
                </div>
              </template>
            </div>
          </template>

          <template #actions>
            <button
              class="confirm-btn confirm-btn--ghost"
              type="button"
              :disabled="savingAll || parsingLinks"
              @click="clearQueue"
            >
              {{ t('import.clearQueue') }}
            </button>
            <button
              class="confirm-btn confirm-btn--primary"
              type="button"
              :disabled="savingAll || parsingLinks || !queue.length"
              @click="confirmImportQueue"
            >
              <svg v-if="savingAll" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
              </svg>
              <span>{{ t('import.confirmImportCount', { count: queueImportCount }) }}</span>
            </button>
          </template>
        </MihoyoGoodsQueuePanel>
        </div>
      </section>

      <!-- 购物车 / 账号导入：独立视图内嵌为 tab，首次切到时才挂载（避免进页就拉账号状态） -->
      <!-- v-show 挪到 display:contents 包装层：组件节点上的 v-show 会在父级任何重渲染时强制子组件重渲染，切 Tab 变卡 -->
      <div v-show="activeTab === 'cart'" style="display: contents">
        <CartImportView
          v-if="tabMounted.cart"
          embedded
          :embedded-active="activeTab === 'cart'"
        />
      </div>
      <div v-show="activeTab === 'account'" style="display: contents">
        <AccountImportView
          v-if="!isWishlistMode && tabMounted.account"
          embedded
          :embedded-active="activeTab === 'account'"
        />
      </div>

      <!-- ② 解析结果 / 编辑表单（解析成功后展示，仅单一模式） -->
      <!-- v-memo：切 tab 等无关重渲染跳过整块表单；deps 覆盖表单全部字段，
           tagSuggestions 兜底 applySuggestion 就地改 characters 的场景（建议同时清空） -->
      <transition name="result-fade">
        <div
          v-if="parsed && !batchMode"
          v-memo="[
            form.name, form.category, form.ip, form.characters, form.images, form.image,
            form.price, form.source, form.purchaseDate, form.notes,
            formPriceError, tagSuggestions, parsedImages, parsedVariants,
            sortedParsedVariants, selectedVariantKey, selectedVariantName,
            variantSectionCollapsed, topCharactersPerIp, isWishlistMode,
            presets.categories, presets.ips, locale
          ]"
          class="result-area"
        >
          <!-- 预览卡 -->
          <ImportHeroPreview
            :image="form.image"
            :name="form.name"
            :label="isWishlistMode ? t('import.fromMihoyoWishlist') : t('import.fromMihoyo')"
            :desc="isWishlistMode ? t('import.wishlistDesc') : t('import.collectionDesc')"
            :cover-tone="previewCoverTone"
          />

          <!-- 基础信息 -->
          <ImportFormSection :label="t('import.recognizedInfo')" :title="t('import.goodsInfo')">
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
              <div v-if="false" class="field">
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
              <div class="field">
                <span class="field-label">{{ t('common.character') }}</span>
                <ImportCharacterPicker v-model="form.characters" :ip="form.ip" />
              </div>
              <TagSuggestionPanel
                :suggestions="tagSuggestions"
                @apply="applySuggestion"
                @ignore="handleIgnoreSuggestion"
                @apply-all="applyAllSuggestions"
              />
              <label class="field">
                <span class="field-label">{{ t('import.imageUrl') }}</span>
                <input v-model="form.image" type="text" inputmode="url"
                  autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
                  placeholder="https://..." />
              </label>
              <!-- 图片选择器：横向滚动所有可用图（支持多选） -->
              <ImportImagePicker
                v-if="parsedImages.length > 1"
                :model-value="form.images"
                :images="parsedImages"
                thumb-query="?x-oss-process=image/resize,m_lfit,w_120,h_120,limit_1/format,webp"
                @update:model-value="onFormImagesChange"
              />
            </div>
          </ImportFormSection>

          <!-- 购入信息 -->
          <ImportFormSection
            :label="isWishlistMode ? t('import.targetInfo') : t('import.purchaseRecord')"
            :title="isWishlistMode ? t('import.budgetAndSource') : t('import.priceAndSource')"
          >
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
          </ImportFormSection>

          <!-- 备注 -->
          <ImportFormSection :label="t('import.extraInfo')" :title="t('common.note')">
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
          </ImportFormSection>
        </div>
      </transition>

      <!-- 批量导入结果列表已迁移到上方共享队列面板（MihoyoGoodsQueuePanel） -->
      <!-- 底部空白，防止内容被浮动按钮遮挡 -->
      <div style="height: 120px" />
    </main>

    <!-- 浮动保存按钮（Teleport 到 body，避免 will-change 影响 fixed 定位） -->
    <Teleport to="body">
      <!-- 单条模式保存（仅链接导入 tab 展示，避免盖住队列） -->
      <div v-if="parsed && !batchMode && activeTab === 'link'" class="float-footer">
        <button class="btn-primary btn-float" @click="handleSave">{{ isWishlistMode ? t('import.addToWishlist') : t('import.saveGoods') }}</button>
      </div>
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

    <!-- 队列项日期选择器 -->
    <AppDatePicker
      v-model:show="showQueueDatePicker"
      v-model="queueDatePickerValue"
      :z-index="2100"
      :is-tablet="isTabletViewport"
      :title="t('import.selectPurchaseDate')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onQueueDateConfirm"
    />
  </ImportPage>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { getCoverTone } from '@/utils/goods/coverTone'
import { useTabletViewport } from '@/composables/viewport/useTabletViewport'
import ImportPage from '@/components/import/ImportPage.vue'
import ImportSearchCard from '@/components/import/ImportSearchCard.vue'
import ImportHeroPreview from '@/components/import/ImportHeroPreview.vue'
import ImportFormSection from '@/components/import/ImportFormSection.vue'
import ImportImagePicker from '@/components/import/ImportImagePicker.vue'
import ImportTabs from '@/components/import/ImportTabs.vue'
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
} from '@/utils/mihoyo/index'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { showGlobalToast } from '@/utils/globalToast'
import { validatePrice } from '@/utils/validate'
import { resizeTextarea } from '@/utils/textarea'
import {
  displayVariantText,
  normalizeCharacterName,
} from '@/utils/goods/variantText'
import {
  addMihoyoImportContextItem,
  applyMihoyoVariantMedia,
  buildMihoyoImportContext,
  getDefaultMihoyoImages,
  normalizeMihoyoImageList,
  resolveMihoyoImportDraft,
  resolveMihoyoVariantDraft,
} from '@/utils/mihoyo/importResolver'
import { useMihoyoGoodsSearch, normalizeSearchHintText } from '@/composables/import/useMihoyoGoodsSearch'
import { useBatchImport } from '@/composables/import/useBatchImport'
import { pinyinIncludes } from '@/utils/pinyin'
import { useSmartTagging } from '@/composables/goods/useSmartTagging'
import { getSharedTaggingContext, warmTaggingContext } from '@/utils/tagging/taggingContextCache'
import TagSuggestionPanel from '@/components/goods/TagSuggestionPanel.vue'
import MihoyoSkuPickerCard from '@/components/my/mihoyoStock/MihoyoSkuPickerCard.vue'
import MihoyoGoodsQueuePanel from '@/components/my/mihoyoStock/MihoyoGoodsQueuePanel.vue'
import ImportQueueTagSuggestions from '@/components/import/ImportQueueTagSuggestions.vue'
import ImportCharacterPicker from '@/components/import/ImportCharacterPicker.vue'

// 购物车/账号是独立重视图：拆异步 chunk；进页首帧后立刻预下载 + 预挂载（见下）
const loadCartImportView = () => import('@/views/import/CartImportView.vue')
const loadAccountImportView = () => import('@/views/import/AccountImportView.vue')
// setup 阶段就发起下载，首帧后挂载时 chunk 多半已在缓存
const cartChunkWarm = loadCartImportView().catch(() => {})
const accountChunkWarm = loadAccountImportView().catch(() => {})
const CartImportView = defineAsyncComponent({
  loader: loadCartImportView,
  delay: 0,
})
const AccountImportView = defineAsyncComponent({
  loader: loadAccountImportView,
  delay: 0,
})

const { t, locale } = useI18n()
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
const parsing = ref(false)
const parseError = ref('')
const formPriceError = ref('')
const parsed = ref(false)

// ── Composables ──
const search = useMihoyoGoodsSearch({ scrollRootSelector: '.import-page .page-body' })
const {
  searchKeyword, searchExpanded, searching, searchLoadingMore, searchError,
  variantSearchHint, selectedSearchCharacter, searchLoadMoreRef,
  visibleSearchResults, showSearchToggle, showSearchLoadMoreStatus,
  getSearchResultCover, handleGoodsSearch, loadMoreSearchResults, toggleSearchExpanded, selectSearchResult,
} = search

// 队列项日期选择器（单件表单用 showDatePicker / datePickerValue）
const queuePanelRef = ref(null)

function getSearchContext() {
  return {
    hint: normalizeSearchHintText(variantSearchHint.value),
    preferredCharacter: preferredSearchCharacterName.value,
  }
}

const {
  queue, activeUid, isQueued, getQueuedEntry,
  enqueueFromSearch, activateQueueEntry, onDeckScroll, removeFromQueue, clearQueue,
  selectWholeGoods, expandSkuPicker, collapseSkuPicker, retryLoadVariants,
  batchMode, batchParseButtonText, parsingLinks, linkProgress,
  savingAll, queueImportCount, isQueueItemOwned, queueSummary,
  handleBatchImport, stopBatchParsing, retryParseLink, confirmImportQueue,
  selectSingleSku,
} = useBatchImport({
  urlInput, urlInputRef, syncUrlInput, isWishlistMode,
  ensureHistoricalTagContext, updateHistoricalTagContextFromItem,
  getSearchContext,
  getDeckEl: () => queuePanelRef.value?.deckEl || null,
})

// ── 页内 Tab：搜索/队列 与 链接导入（搜索加购与队列是同一闭环，不拆开） ──
const activeTab = ref('search')
const importTabs = computed(() => [
  { key: 'search', label: t('import.mihoyoTabSearch'), badge: queue.value.length > 0 ? String(queue.value.length) : '' },
  { key: 'link', label: t('import.mihoyoTabLink') },
  { key: 'cart', label: t('import.mihoyoTabCart') },
  ...(isWishlistMode.value ? [] : [{ key: 'account', label: t('import.mihoyoTabAccount') }]),
])
// 购物车/账号是独立视图，首次切到时才挂载（避免进页就拉账号/Cookie 状态）
const tabMounted = reactive({ search: true, link: true, cart: false, account: false })
let tabMountRaf = 0
watch(activeTab, (tab) => {
  if (tabMounted[tab]) return
  // 先让 Tab 切换本身完成绘制，再挂载重型子视图；同步首挂会把 button.import-tab 的 INP 拉到秒级
  cancelAnimationFrame(tabMountRaf)
  tabMountRaf = requestAnimationFrame(() => {
    tabMounted[tab] = true
  })
})
// 批量链接解析的结果落在队列（搜索 tab），进度结束自动切过去
watch(parsingLinks, (now, was) => {
  if (was && !now) activeTab.value = 'search'
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

// ── 日期选择器 ──
const showDatePicker = ref(false)
const showQueueDatePicker = ref(false)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
const datePickerValue = ref(toDatePickerValue(''))
const queueDatePickerValue = ref(toDatePickerValue(''))
const queueDateEntry = ref(null) // 正在编辑日期的队列项

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

const previewCoverTone = computed(() => (form.image ? null : getCoverTone(form.category)))

function handleIgnoreSuggestion({ field }) {
  if (field === 'characters') {
    form.characters = []
  }
  ignoreSuggestion({ field })
}

watch(() => form.price, () => {
  if (formPriceError.value) {
    formPriceError.value = ''
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
    // n-gram 关键词学习走共享缓存，避免再做一次全量扫描
    learnedCategories: getSharedTaggingContext(presets, goodsStore).getLearnedKeywords(),
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

// 搜索结果点击：加入/移出「待导入队列」（支持多选，与有货监控同一套交互）
function onSearchResultClick(item) {
  // 米游铺搜索接口通常返回 snake_case，但部分代理/缓存响应会返回 camelCase。
  // 统一取值，避免搜索结果实际有 ID 却因为字段名不同而无法入队。
  const mihoyoGoodsId = item?.goods_id || item?.goodsId
  if (!mihoyoGoodsId) return
  const existing = getQueuedEntry(item)
  if (existing) {
    removeFromQueue(existing.uid)
    showGlobalToast(t('import.removedFromQueue'))
    return
  }
  selectSearchResult(item)
  const priceYuan = Number(item?.price)
  enqueueFromSearch({
    goodsId: mihoyoGoodsId,
    name: item?.name || '',
    priceCents: priceYuan > 0 ? Math.round(priceYuan * 100) : 0,
    coverUrl: getSearchResultCover(item) || item?.cover_url || '',
  })
  parsed.value = false
}

// ── 图片多选变更（ImportImagePicker v-model） ──
function onFormImagesChange(images) {
  form.images = images
  // 同步主图：始终以第一张选中的图为主图
  form.image = images[0] || ''
}

function setQueueImages(entry, images) {
  if (!entry?.info) return
  entry.info.images = images
  entry.info.image = images[0] || ''
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

// ── 队列项日期选择器 ──
function openQueueDatePicker(entry) {
  if (!entry?.info) return
  queueDateEntry.value = entry
  queueDatePickerValue.value = toDatePickerValue(entry.info.purchaseDate)
  showQueueDatePicker.value = true
}

function onQueueDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  if (queueDateEntry.value?.info) {
    queueDateEntry.value.info.purchaseDate = `${year}-${month}-${day}`
  }
  queueDatePickerValue.value = [year, month, day]
  showQueueDatePicker.value = false
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
    // 把用户选中的角色加入预设（addCharacter 自带 (ip,name) 去重，重复调用幂等）
    for (const charName of form.characters) {
      presets.addCharacter(charName, form.ip || '')
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
  // 预挂载购物车/账号：双 rAF 等首帧画完 → 等 chunk 下载完 → 立刻隐藏挂载。
  // 不再用 idle timeout:2500（进页头几秒点购物车/账号仍走首挂，会卡死）。
  // 历史标签上下文预热再往后推，避开用户连点 Tab 的窗口。
  const preMount = async () => {
    await Promise.allSettled([cartChunkWarm, accountChunkWarm])
    tabMounted.cart = true
    if (!isWishlistMode.value) tabMounted.account = true
    setTimeout(() => {
      try {
        seedHistoricalTagContextFromGoods()
      } catch {
        // 预热失败不影响后续懒建
      }
    }, 4000)
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void preMount()
    })
  })
  // 标签共享缓存只在进入本页时算（不随 App 启动算）：空闲期静默预热，
  // timeout 250 抢在首个建议读取（~300ms 防抖）前完成；期间读旧值也不会重复全扫
  warmTaggingContext(presets, goodsStore, { timeout: 250 })
})
</script>

<style scoped src="@/assets/views/ImportView.css"></style>
