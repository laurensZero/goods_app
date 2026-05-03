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
              {{ searching ? '搜索中' : '搜索' }}
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
              {{ searchExpanded ? '收起结果' : '展开更多' }}
            </button>
          </div>

          <div
            v-if="showSearchLoadMoreStatus"
            ref="searchLoadMoreRef"
            class="search-results-status"
          >
            <span v-if="searchLoadingMore">正在加载更多...</span>
            <template v-else>
              <span>继续下滑加载更多</span>
              <button type="button" class="search-results-load-more" @click="loadMoreSearchResults">
                加载更多
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
                <span v-if="!parsing && !batchParsing">{{ batchMode ? `批量解析 (${urlList.length})` : parseButtonText }}</span>
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
          @click="$router.push(isWishlistMode ? '/cart-import?mode=wishlist' : '/cart-import')"
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
            <p class="ie-title">{{ isWishlistMode ? '从购物车导入心愿' : '从购物车导入' }}</p>
            <p class="ie-sub">{{ isWishlistMode ? '读取米游铺购物车商品，批量加入心愿单' : '读取米游铺购物车商品，批量导入当前收藏' }}</p>
          </div>
          <svg class="ie-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>

        <button v-if="!isWishlistMode" class="import-entry" type="button" @click="$router.push('/account-import')">
          <div class="ie-icon ie-icon--account">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="7" r="4"/>
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
            <path d="M16 11h6M19 8v6"/>
          </svg>
          </div>
          <div class="ie-body">
            <p class="ie-title">账号批量导入</p>
            <p class="ie-sub">一键导入米游铺账号的所有历史订单</p>
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
                <span v-else class="preview-fallback">{{ form.name?.trim().charAt(0).toUpperCase() || '谷' }}</span>
              </div>
            </div>

            <article class="hero-card">
              <p class="hero-label">{{ isWishlistMode ? '来自米游铺心愿' : '来自米游铺' }}</p>
              <h1 class="hero-title">{{ form.name || '商品名称' }}</h1>
              <p class="hero-desc">{{ isWishlistMode ? '请确认目标款式、图片和预算，然后加入心愿单。' : '请检查并补充以下信息，确认后保存到你的收藏。' }}</p>
            </article>
          </section>

          <!-- 基础信息 -->
          <section class="form-section">
            <div class="section-head">
              <p class="section-label">已识别信息</p>
              <h2 class="section-title">商品资料</h2>
            </div>
            <div class="field-card">
              <label class="field">
                <span class="field-label">名称 <span class="required">*</span></span>
                <input v-model="form.name" type="text" placeholder="商品名称" />
              </label>
              <label class="field">
                <span class="field-label">分类</span>
                <AppSelect v-model="form.category" :options="presets.categories" placeholder="请选择分类" />
              </label>
              <label class="field">
                <span class="field-label">IP</span>
                <AppSelect v-model="form.ip" :options="presets.ips" placeholder="请选择 IP" />
              </label>
              <!-- 角色款式选择器：用户点选要买的那个 -->
              <div v-if="parsedVariants.length > 0" class="field">
                <div class="variant-field-head">
                  <span class="field-label">
                    选择款式
                    <span class="auto-badge">{{ parsedVariants.length }} 款</span>
                  </span>
                  <button
                    v-if="selectedVariantKey"
                    type="button"
                    class="variant-field-toggle"
                    @click="variantSectionCollapsed = !variantSectionCollapsed"
                  >
                    {{ variantSectionCollapsed ? '展开' : '收起' }}
                  </button>
                </div>
                <p v-if="variantSectionCollapsed && selectedVariantName" class="variant-field-match">
                  已匹配：{{ selectedVariantName }}
                </p>
                <div v-if="!variantSectionCollapsed" class="variant-grid">
                  <button
                    v-for="v in parsedVariants"
                    :key="v.key || v.text"
                    type="button"
                    class="variant-btn"
                    :class="{ 'variant-btn--selected': isVariantSelected(v) }"
                    @click="handleVariantSelect(v)"
                  >
                    <div v-if="v.cover_url || v.img_url" class="variant-img-wrap">
                      <img :src="v.cover_url || v.img_url" class="variant-img" />
                    </div>
                    <span class="variant-name">{{ displayVariantText(v.text) }}</span>
                    <div v-if="isVariantSelected(v)" class="variant-check">✓</div>
                  </button>
                </div>
                <!-- 选中款式后：是否记录为角色开关 -->
                <div v-if="selectedVariantKey" class="save-char-row" @click="toggleSaveAsCharacter">
                  <span class="save-char-label">
                    将角色记录为「{{ selectedCharacterName || selectedVariantName }}」
                  </span>
                  <div class="save-char-toggle" :class="{ 'save-char-toggle--on': saveAsCharacter }">
                    <div class="save-char-knob" />
                  </div>
                </div>
              </div>
              <!-- 无变体时仍允许手动输入角色 -->
              <div v-else-if="form.characters.length > 0" class="field">
                <span class="field-label">角色 <span class="auto-badge">自动识别</span></span>
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
              <label class="field">
                <span class="field-label">图片链接</span>
                <input v-model="form.image" type="text" inputmode="url"
                  autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
                  placeholder="https://..." />
              </label>
              <!-- 图片选择器：横向滚动所有可用图 -->
              <div v-if="parsedImages.length > 1" class="field">
                <span class="field-label">选择保存的图片</span>
                <div class="img-picker-scroll">
                  <button
                    v-for="(imgUrl, idx) in parsedImages"
                    :key="idx"
                    type="button"
                    class="img-picker-item"
                    :class="{ 'img-picker-item--active': form.image === imgUrl }"
                    @click="form.image = imgUrl"
                  >
                    <img :src="imgUrl + '?x-oss-process=image/resize,m_lfit,w_120,h_120,limit_1/format,webp'" :alt="`图片${idx+1}`" />
                    <span v-if="idx === 0" class="img-picker-badge">封面</span>
                    <div v-if="form.image === imgUrl" class="img-picker-check">✓</div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 购入信息 -->
          <section class="form-section">
            <div class="section-head">
              <p class="section-label">{{ isWishlistMode ? '目标信息' : '购入记录' }}</p>
              <h2 class="section-title">{{ isWishlistMode ? '预算与来源' : '价格与来源' }}</h2>
            </div>
            <div class="field-card">
              <label class="field">
                <span class="field-label">{{ isWishlistMode ? '目标价格（元）' : '价格（元）' }}</span>
                <input v-model.number="form.price" type="number" placeholder="0.00" min="0" step="1" />
                <p v-if="formPriceError" class="parse-error">{{ formPriceError }}</p>
              </label>
              <label class="field">
                <span class="field-label">购买渠道</span>
                <input v-model="form.source" type="text" placeholder="米游铺" />
              </label>
              <label class="field">
                <span class="field-label">{{ isWishlistMode ? '预计入手日期' : '购买日期' }}</span>
                <button class="date-field" type="button" @click="openDatePicker">
                  <span :class="{ 'date-field__value--placeholder': !form.purchaseDate }">
                    {{ form.purchaseDate || (isWishlistMode ? '可选，暂未计划' : '请选择日期') }}
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
              <p class="section-label">额外信息</p>
              <h2 class="section-title">备注</h2>
            </div>
            <div class="field-card">
              <label class="field">
                <span class="field-label">备注</span>
                <textarea v-model="form.notes" placeholder="可以填写款式、编号等补充说明…" rows="3" />
              </label>
            </div>
          </section>
        </div>
      </transition>

      <!-- 批量解析进度 -->
      <transition name="result-fade">
        <section v-if="batchStep === 'parsing'" class="batch-section">
          <div class="section-head">
            <p class="section-label">批量解析</p>
            <h2 class="section-title">正在识别链接…</h2>
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
        </section>
      </transition>

      <!-- 批量导入结果列表 -->
      <transition name="result-fade">
        <section v-if="batchStep === 'list'" class="batch-section">
          <div class="section-head">
            <p class="section-label">
              识别完成{{ batchItems.filter(i => i.status === 'error').length ? ' · ' + batchItems.filter(i => i.status === 'error').length + ' 件失败' : '' }}
            </p>
            <h2 class="section-title">{{ batchItems.filter(i => i.status === 'ready' || i.status === 'saved').length }} 件谷子就绪</h2>
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
                  <span v-if="item.data?.price" class="batch-meta-tag batch-meta-tag--price">¥{{ item.data.price }}</span>
                  <span v-if="item.data?.ip" class="batch-meta-tag">{{ item.data.ip }}</span>
                  <span v-if="item.data?.variant" class="batch-meta-tag">{{ item.data.variant }}</span>
                  <span v-if="item.data?.variants?.length && !item.data?.variant" class="batch-meta-tag batch-meta-tag--hint">{{ item.data.variants.length }} 款可选</span>
                  <span v-if="item.status === 'error'" class="batch-meta-tag batch-meta-tag--error">{{ item.error }}</span>
                </div>
              </div>
              <span v-if="item.status === 'saved'" class="batch-saved-badge">已保存</span>
              <button
                v-if="item.status === 'ready'"
                class="batch-goods-edit-btn"
                type="button"
                aria-label="编辑"
                @click="openBatchEdit(i)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </li>
          </ul>
          <button class="batch-reparse-link" type="button" @click="batchStep = 'input'; batchItems = []">
            重新输入链接
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
        <button class="btn-primary btn-float" @click="handleSave">{{ isWishlistMode ? '加入心愿单' : '保存谷子' }}</button>
      </div>
      <!-- 批量模式保存全部 -->
      <div v-if="batchStep === 'list' && batchItems.some(i => i.status === 'ready')" class="float-footer">
        <button class="btn-primary btn-float" :disabled="savingAll" @click="saveAllBatch">
          {{ savingAll ? '保存中...' : `保存全部 (${batchItems.filter(i => i.status === 'ready').length})` }}
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
          <p class="batch-edit-title">编辑商品资料</p>
          <div class="batch-edit-form">
            <label class="field">
              <span class="field-label">名称</span>
              <input v-model="batchEditForm.name" type="text" placeholder="商品名称" />
            </label>
            <label class="field">
              <span class="field-label">分类</span>
              <AppSelect v-model="batchEditForm.category" :options="presets.categories" placeholder="请选择分类" />
            </label>
            <label class="field">
              <span class="field-label">IP</span>
              <AppSelect v-model="batchEditForm.ip" :options="presets.ips" placeholder="请选择 IP" />
            </label>
            <label class="field">
              <span class="field-label">价格（元）</span>
              <input v-model.number="batchEditForm.price" type="number" placeholder="0.00" min="0" step="1" />
              <p v-if="batchEditPriceError" class="parse-error">{{ batchEditPriceError }}</p>
            </label>
            <!-- 款式选择（有 SKU 变体时显示） -->
            <div v-if="batchEditVariants.length > 0" class="field">
              <span class="field-label">
                选择款式
                <span class="auto-badge">{{ batchEditVariants.length }} 款</span>
              </span>
              <div class="variant-grid">
                <button
                  v-for="v in batchEditVariants"
                  :key="v.key"
                  type="button"
                  class="variant-btn"
                  :class="{ 'variant-btn--selected': batchEditSelectedVariantKey === v.key }"
                  @click="handleBatchVariantSelect(v)"
                >
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
            </div>
            <!-- 图片选择 -->
            <div v-if="batchEditImages.length > 1" class="field">
              <span class="field-label">选择图片</span>
              <div class="img-picker-scroll">
                <button
                  v-for="(imgUrl, idx) in batchEditImages"
                  :key="idx"
                  type="button"
                  class="img-picker-item"
                  :class="{ 'img-picker-item--active': batchEditForm.image === imgUrl }"
                  @click="batchEditForm.image = imgUrl"
                >
                  <img :src="imgUrl + '?x-oss-process=image/resize,m_lfit,w_120,h_120,limit_1/format,webp'" :alt="`图片${idx+1}`" />
                  <span v-if="idx === 0" class="img-picker-badge">封面</span>
                  <div v-if="batchEditForm.image === imgUrl" class="img-picker-check">✓</div>
                </button>
              </div>
            </div>
            <label class="field">
              <span class="field-label">购买日期</span>
              <button class="date-field" type="button" @click="openBatchDatePicker">
                <span :class="{ 'date-field__value--placeholder': !batchEditForm.purchaseDate }">
                  {{ batchEditForm.purchaseDate || '请选择日期' }}
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
              <span class="field-label">备注</span>
              <input v-model="batchEditForm.notes" type="text" placeholder="可填写款式、编号等" />
            </label>
            <label class="field">
              <span class="field-label">标签</span>
              <TagInput v-model="batchEditForm.tags" placeholder="例如：生日谷、待出、收藏" />
            </label>
          </div>
          <div class="batch-edit-actions">
            <button class="batch-edit-cancel" type="button" @click="editingBatchIdx = -1">取消</button>
            <button class="batch-edit-save" type="button" @click="saveBatchEdit">完成</button>
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
      title="选择购买日期"
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
      title="选择购买日期"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onBatchDateConfirm"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { useTabletViewport } from '@/composables/useTabletViewport'
import NavBar from '@/components/common/NavBar.vue'
import { runWithRouteTransition } from '@/utils/routeTransition'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import TagInput from '@/components/common/TagInput.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { getTaggingSuggestions } from '@/utils/tagging/suggestTags'
import staticDictionaries from '@/constants/tagging-dictionaries.json'
import {
  parseMihoyoUrl,
  isMihoyoGiftUrl,
  fetchGoodsDetail,
  searchGoodsList,
  fetchGoodsCategoryList,
  searchGoodsSpuList,
  getMihoyoShopCodeByIp,
  MIHOYO_ROLE_SHOP_CODES
} from '@/utils/mihoyo'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { validatePrice } from '@/utils/validate'

const router = useRouter()
const route = useRoute()
const goodsStore = useGoodsStore()
const presets = usePresetsStore()
const isWishlistMode = computed(() => route.query.mode === 'wishlist')
const pageTitle = computed(() => isWishlistMode.value ? '导入心愿' : '从米游铺导入')
const quickSearchLabel = computed(() => isWishlistMode.value ? '心愿快捷搜索' : '米游铺快捷搜索')
const quickSearchTitle = computed(() => isWishlistMode.value ? '按角色查米游铺周边' : '按关键词查米游铺周边')
const quickSearchPlaceholder = computed(() => (
  isWishlistMode.value
    ? '例如：芙宁娜、流萤、安比'
    : '例如：芙宁娜、徽章、立牌'
))

function handleBack() {
  runWithRouteTransition(() => router.back(), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
}
const urlHintText = computed(() =>
  isWishlistMode.value
    ? '先按角色搜索，或直接粘贴米游铺商品链接（支持多个，每行一个）'
    : '先按关键词搜索，或直接粘贴米游铺商品链接（支持多个，每行一个）'
)
const urlPlaceholder = computed(() =>
  isWishlistMode.value
    ? '搜索后会自动填入，也可手动粘贴米游铺商品链接'
    : 'https://www.mihoyogift.com/goods/...或多条链接，每行一个'
)
const parseButtonText = computed(() => '解析')

const urlInputRef = ref(null)
const urlInput = ref('')
const parsing = ref(false)
const parseError = ref('')
const formPriceError = ref('')
const parsed = ref(false)
const searchKeyword = ref('')

const { isTabletViewport, updateViewport } = useTabletViewport()
const searchResults = ref([])
const searchExpanded = ref(false)
const searching = ref(false)
const searchLoadingMore = ref(false)
const searchError = ref('')
const variantSearchHint = ref('')
const selectedSearchCharacter = ref('')
const selectedSearchGoodsId = ref('')
const searchLoadMoreRef = ref(null)
const SEARCH_RESULTS_COLLAPSED_COUNT = 6
const SEARCH_RESULTS_EXPANDED_COUNT = 24
const searchSession = reactive({
  requestId: 0,
  mode: '',
  keyword: '',
  page: 0,
  hasMore: false,
  roleTargets: []
})
const searchResultVariantCoverCache = new Map()
let searchResultsObserver = null
let searchScrollCleanup = null
let ensureSearchFillPromise = null

const visibleSearchResults = computed(() => (
  searchExpanded.value
    ? searchResults.value
    : searchResults.value.slice(0, SEARCH_RESULTS_COLLAPSED_COUNT)
))

const showSearchToggle = computed(() => (
  searchResults.value.length > SEARCH_RESULTS_COLLAPSED_COUNT
))
const searchHasMore = computed(() => searchSession.hasMore)
const showSearchLoadMoreStatus = computed(() => (
  searchExpanded.value
  && visibleSearchResults.value.length > 0
  && (searchLoadingMore.value || searchHasMore.value)
))

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

const mihoyoRoleCategoryCache = new Map()

function normalizeRoleCategoryName(name) {
  return String(name || '')
    .trim()
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .replace(/\s+/g, '')
}

function extractRoleCategories(categories) {
  const roleGroup = (categories || []).find((item) => String(item?.name || '').trim() === '角色分类')
  return Array.isArray(roleGroup?.child) ? roleGroup.child : []
}

async function getRoleCategoriesForShop(shopCode) {
  const normalizedShopCode = String(shopCode || '').trim()
  if (!normalizedShopCode) return []
  if (!mihoyoRoleCategoryCache.has(normalizedShopCode)) {
    const categories = await fetchGoodsCategoryList(normalizedShopCode)
    mihoyoRoleCategoryCache.set(normalizedShopCode, extractRoleCategories(categories))
  }
  return mihoyoRoleCategoryCache.get(normalizedShopCode) || []
}

async function resolveRoleSearchTargets(keyword) {
  const normalizedKeyword = normalizeRoleCategoryName(keyword)
  if (!normalizedKeyword) return []

  const preferredCharacter = wishlistCharacterOptions.value.find(
    (item) => normalizeRoleCategoryName(item.name) === normalizedKeyword
  )
  const preferredShopCode = getMihoyoShopCodeByIp(preferredCharacter?.ip)
  const shopCodes = preferredShopCode
    ? [preferredShopCode]
    : MIHOYO_ROLE_SHOP_CODES

  const targets = []

  for (const shopCode of shopCodes) {
    const categories = await getRoleCategoriesForShop(shopCode)
    const matchedCategory = categories.find((item) => normalizeRoleCategoryName(item?.name) === normalizedKeyword)
    if (!matchedCategory?.id) continue
    targets.push({
      shopCode,
      categoryId: matchedCategory.id,
      categoryName: String(matchedCategory.name || '').trim()
    })
  }

  return targets
}

// 多 URL 批量导入状态
const urlList = computed(() => {
  const text = urlInput.value || ''
  return text.split(/[\n\s]+/).map(s => s.trim()).filter(s => isMihoyoGiftUrl(s))
})
const batchMode = computed(() => urlList.value.length > 1)
// 批量步骤: 'input' | 'parsing' | 'list'
const batchStep = ref('input')
const batchItems = ref([]) // { url, status: 'pending'|'parsing'|'ready'|'error'|'saved', data, error }
const batchParsing = ref(false)
const editingBatchIdx = ref(-1)
const batchEditForm = reactive({
  name: '', category: '', ip: '', image: '', price: '',
  notes: '', tags: [], characters: [], purchaseDate: '', variant: '',
})
const batchEditPriceError = ref('')
const batchEditImages = ref([])
const batchEditBaseImages = ref([])
const batchEditVariants = ref([])           // SKU 变体列表 { text, key, img_url, cover_url? }
const batchEditSelectedVariantKey = ref('') // 当前选中款式 key
const savingAll = ref(false)

// 用户编辑输入时重置批量状态
watch(urlInput, () => {
  if (batchStep.value !== 'input') {
    batchStep.value = 'input'
    batchItems.value = []
  }
})

watch(isWishlistMode, (active) => {
  if (!active) {
    searchKeyword.value = ''
    searchResults.value = []
    searchExpanded.value = false
    searchLoadingMore.value = false
    searchError.value = ''
    variantSearchHint.value = ''
    selectedSearchCharacter.value = ''
    selectedSearchGoodsId.value = ''
    resetSearchSession()
  }
}, { immediate: true })

watch(searchKeyword, (value) => {
  if (value.trim() !== selectedSearchCharacter.value) {
    selectedSearchCharacter.value = ''
  }

  if (value.trim() !== searchSession.keyword) {
    searchSession.hasMore = false
  }
})

watch(
  [searchExpanded, () => visibleSearchResults.value.length, searchHasMore, searchLoadingMore],
  () => {
    void reconnectSearchObserver()
    bindSearchScrollListener()
  }
)

async function handleGoodsSearch() {
  const keyword = searchKeyword.value.trim()
  variantSearchHint.value = normalizeSearchHintText(keyword)
  searchError.value = ''
  searchExpanded.value = false
  searchLoadingMore.value = false

  if (!keyword) {
    searchResults.value = []
    selectedSearchGoodsId.value = ''
    resetSearchSession()
    return
  }

  searching.value = true
  try {
    const results = await runSearchPage({ keyword, append: false })
    if (!results.length) {
      searchError.value = '没有找到相关商品，换个角色名或关键词试试'
    }
  } catch (error) {
    searchResults.value = []
    selectedSearchGoodsId.value = ''
    resetSearchSession()
    searchError.value = error?.message || '搜索失败，请稍后重试'
  } finally {
    searching.value = false
  }
}

function toggleSearchExpanded() {
  searchExpanded.value = !searchExpanded.value
  if (searchExpanded.value) {
    void ensureSearchResultsScrollable()
  }
}

function resetSearchSession() {
  searchSession.mode = ''
  searchSession.keyword = ''
  searchSession.page = 0
  searchSession.hasMore = false
  searchSession.roleTargets = []
}

function getSearchResultKey(item) {
  return `${item?.shop_code || ''}:${item?.goods_id || ''}`
}

function getSearchResultCover(item) {
  return String(item?.search_cover_url || item?.cover_url || '').trim()
}

function mergeSearchResults(list, { append = false } = {}) {
  const deduped = new Map()

  if (append) {
    for (const item of searchResults.value) {
      deduped.set(getSearchResultKey(item), item)
    }
  }

  for (const item of list) {
    const key = getSearchResultKey(item)
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  }

  return [...deduped.values()]
}

function resolvePreferredVariantCover(variants, keyword) {
  const hint = normalizeSearchHintText(keyword).toLowerCase()
  if (!hint || !Array.isArray(variants) || variants.length <= 1) return ''

  const exactCharMatches = variants.filter((variant) => (
    normalizeCharacterName(variant?.text).trim().toLowerCase() === hint
  ))
  if (exactCharMatches.length) {
    const target = exactCharMatches[exactCharMatches.length - 1]
    return String(target?.cover_url || target?.img_url || '').trim()
  }

  const fuzzyMatches = variants.filter((variant) => {
    const displayText = displayVariantText(variant?.text).trim().toLowerCase()
    const normalizedChar = normalizeCharacterName(variant?.text).trim().toLowerCase()
    const rawText = String(variant?.text || '').trim().toLowerCase()

    return displayText.includes(hint) || normalizedChar.includes(hint) || rawText.includes(hint)
  })
  if (fuzzyMatches.length) {
    const target = fuzzyMatches[fuzzyMatches.length - 1]
    return String(target?.cover_url || target?.img_url || '').trim()
  }

  return ''
}

async function enhanceSearchResultImages(list, keyword) {
  const hint = normalizeSearchHintText(keyword)
  if (!hint || !Array.isArray(list) || !list.length) return

  await Promise.allSettled(list.map(async (item) => {
    const goodsId = String(item?.goods_id || '').trim()
    if (!goodsId) return

    const cacheKey = `${goodsId}::${hint}`
    if (searchResultVariantCoverCache.has(cacheKey)) {
      const cachedCover = searchResultVariantCoverCache.get(cacheKey)
      if (cachedCover) {
        item.search_cover_url = cachedCover
      }
      return
    }

    const { skuCovers, skuVariants, coverUrl } = await fetchGoodsDetail(goodsId)
    if (!Array.isArray(skuVariants) || skuVariants.length <= 1) {
      searchResultVariantCoverCache.set(cacheKey, '')
      return
    }

    const variants = skuVariants.map((variant) => ({
      ...variant,
      cover_url: skuCovers?.[variant.key] || variant.cover_url || coverUrl || '',
    }))
    const preferredCover = resolvePreferredVariantCover(variants, hint)
    searchResultVariantCoverCache.set(cacheKey, preferredCover)

    if (preferredCover) {
      item.search_cover_url = preferredCover
    }
  }))
}

async function fetchRoleSearchPage(roleTargets, page) {
  if (!roleTargets.length) return { items: [], hasMore: false }

  const groupedResults = await Promise.all(
    roleTargets.map((target) =>
      searchGoodsSpuList({
        shopCode: target.shopCode,
        categoryId: target.categoryId,
        pageSize: SEARCH_RESULTS_EXPANDED_COUNT,
        page,
        random: false,
      })
    )
  )

  const merged = mergeSearchResults(groupedResults.flat())
  const hasMore = groupedResults.some((items) => items.length >= SEARCH_RESULTS_EXPANDED_COUNT)
  return { items: merged, hasMore }
}

async function runSearchPage({ keyword, append }) {
  const currentRequestId = append ? searchSession.requestId : searchSession.requestId + 1
  if (!append) {
    searchSession.requestId = currentRequestId
  }

  const page = append ? searchSession.page + 1 : 1
  let mode = append ? searchSession.mode : ''
  let roleTargets = append ? [...searchSession.roleTargets] : []
  let items = []
  let hasMore = false

  if (!append) {
    roleTargets = await resolveRoleSearchTargets(keyword)
    if (roleTargets.length) {
      mode = 'role'
      const roleResult = await fetchRoleSearchPage(roleTargets, page)
      items = roleResult.items
      hasMore = roleResult.hasMore
    }

    if (!items.length) {
      mode = 'keyword'
      roleTargets = []
      items = await searchGoodsList(keyword, SEARCH_RESULTS_EXPANDED_COUNT, page)
      hasMore = items.length >= SEARCH_RESULTS_EXPANDED_COUNT
    }
  } else if (mode === 'role') {
    const roleResult = await fetchRoleSearchPage(roleTargets, page)
    items = roleResult.items
    hasMore = roleResult.hasMore
  } else {
    mode = 'keyword'
    items = await searchGoodsList(keyword, SEARCH_RESULTS_EXPANDED_COUNT, page)
    hasMore = items.length >= SEARCH_RESULTS_EXPANDED_COUNT
  }

  if (currentRequestId !== searchSession.requestId) {
    return []
  }

  searchSession.mode = mode
  searchSession.keyword = keyword
  searchSession.page = page
  searchSession.hasMore = hasMore
  searchSession.roleTargets = roleTargets
  searchResults.value = mergeSearchResults(items, { append })
  void enhanceSearchResultImages(searchResults.value, keyword)
  return items
}

async function loadMoreSearchResults() {
  if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || searching.value) return
  const keyword = searchSession.keyword || searchKeyword.value.trim()
  if (!keyword) return

  searchLoadingMore.value = true
  try {
    await runSearchPage({ keyword, append: true })
  } catch (error) {
    searchError.value = error?.message || '加载更多失败，请稍后重试'
  } finally {
    searchLoadingMore.value = false
    if (searchExpanded.value && searchHasMore.value) {
      void ensureSearchResultsScrollable()
    }
  }
}

async function ensureSearchResultsScrollable() {
  if (ensureSearchFillPromise) return ensureSearchFillPromise

  ensureSearchFillPromise = (async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || searching.value) break

      await nextTick()
      const scrollRoot = document.querySelector('.import-page .page-body')
      if (!(scrollRoot instanceof Element)) break

      const remaining = scrollRoot.scrollHeight - scrollRoot.clientHeight
      if (remaining > 180) break

      await loadMoreSearchResults()
    }
  })()

  try {
    await ensureSearchFillPromise
  } finally {
    ensureSearchFillPromise = null
  }
}

function disconnectSearchObserver() {
  if (!searchResultsObserver) return
  searchResultsObserver.disconnect()
  searchResultsObserver = null
}

function unbindSearchScrollListener() {
  searchScrollCleanup?.()
  searchScrollCleanup = null
}

function bindSearchScrollListener() {
  unbindSearchScrollListener()
  if (!searchExpanded.value || !searchHasMore.value) return

  const scrollRoot = document.querySelector('.import-page .page-body')
  const target = scrollRoot instanceof Element ? scrollRoot : window
  const handleScroll = () => {
    if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || searching.value) return

    const remaining = scrollRoot instanceof Element
      ? scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight
      : document.documentElement.scrollHeight - window.scrollY - window.innerHeight

    if (remaining <= 220) {
      void loadMoreSearchResults()
    }
  }

  target.addEventListener('scroll', handleScroll, { passive: true })
  searchScrollCleanup = () => {
    target.removeEventListener('scroll', handleScroll)
  }
}

async function reconnectSearchObserver() {
  disconnectSearchObserver()
  if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || !searchLoadMoreRef.value) return

  await nextTick()
  if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || !searchLoadMoreRef.value) return

  const scrollRoot = document.querySelector('.import-page .page-body')
  searchResultsObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMoreSearchResults()
      }
    },
    {
      root: scrollRoot instanceof Element ? scrollRoot : null,
      rootMargin: '0px 0px 280px 0px',
      threshold: 0.01
    }
  )
  searchResultsObserver.observe(searchLoadMoreRef.value)
}

async function selectSearchResult(item) {
  if (!item?.goods_id) return

  selectedSearchGoodsId.value = String(item.goods_id)
  variantSearchHint.value = normalizeSearchHintText(selectedSearchCharacter.value || searchKeyword.value.trim())
  setUrlInputValue(`https://www.mihoyogift.com/goods/${item.goods_id}`)
  await nextTick()
  await handleParse()
}

function shortenUrl(url) {
  try {
    const u = new URL(url)
    const path = u.pathname.split('/').filter(Boolean).join('/')
    return path.length > 38 ? path.slice(0, 38) + '…' : path
  } catch {
    return url.length > 38 ? url.slice(0, 38) + '…' : url
  }
}

async function handleBatchImport() {
  syncUrlInput()
  const urls = urlList.value
  if (!urls.length) return
  parseError.value = ''
  batchStep.value = 'parsing'
  batchParsing.value = true
  batchItems.value = urls.map(url => ({ url, status: 'pending', data: null, error: '' }))
  for (const item of batchItems.value) {
    item.status = 'parsing'
    try {
      const result = await parseMihoyoUrl(item.url)
      if (result.ip && !presets.ips.includes(result.ip)) presets.addIp(result.ip)
      const detectedCat = detectCategory(result.name)
      if (detectedCat && !presets.categories.includes(detectedCat)) presets.addCategory(detectedCat)
      const hasVariants = Array.isArray(result.variants) && result.variants.length > 0
      const allImgs = [result.image, ...(hasVariants ? [] : (result.banners || []))]
        .map(u => (u || '').split('?')[0])
        .filter(Boolean)
        .filter((u, i, arr) => arr.indexOf(u) === i)
      item.data = {
        name: result.name?.trim() || '',
        category: detectedCat || '',
        ip: result.ip || '',
        image: allImgs[0] || '',
        price: result.price != null ? String(result.price) : '',
        notes: '',
        characters: [],
        purchaseDate: '',
        variant: '',
        selectedVariantKey: '',
        baseParsedImages: allImgs,
        parsedImages: allImgs,
        variants: result.variants || [],
        goodsId: result.goodsId || '',
      }
      item.status = 'ready'
      // 异步补全 SKU cover_url + 价格（不阻塞列表显示）
      if (result.goodsId) {
        fetchGoodsDetail(result.goodsId).then(({ skuCovers, skuPrices, skuVariants, coverUrl, mainImages }) => {
          const sourceVariants = skuVariants.length
            ? skuVariants
            : item.data.variants
          item.data.variants = sourceVariants.map(v => ({
            ...v,
            cover_url: skuCovers[v.key] || v.cover_url || coverUrl || '',
            price: v.price ?? skuPrices[v.key] ?? null,
          }))
          if (!item.data.variants.length) {
            const extras = mainImages
              .map(u => (u || '').split('?')[0])
              .filter(u => u && !item.data.baseParsedImages.includes(u))
            if (extras.length) {
              item.data.baseParsedImages = [...item.data.baseParsedImages, ...extras]
              item.data.parsedImages = [...item.data.baseParsedImages]
            }
          }
        }).catch(() => {})
      }
    } catch (e) {
      item.status = 'error'
      item.error = e.message || '解析失败'
    }
  }
  batchParsing.value = false
  batchStep.value = 'list'
}

function openBatchEdit(idx) {
  const item = batchItems.value[idx]
  if (!item?.data) return
  batchEditPriceError.value = ''
  editingBatchIdx.value = idx
  Object.assign(batchEditForm, {
    name: item.data.name,
    category: item.data.category,
    ip: item.data.ip,
    image: item.data.image,
    price: item.data.price,
    notes: item.data.notes,
    tags: Array.isArray(item.data.tags) ? [...item.data.tags] : [],
    characters: [...item.data.characters],
    purchaseDate: item.data.purchaseDate,
    variant: item.data.variant || '',
  })
  batchEditBaseImages.value = [...(item.data.baseParsedImages || item.data.parsedImages || [])]
  batchEditImages.value = [...batchEditBaseImages.value]
  batchEditVariants.value = item.data.variants || []
  batchEditSelectedVariantKey.value = item.data.selectedVariantKey || ''
  if (batchEditSelectedVariantKey.value) {
    const selected = batchEditVariants.value.find((variant) => variant.key === batchEditSelectedVariantKey.value)
    if (selected) {
      applyBatchVariantMedia(selected)
    }
  }
}

function saveBatchEdit() {
  const idx = editingBatchIdx.value
  if (idx < 0) return
  batchEditPriceError.value = ''

  const priceValidation = validatePrice(batchEditForm.price)
  if (!priceValidation.valid) {
    batchEditPriceError.value = priceValidation.message
    return
  }

  Object.assign(batchItems.value[idx].data, {
    name: batchEditForm.name,
    category: batchEditForm.category,
    ip: batchEditForm.ip,
    image: batchEditForm.image,
    price: batchEditForm.price === '' ? '' : Number(batchEditForm.price),
    notes: batchEditForm.notes,
    tags: [...batchEditForm.tags],
    characters: [...batchEditForm.characters],
    purchaseDate: batchEditForm.purchaseDate,
    variant: batchEditForm.variant,
    selectedVariantKey: batchEditSelectedVariantKey.value,
    baseParsedImages: [...batchEditBaseImages.value],
    parsedImages: [...batchEditImages.value],
  })
  editingBatchIdx.value = -1
}

// ── 批量编辑中选择款式 ──
function applyBatchVariantMedia(variant) {
  const raw = (variant?.cover_url || variant?.img_url || '').split('?')[0]
  const nextImages = [...batchEditBaseImages.value]

  if (raw) {
    batchEditImages.value = [raw, ...nextImages.filter((url) => url !== raw)]
    batchEditForm.image = raw
  } else {
    batchEditImages.value = nextImages
    batchEditForm.image = nextImages[0] || batchEditForm.image
  }

  if (variant?.price != null) {
    batchEditForm.price = variant.price
  }
}

function handleBatchVariantSelect(v) {
  if (batchEditSelectedVariantKey.value === v.key) {
    // 取消选中
    batchEditSelectedVariantKey.value = ''
    batchEditForm.variant = ''
    batchEditImages.value = [...batchEditBaseImages.value]
    batchEditForm.image = batchEditBaseImages.value[0] || ''
  } else {
    batchEditSelectedVariantKey.value = v.key
    batchEditForm.variant = displayVariantText(v.text)
    applyBatchVariantMedia(v)
  }
}

async function saveAllBatch() {
  savingAll.value = true
  for (const item of batchItems.value) {
    if (item.status !== 'ready') continue
    item.status = 'saving'
    try {
      for (const charName of item.data.characters) {
        if (!presets.characters.some(c => (typeof c === 'string' ? c : c.name) === charName)) {
          presets.addCharacter(charName, item.data.ip || '')
        }
      }
      await goodsStore.addGoods({
        name: item.data.name?.trim() || '',
        category: item.data.category,
        ip: item.data.ip,
        image: item.data.image,
        price: item.data.price === '' ? null : Number(item.data.price),
        source: '米游铺',
        purchaseDate: item.data.purchaseDate,
        notes: item.data.notes,
        tags: Array.isArray(item.data.tags) ? item.data.tags : [],
        characters: item.data.characters,
        variant: item.data.variant || undefined,
        isWishlist: isWishlistMode.value,
      })
      item.status = 'saved'
    } catch (e) {
      item.status = 'error'
      item.error = e.message || '保存失败'
    }
  }
  savingAll.value = false
  runWithRouteTransition(() => router.replace(isWishlistMode.value ? '/wishlist' : '/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
}
const parsedImages = ref([])  // 当前商品可用图
const parsedBaseImages = ref([])  // 不区分款式的基础图
const parsedVariants = ref([])  // SKU 变体对象 { text, key, img_url, cover_url? }
const variantSectionCollapsed = ref(false)
const selectedVariantKey = ref('')  // 当前选中的 SKU key
const selectedVariantName = ref('')  // 选中款式清洗后的显示名
const selectedCharacterName = ref('')  // 选中款式对应的角色名（会归并 A/B/C/D 尾缀）
const saveAsCharacter = ref(false)  // 是否将选中款式记录为角色

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
  image: '',
  price: '',
  source: '米游铺',
  purchaseDate: '',
  notes: '',
  characters: [],
})

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

const preferredSearchCharacterName = computed(() =>
  normalizeSearchHintText(selectedSearchCharacter.value || searchKeyword.value)
)

function applyPreferredSearchCharacter() {
  const preferredName = preferredSearchCharacterName.value
  form.characters = preferredName ? [preferredName] : []
}

// ── 展示用：只去【】括号和尾款，保留周年对应信息 ──
// 例："二周年贺图款" → "二周年贺图"   "兹白【预售，5月初】" → "兹白"
function cleanVariantText(text) {
  if (!text) return text
  let s = text
  s = s.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
  s = s.replace(/预售[^、，,）)】]*/g, '').replace(/预计[^、，,）)】]*/g, '')
  s = s.replace(/^\s*[\/／]+\s*/g, '').replace(/\s*[\/／]+\s*$/g, '')
  s = s.trim()
  if (s.endsWith('款')) s = s.slice(0, -1)
  return s.trim() || text.trim()
}

// ── 从单条款式文本提取纯角色名 ──
// 例："兹白【预售，5月初】" → "兹白"   "钒离款" → "钒离"
function extractCharName(text) {
  if (!text) return null
  let s = text
  s = s.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
  s = s.replace(/^\s*[\/／]+\s*/g, '').replace(/\s*[\/／]+\s*$/g, '')
  s = s.trim()
  if (s.endsWith('款')) s = s.slice(0, -1)
  s = s.replace(/^[二三四五六七八九十]+周年/, '')  // 中文周年前缀
  s = s.replace(/^\d+周年/, '')                                       // 数字周年前缀
  s = s.replace(/^(纪念|联动|活动|限定|特别|典藏|豪华|普通|标准|完整|初始|全)/, '')
  s = s.trim()
  return s || null
}

// ── 从款式文本提取角色名 ──
function extractCharsFromVariants(variants) {
  if (!variants?.length) return []
  const result = []
  for (const v of variants) {
    const text = typeof v === 'string' ? v : v.text
    const name = extractCharName(text)
    if (!name || name.length < 2 || name.length > 8) continue
    if (/^[A-Za-z0-9\s]+$/.test(name)) continue
    if (/^[ABCDEF]$/.test(name)) continue
    result.push(name)
  }
  return [...new Set(result)]
}

// ── 判断某个变体是否已被用户选中（用 key 追踪，防止同名误判）──
function isVariantSelected(v) {
  return selectedVariantKey.value === v.key
}

// ── 判断清洗后的文本是否像角色名 ──
// 排除：周年贺图、款式描述、颜色、礼盒、套组等常见非角色词
const NON_CHAR_WORDS = [
  '贺图', '贺卡', '周年', '配色', '全套', '套组', '套装', '组合', '合集',
  '随机', '加购', '赠品', '礼盒', '礼品', '礼包', '福袋', '特典',
  '联名', '联动', '合作', '纪念', '限定', '典藏', '豪华', '版本',
  '白色', '黑色', '红色', '蓝色', '绿色', '黄色', '粉色', '紫色', '橙色', '棕色',
  '标准', '普通', '完整', '初始', '全部', '其他', '同款', '款', '新年', '年版'
]
function isLikelyCharName(name) {
  if (!name) return false
  if (name.length < 1 || name.length > 8) return false
  if (/^[A-Za-z0-9\s]+$/.test(name)) return false      // 纯英数
  if (/^\d{4}年?$/.test(name)) return false            // 新增：2024 或 2024年
  if (/\d+周年/.test(name)) return false               // 新增：2周年等
  if (!/[\u4e00-\u9fff]/.test(name)) return false      // 必须含汉字
  if (NON_CHAR_WORDS.some(kw => name.includes(kw))) return false
  return true
}

function displayVariantText(text) {
  return preserveGenderQualifier(cleanVariantText(text), text)
}

function normalizeCharacterName(text) {
  const name = displayVariantText(text).trim()
  return name.replace(/\s*([ABCD])$/i, '').trim()
}

function preserveGenderQualifier(cleanedText, originalText) {
  const base = cleanedText?.trim() || ''
  const source = String(originalText || '')
  const match = source.match(/[（(]\s*(男|女|男女|男款|女款)\s*[）)]/)

  if (!match || !base) return base || source.trim()

  const qualifier = match[1]
  if (base.includes(`（${qualifier}）`) || base.includes(`(${qualifier})`)) {
    return base
  }

  return `${base}（${qualifier}）`
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

function normalizeSearchHintText(value) {
  return String(value || '')
    .trim()
    .replace(/[「」『』【】《》〈〉]/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()
}

function applySelectedVariantMedia(variant) {
  const raw = (variant?.cover_url || variant?.img_url || '').split('?')[0]
  const nextImages = [...parsedBaseImages.value]

  if (raw) {
    parsedImages.value = [raw, ...nextImages.filter((url) => url !== raw)]
    form.image = raw
  } else {
    parsedImages.value = nextImages
    form.image = nextImages[0] || form.image
  }

  if (variant?.price != null) {
    form.price = variant.price
  }
}

function autoSelectVariantByHint() {
  const hint = normalizeSearchHintText(variantSearchHint.value).toLowerCase()
  if (!hint || !parsedVariants.value.length || selectedVariantKey.value) return

  const matched = parsedVariants.value.filter((variant) => {
    const text = String(variant.text || '').trim().toLowerCase()
    const display = displayVariantText(variant.text).trim().toLowerCase()
    const normalizedChar = normalizeCharacterName(variant.text).trim().toLowerCase()
    return text.includes(hint) || display.includes(hint) || normalizedChar.includes(hint)
  })

  if (matched.length === 1) {
    handleVariantSelect(matched[0])
    variantSectionCollapsed.value = true
  }
}

// ── 智能推算 ──
function evalVariantTags(v) {
  const combinedText = [form.name, displayVariantText(v.text)].filter(Boolean).join(' ')
  const presetsStore = usePresetsStore()
  const goodsStore = useGoodsStore()

  const charMap = {}
  if (goodsStore?.list?.length) {
    goodsStore.list.forEach(item => {
      if (item.characters && item.characters.length) {
        const ip = item.ip || 'unknown'
        if (!charMap[ip]) charMap[ip] = []
        item.characters.forEach(c => {
          if (!charMap[ip].includes(c) && !/\d{4}年?/.test(c) && !/周年/.test(c)) charMap[ip].push(c)
        })
      }
    })
  }

  return getTaggingSuggestions({ name: combinedText, note: '' }, staticDictionaries, {
    categories: presetsStore.categories || [],
    ips: presetsStore.ips || [],
    characters: charMap,
    tags: []
  })
}

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
    form.image = parsedBaseImages.value[0] || ''
    applyPreferredSearchCharacter()
  } else {
    selectedVariantKey.value = v.key
    const variantName = displayVariantText(v.text)
    const variantCharacterName = normalizeCharacterName(v.text)
    const preferredCharacterName = preferredSearchCharacterName.value
    selectedVariantName.value = variantName

    // 默认回落
    let fallbackChar = preferredCharacterName
    if (isLikelyCharName(variantCharacterName)) {
      fallbackChar = variantCharacterName
    }
    
    // 动态智能推算
    const tagResult = evalVariantTags(v)
    
    // 角色推断
    if (tagResult.characterSuggestions?.length > 0 && tagResult.characterSuggestions[0].score >= 0.4) {
      selectedCharacterName.value = tagResult.characterSuggestions[0].value
    } else {
      selectedCharacterName.value = fallbackChar
    }

    // 分类推断
    if (tagResult.categorySuggestion && tagResult.categorySuggestion.score >= 0.6) {
      const presets = usePresetsStore()
      const newCat = tagResult.categorySuggestion.value
      if (!presets.categories.includes(newCat)) presets.addCategory(newCat)
      form.category = newCat
    }

    saveAsCharacter.value = Boolean(selectedCharacterName.value)
    form.characters = selectedCharacterName.value ? [selectedCharacterName.value] : []
    applySelectedVariantMedia(v)
  }
}

// ── 用户手动切换"是否记录为角色" ──
function toggleSaveAsCharacter() {
  saveAsCharacter.value = !saveAsCharacter.value
  form.characters = saveAsCharacter.value && selectedCharacterName.value
    ? [selectedCharacterName.value]
    : []
}

// ── 自动匹配分类（关键词）──
function detectCategory(name) {
  if (!name) return ''
    
    const presetsStore = usePresetsStore()
    const goodsStore = useGoodsStore()
    const extractedTags = new Set()
    const charMap = {}
    if (goodsStore?.list?.length) {
      goodsStore.list.forEach(item => {
        if (item.tags && item.tags.length) item.tags.forEach(t => extractedTags.add(t))
        if (item.characters && item.characters.length) {
          const ip = item.ip || 'unknown'
          if (!charMap[ip]) charMap[ip] = []
          item.characters.forEach(c => {
            if (!charMap[ip].includes(c)) charMap[ip].push(c)
          })
        }
      })
    }
    const result = getTaggingSuggestions({ name, note: '' }, staticDictionaries, {
      categories: presetsStore.categories || [], ips: presetsStore.ips || [],
      characters: charMap, tags: Array.from(extractedTags)
    })
    
    if (result.categorySuggestion && result.categorySuggestion.score >= 0.6) {
      return result.categorySuggestion.value
    }
    return ''
}

async function handleParse() {
  // Android 上 v-model 可能滞后，直接从 DOM 同步最新值
  syncUrlInput()
  const url = urlInput.value.trim()
  if (!url) return
  if (!isMihoyoGiftUrl(url)) {
    parseError.value = '请输入米游铺商品链接（mihoyogift.com/goods/... 或 mihoyogift.com/m/goods/...）'
    return
  }

  parsing.value = true
  parseError.value = ''
  parsed.value = false
  parsedVariants.value = []
  variantSectionCollapsed.value = false
  parsedImages.value = []
  parsedBaseImages.value = []
  applyPreferredSearchCharacter()
  selectedVariantKey.value = ''

  try {
    const result = await parseMihoyoUrl(url)

    // 1. 填入基础字段
    form.name = result.name || ''
    form.image = result.image || ''
    form.price = result.price != null ? result.price : ''

    // 收集所有可用图（去重，去掉 OSS resize 参数）
    const hasVariants = Array.isArray(result.variants) && result.variants.length > 0
    const allImgs = [result.image, ...(hasVariants ? [] : (result.banners || []))]
      .map(u => (u || '').split('?')[0])  // 去 OSS resize 参数
      .filter(Boolean)
      .filter((u, i, arr) => arr.indexOf(u) === i)  // 去重
    parsedBaseImages.value = allImgs
    parsedImages.value = [...allImgs]
    // 默认选第一张（封面）
    form.image = allImgs[0] || result.image || ''

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
            parsedBaseImages.value = [...parsedBaseImages.value, ...extras]
            parsedImages.value = [...parsedBaseImages.value]
          }
        }
        autoSelectVariantByHint()
        if (selectedVariantKey.value) {
          const selected = parsedVariants.value.find(v => v.key === selectedVariantKey.value)
          applySelectedVariantMedia(selected)
        }
      }).catch(() => {})
    }

    // 2. 自动添加 IP（如果预设里没有）
    if (result.ip) {
      if (!presets.ips.includes(result.ip)) {
        presets.addIp(result.ip)
      }
      form.ip = result.ip
    }

    // 3. 自动检测分类
    const detectedCat = detectCategory(result.name)
    if (detectedCat) {
      if (!presets.categories.includes(detectedCat)) {
        presets.addCategory(detectedCat)
      }
      form.category = detectedCat
    }

    // 4. 填充变体选项，并先把搜索角色写入角色字段作为默认值
    parsedVariants.value = result.variants || []
    applyPreferredSearchCharacter()
    selectedVariantKey.value = ''  // 重置选中状态
    autoSelectVariantByHint()

    parsed.value = true
  } catch (e) {
    parseError.value = e.message || '解析失败，请检查链接后重试'
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
    parseError.value = '请填写商品名称'
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
      variant: selectedVariantName.value,
      image: form.image,
      price: form.price === '' ? null : Number(form.price),
      source: form.source,
      purchaseDate: form.purchaseDate,
      notes: form.notes,
      characters: form.characters,
      isWishlist: isWishlistMode.value,
    })
    runWithRouteTransition(() => router.replace(isWishlistMode.value ? '/wishlist' : '/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
  } catch (e) {
    parseError.value = '保存失败：' + e.message
  }
}

onMounted(() => {
  bindSearchScrollListener()
  void reconnectSearchObserver()
  updateViewport()
})

onBeforeUnmount(() => {
  unbindSearchScrollListener()
  disconnectSearchObserver()
})
</script>

<style scoped src="../assets/views/ImportView.css"></style>
