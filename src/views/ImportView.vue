<template>
  <div class="page page--transition import-page" :class="{ 'page--leaving': isPageLeaving }">
    <NavBar title="从米游铺导入" show-back />

    <main class="page-body">
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
            <p class="url-hint">粘贴米游铺商品链接</p>
            <div class="url-input-row">
              <input
                ref="urlInputRef"
                :value="urlInput"
                type="text"
                inputmode="url"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                class="url-input"
                placeholder="https://www.mihoyogift.com/goods/... 或 /m/goods/..."
                @input="syncUrlInput($event)"
                @blur="syncUrlInput($event)"
                @change="syncUrlInput($event)"
                @compositionend="syncUrlInput($event)"
                @paste="syncUrlInputLater"
                @keydown.enter="handleParse"
              />
              <button
                class="btn-parse"
                :class="{ 'btn-parse--loading': parsing }"
                :disabled="parsing"
                @pointerdown="syncUrlInput()"
                @click="handleParse"
              >
                <span v-if="!parsing">解析</span>
                <span v-else class="parse-spinner" />
              </button>
            </div>
            <p v-if="parseError" class="parse-error">{{ parseError }}</p>
          </div>
        </div>
      </section>

      <!-- ① 账号批量导入入口 -->
      <button class="account-import-entry" type="button" @click="$router.push('/account-import')">
        <div class="aie-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="7" r="4"/>
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
            <path d="M16 11h6M19 8v6"/>
          </svg>
        </div>
        <div class="aie-body">
          <p class="aie-title">账号批量导入</p>
          <p class="aie-sub">一键导入米游铺账号的所有历史订单</p>
        </div>
        <svg class="aie-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>

      <!-- ② 解析结果 / 编辑表单（解析成功后展示） -->
      <transition name="result-fade">
        <div v-if="parsed" class="result-area">
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
              <p class="hero-label">来自米游铺</p>
              <h1 class="hero-title">{{ form.name || '商品名称' }}</h1>
              <p class="hero-desc">请检查并补充以下信息，确认后保存到你的收藏。</p>
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
                <span class="field-label">
                  选择款式
                  <span class="auto-badge">{{ parsedVariants.length }} 款</span>
                </span>
                <div class="variant-grid">
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
                    将「{{ selectedVariantName }}」记录为角色
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
              <p class="section-label">购入记录</p>
              <h2 class="section-title">价格与来源</h2>
            </div>
            <div class="field-card">
              <label class="field">
                <span class="field-label">价格（元）</span>
                <input v-model.number="form.price" type="number" placeholder="0.00" min="0" step="0.01" />
              </label>
              <label class="field">
                <span class="field-label">购买渠道</span>
                <input v-model="form.source" type="text" placeholder="米游铺" />
              </label>
              <label class="field">
                <span class="field-label">购买日期</span>
                <button class="date-field" type="button" @click="openDatePicker">
                  <span :class="{ 'date-field__value--placeholder': !form.purchaseDate }">
                    {{ form.purchaseDate || '请选择日期' }}
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

      <!-- 底部空白，防止内容被浮动按钮遮挡 -->
      <div style="height: 120px" />
    </main>

    <!-- 浮动保存按钮（Teleport 到 body，避免 will-change 影响 fixed 定位） -->
    <Teleport to="body">
      <div v-if="parsed" class="float-footer">
        <button
          class="btn-primary btn-float"
          @click="handleSave"
        >保存谷子</button>
      </div>
    </Teleport>

    <!-- 日期选择器弹层（teleport 到 body 防止被 float-footer 遮挡） -->
    <Popup v-model:show="showDatePicker" teleport="body" :z-index="2000" position="bottom" round class="picker-popup">
      <DatePicker
        :model-value="toDatePickerValue(form.purchaseDate)"
        title="选择购买日期"
        :min-date="minDate"
        :max-date="maxDate"
        @cancel="showDatePicker = false"
        @confirm="onDateConfirm"
      />
    </Popup>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { DatePicker, Popup } from 'vant'
import { useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import NavBar from '@/components/NavBar.vue'
import AppSelect from '@/components/AppSelect.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import { parseMihoyoUrl, isMihoyoGiftUrl, fetchGoodsDetail } from '@/utils/mihoyo'
import { commitActiveInput } from '@/utils/commitActiveInput'

const router = useRouter()
const goodsStore = useGoodsStore()
const presets = usePresetsStore()
const { isPageLeaving } = usePageLeaveAnimation()

const urlInputRef = ref(null)
const urlInput = ref('')
const parsing = ref(false)
const parseError = ref('')
const parsed = ref(false)
const parsedImages = ref([])  // 所有可用图（cover + banners）
const parsedVariants = ref([])  // SKU 变体对象 { text, key, img_url, cover_url? }
const selectedVariantKey = ref('')  // 当前选中的 SKU key
const selectedVariantName = ref('')  // 选中款式清洗后的显示名
const selectedCharacterName = ref('')  // 选中款式对应的角色名（会归并 A/B/C/D 尾缀）
const saveAsCharacter = ref(false)  // 是否将选中款式记录为角色

// ── 日期选择器 ──
const showDatePicker = ref(false)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

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

// ── 展示用：只去【】括号和尾款，保留周年对应信息 ──
// 例："二周年贺图款" → "二周年贺图"   "兹白【预售，5月初】" → "兹白"
function cleanVariantText(text) {
  if (!text) return text
  let s = text
  s = s.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
  s = s.replace(/预售[^、，,）)】]*/g, '').replace(/预计[^、，,）)】]*/g, '')
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
  '标准', '普通', '完整', '初始', '全部', '其他',
]
function isLikelyCharName(name) {
  if (!name) return false
  if (name.length < 1 || name.length > 8) return false
  if (/^[A-Za-z0-9\s]+$/.test(name)) return false      // 纯英数
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

// ── 用户点击款式按钮：单选 + 自动匹配 SKU 专属图 ──
function handleVariantSelect(v) {
  if (selectedVariantKey.value === v.key) {
    // 再次点击同一个：取消选中
    selectedVariantKey.value = ''
    selectedVariantName.value = ''
    selectedCharacterName.value = ''
    saveAsCharacter.value = false
    form.characters = []
  } else {
    selectedVariantKey.value = v.key
    const variantName = displayVariantText(v.text)
    const characterName = normalizeCharacterName(v.text)
    selectedVariantName.value = variantName
    selectedCharacterName.value = characterName
    // 默认根据关键词判断是否像角色名，用户可再手动切换
    const looksLikeChar = isLikelyCharName(characterName)
    saveAsCharacter.value = looksLikeChar
    form.characters = looksLikeChar ? [characterName] : []
    // 优先用 cover_url（SKU 专属封面），其次 img_url
    const raw = (v.cover_url || v.img_url || '').split('?')[0]
    if (raw) {
      if (!parsedImages.value.includes(raw)) {
        parsedImages.value.unshift(raw)
      }
      form.image = raw
    }
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
  if (name.includes('满赠') || name.includes('赠品')) return '赠品'
  if (name.includes('手办') || name.includes('模型')) return '手办'
  if (name.includes('挂件') || name.includes('挂摆')) return '挂件'
  if (name.includes('徽章')) return '徽章'
  if (name.includes('卡片') || name.includes('票卡') || name.includes('卡套') || name.includes('色纸') || name.includes('亚克力立牌')) return '卡片'
  if (/CD|专辑/.test(name)) return 'CD/专辑'
  if (name.includes('服饰') || name.includes('衬衫') || name.includes('针织') || name.includes('外套') || name.includes('痛包') || name.includes('斜挎包')) return '周边服饰'
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
  parsedImages.value = []
  form.characters = []
  selectedVariantKey.value = ''

  try {
    const result = await parseMihoyoUrl(url)

    // 1. 填入基础字段
    form.name = result.name || ''
    form.image = result.image || ''
    form.price = result.price != null ? result.price : ''

    // 收集所有可用图（去重，去掉 OSS resize 参数）
    const allImgs = [result.image, ...(result.banners || [])]
      .map(u => (u || '').split('?')[0])  // 去 OSS resize 参数
      .filter(Boolean)
      .filter((u, i, arr) => arr.indexOf(u) === i)  // 去重
    parsedImages.value = allImgs
    // 默认选第一张（封面）
    form.image = allImgs[0] || result.image || ''

    // 异步补充 main_url 展示图 + SKU 专属封面（不阻塞显示）
    if (result.goodsId) {
      fetchGoodsDetail(result.goodsId).then(({ mainImages, skuCovers, coverUrl }) => {
        // 把 SKU cover_url 回填到对应变体
        parsedVariants.value = parsedVariants.value.map(v => ({
          ...v,
          cover_url: skuCovers[v.key] || v.cover_url || coverUrl || ''
        }))
        // 补充 main_url 图片到选择器
        const extras = mainImages
          .map(u => (u || '').split('?')[0])
          .filter(u => u && !parsedImages.value.includes(u))
        if (extras.length) {
          parsedImages.value = [...parsedImages.value, ...extras]
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

    // 4. 填充变体选项（角色由用户自己选择）
    parsedVariants.value = result.variants || []
    form.characters = []      // 清空，等用户手动选
    selectedVariantKey.value = ''  // 重置选中状态

    parsed.value = true
  } catch (e) {
    parseError.value = e.message || '解析失败，请检查链接后重试'
  } finally {
    parsing.value = false
  }
}

// ── 日期选择器逻辑 ──
function openDatePicker() {
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  form.purchaseDate = `${year}-${month}-${day}`
  showDatePicker.value = false
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
  await commitActiveInput()
  if (!form.name.trim()) {
    parseError.value = '请填写商品名称'
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
    })
    router.replace('/home')
  } catch (e) {
    parseError.value = '保存失败：' + e.message
  }
}
</script>

<style scoped>
.page-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── URL 输入区 ── */
.url-section {
  margin-top: 8px;
}

/* ── 账号批量导入入口 ── */
.account-import-entry {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  border: none;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  cursor: pointer;
  text-align: left;
  transition: transform 0.13s ease, background 0.12s ease;
}
.account-import-entry:active {
  transform: scale(0.98);
  background: #f0f0f5;
}
.aie-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
  display: flex;
  align-items: center;
  justify-content: center;
}
.aie-icon svg {
  width: 20px;
  height: 20px;
}
.aie-body {
  flex: 1;
  min-width: 0;
}
.aie-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0 0 2px;
}
.aie-sub {
  font-size: 12.5px;
  color: var(--app-text-tertiary);
  margin: 0;
}
.aie-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: rgba(0, 0, 0, 0.25);
}

.url-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.url-icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #e8f4ff;
  color: #2070c0;
}

.url-icon svg {
  width: 22px;
  height: 22px;
}

.url-body {
  flex: 1;
  min-width: 0;
}

.url-hint {
  font-size: 13px;
  color: var(--app-text-tertiary);
  margin-bottom: 8px;
}

.url-input-row {
  display: flex;
  gap: 8px;
}

.url-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(20, 20, 22, 0.1);
  border-radius: 10px;
  background: #f4f4f6;
  font-size: 14px;
  color: var(--app-text);
  outline: none;
  transition: border-color 0.15s;
}

.url-input::placeholder {
  color: var(--app-placeholder);
  font-size: 12px;
}

.url-input:focus {
  border-color: rgba(20, 20, 22, 0.25);
  background: #fff;
}

.btn-parse {
  flex-shrink: 0;
  height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  background: var(--app-text);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
}

.btn-parse:disabled {
  opacity: 0.36;
}

.btn-parse:not(:disabled):active {
  transform: scale(0.96);
}

.btn-parse--loading {
  opacity: 0.7;
  pointer-events: none;
}

.parse-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.parse-error {
  margin-top: 8px;
  font-size: 13px;
  color: #c74444;
  white-space: pre-line;
  line-height: 1.5;
}

/* ── 结果区过渡 ── */
.result-fade-enter-active { transition: opacity 0.35s ease, transform 0.35s ease; }
.result-fade-leave-active { transition: opacity 0.2s ease; }
.result-fade-enter-from { opacity: 0; transform: translateY(12px); }
.result-fade-leave-to { opacity: 0; }

/* ── 预览卡 ── */
.manage-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 0;
}

.preview-stage {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-glow {
  position: absolute;
  inset: -4px;
  border-radius: 26px;
  background: radial-gradient(ellipse at center, rgba(100, 160, 255, 0.18) 0%, transparent 70%);
  pointer-events: none;
}

.preview-media {
  width: 76px;
  height: 76px;
  border-radius: 18px;
  overflow: hidden;
  background: #eeeef0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(20, 20, 22, 0.12);
  position: relative;
  z-index: 1;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-fallback {
  font-size: 26px;
  font-weight: 700;
  color: var(--app-text-tertiary);
  line-height: 1;
}

.hero-card {
  padding: 0;
  flex: 1;
  min-width: 0;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.hero-desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

/* ── 表单区 ── */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.section-head {
  margin-bottom: 14px;
}

.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
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
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small, 12px);
  background: #f4f4f6;
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.required { color: #c74444; }

.field input,
.field textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: #ffffff;
  color: var(--app-text);
  font-size: 16px;
  padding: 0 14px;
  outline: none;
  transition: border-color 0.16s ease;
}

.field textarea {
  min-height: 80px;
  padding: 12px 14px;
  resize: vertical;
}

.field input::placeholder,
.field textarea::placeholder {
  color: var(--app-placeholder);
}

.field input:focus,
.field textarea:focus {
  border-color: rgba(20, 20, 22, 0.16);
  background: #fff;
}

/* ── 浮动保存按钮 ── */
.float-footer {
  position: fixed;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom, 20px));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  z-index: 100;
}

.btn-primary {
  width: 100%;
  height: 54px;
  border: none;
  border-radius: 16px;
  background: var(--app-text);
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: -0.02em;
  transition: opacity 0.15s, transform 0.12s;
}

.btn-float {
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(20, 20, 22, 0.28);
}

.btn-primary:active {
  transform: scale(0.98);
  opacity: 0.88;
}

/* ── 自动识别角色 chips ── */
.auto-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 6px;
  background: #e3f0ff;
  color: #2070c0;
  font-size: 11px;
  font-weight: 500;
  vertical-align: middle;
}

.char-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.char-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px 5px 12px;
  border-radius: 999px;
  background: #eef3ff;
  color: #2040a0;
  font-size: 13px;
  font-weight: 500;
}

.char-chip-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(32, 64, 160, 0.12);
  color: #2040a0;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s;
}

.char-chip-del:active {
  background: rgba(32, 64, 160, 0.24);
}

/* ── 变体（角色款式）选择器 ── */
.variant-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.variant-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border: 2px solid rgba(20, 20, 22, 0.1);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
  min-width: 60px;
}

.variant-btn:active {
  transform: scale(0.95);
}

.variant-btn--selected {
  border-color: #2070c0;
  background: #e8f2ff;
}

.variant-img-wrap {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: #eeeef0;
}

.variant-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.variant-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
  line-height: 1.3;
  text-align: center;
  max-width: 80px;
  word-break: break-all;
}

.variant-btn--selected .variant-name {
  color: #2070c0;
  font-weight: 600;
}

.variant-check {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2070c0;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(32, 112, 192, 0.4);
}

.variant-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #2070c0;
  font-weight: 500;
}

.variant-hint--muted {
  color: var(--app-text-tertiary);
  font-weight: 400;
}

/* ── 图片选择器 ── */
.img-picker-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 6px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.img-picker-scroll::-webkit-scrollbar {
  display: none;
}

.img-picker-item {
  flex-shrink: 0;
  position: relative;
  width: 80px;
  height: 80px;
  border: 2px solid transparent;
  border-radius: 12px;
  overflow: hidden;
  padding: 0;
  background: #eeeef0;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.12s;
}

.img-picker-item:active {
  transform: scale(0.96);
}

.img-picker-item--active {
  border-color: #2070c0;
}

.img-picker-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.img-picker-badge {
  position: absolute;
  bottom: 3px;
  left: 3px;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
}

.img-picker-check {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2070c0;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* ── 日期选择器按钮 ── */
.date-field {
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
  transition: border-color 0.18s ease, transform 0.16s ease;
}
.date-field:active { transform: scale(0.98); }
.date-field span {
  color: var(--app-text);
  font-size: 16px;
}
.date-field__value--placeholder { color: var(--app-placeholder); }
.date-field__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.picker-popup { overflow: hidden; }
:deep(.picker-popup .van-picker) {
  --van-picker-background: #ffffff;
  --van-picker-toolbar-height: 52px;
  --van-picker-option-font-size: 17px;
  --van-picker-title-font-size: 16px;
  --van-picker-confirm-action-color: #141416;
  --van-picker-cancel-action-color: #8e8e93;
}
:deep(.picker-popup .van-picker__toolbar) { padding: 0 8px; }
:deep(.picker-popup .van-picker__title) { font-weight: 600; }
:deep(.picker-popup .van-picker-column__item) { color: var(--app-text-secondary); }
:deep(.picker-popup .van-picker-column__item--selected) { color: var(--app-text); }

/* ── 款式是否记录为角色：iOS 风格切换行 ── */
.save-char-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #f0f4ff;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.save-char-label {
  font-size: 13px;
  color: var(--app-text, #1c1c1e);
  line-height: 1.4;
  flex: 1;
  margin-right: 12px;
}
.save-char-toggle {
  flex-shrink: 0;
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: #d0d0d4;
  position: relative;
  transition: background 0.22s;
}
.save-char-toggle--on {
  background: #2070c0;
}
.save-char-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  transition: transform 0.22s cubic-bezier(0.34, 1.1, 0.64, 1);
}
.save-char-toggle--on .save-char-knob {
  transform: translateX(18px);
}

</style>
