import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { parseMihoyoUrl, isMihoyoGiftUrl, fetchGoodsDetail } from '@/utils/mihoyo/index'
import { useMihoyoGoodsQueue } from '@/composables/import/useMihoyoGoodsQueue'
import {
  normalizeMihoyoImageList,
  resolveMihoyoImportDraft,
  resolveMihoyoVariantDraft,
} from '@/utils/mihoyo/importResolver'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { showGlobalToast } from '@/utils/globalToast'

// 解析接口偶发只返回商品详情、不带 goodsId；链接本身仍然是可靠的数据源。
function extractGoodsIdFromMihoyoUrl(url) {
  const match = String(url || '').match(/\/goods\/(\d+)/i)
  return match ? match[1] : ''
}

/**
 * 从多行文本中解析米游铺链接条目：
 * - 每行一个链接（或一行多个链接），行内可带数量后缀（x3 / 3个 / 单独数字）
 * - xN 表示该链接解析 N 次 → 展开为 N 个独立链接（各自成为队列里的一个选择项）
 * - 返回 URL 字符串数组（已按数量展开）
 */
export function parseBatchUrlEntries(text) {
  const lines = String(text || '').split(/\r?\n/)
  const urls = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    for (const urlMatch of line.matchAll(/https?:\/\/\S+/gi)) {
      let url = urlMatch[0].replace(/[),.，。；;]+$/, '')
      let count = 1

      // 紧贴链接的数量后缀（如 链接x2）：先解析数量，再剥掉避免污染 URL
      const tightX = url.match(/([×＊xX])(\d+)$/)
      if (tightX) {
        count = Number.parseInt(tightX[2], 10) || 1
        url = url.slice(0, tightX.index)
      } else {
        // 紧贴的单位字（如 链接2个）：剥掉单位字，数量按 1 处理（数字属于商品 ID）
        url = url.replace(/([个個件份套盒只枚])$/, '')
      }

      if (!isMihoyoGiftUrl(url)) continue

      // 空格分隔的数量后缀（如 链接 x2 / 链接 2个）
      const before = line.slice(0, urlMatch.index).trim()
      const after = line.slice(urlMatch.index + urlMatch[0].length).trim()
      const countSource = `${before} ${after}`.replace(/[×＊]/g, 'x').trim()
      // 仅识别明确的数量写法（x3 / 3个 / 单独数字），避免行内无关数字（如「第3弹」）被误判为购买数量
      const countMatch = countSource.match(/(?:^|[^a-z0-9])x\s?(\d+)(?=\D|$)/i)
        || countSource.match(/(?:^|[^第\d])(\d+)\s*[个個件份套盒只枚](?=\D|$)/)
        || countSource.match(/^(\d+)$/)
      if (countMatch) {
        count = Math.max(1, Number.parseInt(countMatch[1], 10) || 1)
      }

      for (let i = 0; i < count; i += 1) {
        urls.push(url)
      }
    }
  }

  return urls
}

function cloneImages(list) {
  return Array.isArray(list) ? [...list] : []
}

// 今天的日期（YYYY-MM-DD）
function todayString() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 米游铺批量导入 —— 队列式（与有货监控共用 useMihoyoGoodsQueue / MihoyoGoodsQueuePanel）：
 * - 搜索多选 / 多条链接解析后进入「待导入队列」
 * - 手机端左右滑动、平板端右侧条切换不同谷子
 * - 每个谷子：选择款式（可多选，自动选款）+ 填入/修改信息
 * - 链接 xN = 该链接解析 N 次，生成 N 个独立队列项（各自选款式/填信息）
 */
export function useBatchImport({
  urlInput,
  urlInputRef,
  syncUrlInput,
  isWishlistMode,
  ensureHistoricalTagContext,
  updateHistoricalTagContextFromItem,
  getSearchContext,
  getDeckEl,
}) {
  const { t } = useI18n()
  const router = useRouter()
  const goodsStore = useGoodsStore()
  const presets = usePresetsStore()

  // 入队默认日期：收藏模式预填今天；心愿单的「预计入手日期」留空（可选字段，UI 显示「暂未计划」占位）
  const defaultPurchaseDate = () => (isWishlistMode.value ? '' : todayString())

  // ── 共享队列（与有货监控同一套逻辑） ──
  const queueState = useMihoyoGoodsQueue({
    hint: () => getSearchContext().hint,
    getDeckEl,
    onSkuSelected: (entry, sku) => applySkuInfo(entry, sku),
  })
  const {
    queue,
    queuedGoodsIds,
    enqueueGoods,
    autoSelectSku,
  } = queueState

  // ── 链接解析状态 ──
  const parsingLinks = ref(false)
  const batchCancelRequested = ref(false)
  const linkProgress = reactive({ done: 0, total: 0 })
  const savingAll = ref(false)

  // ── 输入区判定 ──
  const urlEntries = computed(() => parseBatchUrlEntries(urlInput.value || ''))
  // 队列非空 / 多条链接（含 xN 展开） → 走队列批量导入；单条链接且队列为空 → 走单件表单
  const batchMode = computed(() => (
    queue.value.length > 0
    || urlEntries.value.length > 1
  ))
  const batchParseButtonText = computed(() => {
    const entryCount = urlEntries.value.length
    if (!entryCount) return t('import.batchParse')
    return t('import.batchParseButtonText', { entries: entryCount })
  })

  // 收藏中已存在的米游铺商品 ID（不含心愿单），用于「可能已拥有」提示
  const ownedGoodsIds = computed(() => {
    const ids = new Set()
    for (const goods of goodsStore.list || []) {
      if (goods?.goodsId && !goods.isWishlist) ids.add(String(goods.goodsId))
    }
    return ids
  })

  function isQueueItemOwned(entry) {
    const goodsId = entry?.goodsId
    return goodsId ? ownedGoodsIds.value.has(String(goodsId)) : false
  }

  // 平板端队列卡片摘要：整件 / 单款式名 / 已选 N 款
  function queueSummary(entry) {
    if (entry.parseFailed) return t('import.linkParseFailed')
    const list = entry.selectedSkus || []
    if (list.length === 0) return t('mihoyoStock.selectSkuHint')
    if (list.length === 1) return list[0].text || list[0].key
    return t('mihoyoStock.skuSelectedCount', { count: list.length })
  }

  // 确认导入的总件数 = Σ（选中款式数，未选按整件 1 计）
  const queueImportCount = computed(() => queue.value.reduce((sum, e) => {
    if (e.parseFailed) return sum
    return sum + (e.selectedSkus.length ? e.selectedSkus.length : 1)
  }, 0))

  // ── 把解析草稿回填到队列项（入队与重试共用） ──
  function fillEntryFromDraft(entry, draft, variants = []) {
    entry.goodsId = String(
      draft.goodsId || draft.goods_id || extractGoodsIdFromMihoyoUrl(entry.url)
    ).trim()
    entry.name = String(draft.name || '').trim() || t('mihoyoStock.unnamed')
    entry.priceCents = draft.price !== '' && draft.price != null ? Math.round(Number(draft.price) * 100) : 0
    entry.coverUrl = String(draft.image || '').trim()
    Object.assign(entry.info, {
      category: draft.category || '',
      ip: draft.ip || '',
      image: draft.image || '',
      images: cloneImages(draft.images),
      price: draft.price !== '' && draft.price != null ? String(draft.price) : '',
      characters: cloneImages(draft.characters),
    })
    entry.baseImages = cloneImages(draft.baseParsedImages)
    entry.parsedImages = cloneImages(draft.parsedImages)
    entry.variants = (variants.length ? variants : (draft.variants || []))
      .filter((v) => v && v.key)
      .map((v) => ({
        text: String(v.text || v.key),
        key: String(v.key),
        cover_url: String(v.cover_url || v.img_url || ''),
        price: v.price != null ? Number(v.price) : null,
      }))
    entry.variantsLoaded = true
    entry.loading = false
    entry.parseFailed = false
    entry.parseError = ''
    entry.error = ''
    autoSelectSku(entry)
    // 自动选中了具体款式则收起选择器；未命中时展开让用户自己选
    entry.expanded = !entry.selectedSkus.length
  }

  // 根据解析结果入队（带智能识别草稿 + 款式变体）
  function enqueueFromDraft(result, { url = '', preferredCharacter = '', variants = [] } = {}) {
    const draft = resolveMihoyoImportDraft(result, {
      context: ensureHistoricalTagContext(),
      preferredCharacter,
    })
    if (draft.ip && !presets.ips.includes(draft.ip)) presets.addIp(draft.ip)
    if (draft.category && !presets.categories.includes(draft.category)) presets.addCategory(draft.category)

    const entry = enqueueGoods({
      goodsId: '',
      name: draft.name || '',
      priceCents: 0,
      coverUrl: '',
      url,
      parseFailed: false,
      parseError: '',
      infoExpanded: false,
      baseImages: [],
      parsedImages: [],
      info: reactive({
        category: '',
        ip: '',
        image: '',
        images: [],
        price: '',
        purchaseDate: defaultPurchaseDate(),
        notes: '',
        tags: [],
        characters: [],
      }),
    }, { load: false })
    fillEntryFromDraft(entry, draft, variants)
    return { entry, draft }
  }

  // 解析失败：入队一个可重试的错误项，留在队列里提示用户
  function enqueueParseFailed(url, message) {
    enqueueGoods({
      goodsId: '',
      name: shortenLinkText(url) || t('import.unknownGoods'),
      priceCents: 0,
      coverUrl: '',
      url,
      parseFailed: true,
      parseError: message || t('import.linkParseFailed'),
      infoExpanded: false,
      baseImages: [],
      parsedImages: [],
      info: reactive({
        category: '', ip: '', image: '', images: [], price: '',
        purchaseDate: '', notes: '', tags: [], characters: [],
      }),
    }, { load: false })
  }

  // 搜索结果入队（多选）：预填完整 info 结构（分类/IP/角色/图片），款式变体按需懒加载
  function enqueueFromSearch({ goodsId, name = '', priceCents = 0, coverUrl = '' }) {
    const draft = resolveMihoyoImportDraft(
      { goodsId, name, image: coverUrl, coverImage: coverUrl, variants: [] },
      {
        context: ensureHistoricalTagContext(),
        preferredCharacter: getSearchContext().preferredCharacter,
      }
    )
    if (draft.ip && !presets.ips.includes(draft.ip)) presets.addIp(draft.ip)
    if (draft.category && !presets.categories.includes(draft.category)) presets.addCategory(draft.category)

    const baseImages = normalizeMihoyoImageList(
      Array.isArray(draft.parsedImages) && draft.parsedImages.length
        ? draft.parsedImages
        : (coverUrl ? [coverUrl] : [])
    )
    const priceYuan = Number(priceCents) > 0 ? String(Number(priceCents) / 100) : ''
    const entry = enqueueGoods({
      goodsId: String(goodsId || '').trim(),
      name: String(name || '').trim() || t('mihoyoStock.unnamed'),
      priceCents: Number(priceCents) || 0,
      coverUrl: baseImages[0] || String(coverUrl || '').trim(),
      url: '',
      parseFailed: false,
      parseError: '',
      infoExpanded: false,
      baseImages: [...baseImages],
      parsedImages: [...baseImages],
      info: reactive({
        category: draft.category || '',
        ip: draft.ip || '',
        image: baseImages[0] || '',
        images: [...(Array.isArray(draft.images) && draft.images.length ? draft.images : baseImages.slice(0, 1))],
        price: priceYuan || (draft.price !== '' && draft.price != null ? String(draft.price) : ''),
        purchaseDate: defaultPurchaseDate(),
        notes: '',
        tags: [],
        characters: [...(draft.characters || [])],
      }),
    })
    updateHistoricalTagContextFromItem({
      ip: entry.info.ip,
      characters: entry.info.characters,
      tags: entry.info.tags,
    })
    return entry
  }

  // 链接解析失败后重试：重新解析并原位回填
  async function retryParseLink(entry) {
    if (!entry?.url || entry.parseFailed !== true || parsingLinks.value) return
    entry.parseError = ''
    entry.loading = true
    try {
      const result = await parseMihoyoUrl(entry.url)
      const variants = await mergeVariants(result)
      const draft = resolveMihoyoImportDraft(result, {
        context: ensureHistoricalTagContext(),
      })
      if (draft.ip && !presets.ips.includes(draft.ip)) presets.addIp(draft.ip)
      if (draft.category && !presets.categories.includes(draft.category)) presets.addCategory(draft.category)
      fillEntryFromDraft(entry, draft, variants)
      updateHistoricalTagContextFromItem({
        ip: entry.info.ip,
        characters: entry.info.characters,
        tags: entry.info.tags,
      })
    } catch (e) {
      entry.parseError = e.message || t('import.linkParseFailed')
    } finally {
      entry.loading = false
    }
  }

  // 拉取详情并合并 SKU 专属封面/价格到变体（失败时回退解析草稿的变体）
  async function mergeVariants(result) {    if (!result?.goodsId) return []
    try {
      const { skuCovers, skuPrices, skuVariants, coverUrl } = await fetchGoodsDetail(result.goodsId)
      if (skuVariants.length) {
        return skuVariants.map((v) => ({
          ...v,
          cover_url: skuCovers[v.key] || v.cover_url || coverUrl || '',
          price: v.price ?? skuPrices[v.key] ?? null,
        }))
      }
    } catch (_) {
      // 详情补全失败不影响基础数据
    }
    return (result.variants || []).map((v) => ({
      ...v,
      cover_url: v.img_url || '',
      price: v.price != null ? Number(v.price) : null,
    }))
  }

  // ── 批量解析：链接解析后逐个入队（xN 已由 parseBatchUrlEntries 展开为 N 个独立项） ──
  async function handleBatchImport() {
    syncUrlInput()
    const entries = urlEntries.value
    if (!entries.length || parsingLinks.value) return
    parsingLinks.value = true
    batchCancelRequested.value = false
    linkProgress.total = entries.length
    linkProgress.done = 0

    // 快照本次解析开始前的队列：xN 展开出的同商品多份不会被去重
    const initialQueuedIds = new Set(queuedGoodsIds.value)
    const CONCURRENCY = 3
    let nextIndex = 0
    let skipped = 0

    async function parseNext() {
      while (nextIndex < entries.length) {
        if (batchCancelRequested.value) return
        const entryIndex = nextIndex++
        const url = entries[entryIndex]
        linkProgress.done += 1
        try {
          const result = await parseMihoyoUrl(url)
          // 仅跳过本次解析前已在队列中的商品（xN 展开出的同链接多份保留）
          if (initialQueuedIds.has(String(result.goodsId))) {
            skipped += 1
            continue
          }
          const variants = await mergeVariants(result)
          const { entry } = enqueueFromDraft(result, {
            url,
            preferredCharacter: getSearchContext().preferredCharacter,
            variants,
          })
          updateHistoricalTagContextFromItem({
            ip: entry.info.ip,
            characters: entry.info.characters,
            tags: entry.info.tags,
          })
        } catch (e) {
          enqueueParseFailed(url, e?.message || t('import.linkParseFailed'))
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => parseNext())
    await Promise.all(workers)
    parsingLinks.value = false
    if (skipped > 0 && queue.value.length) {
      showGlobalToast(t('import.queueDuplicateSkipped', { count: skipped }))
    }
  }

  function stopBatchParsing() {
    batchCancelRequested.value = true
  }

  // ── 款式选中 → 智能回填分类/角色（单选款式时表单随选中款式联动） ──
  function applySkuInfo(entry, sku) {
    if (!entry || !sku || entry.parseFailed || !entry.info) return
    const resolved = resolveMihoyoVariantDraft({
      name: entry.name,
      variant: sku,
      context: ensureHistoricalTagContext(),
      preferredCharacter: getSearchContext().preferredCharacter,
    })
    if (resolved.category) entry.info.category = resolved.category
    if (resolved.selectedCharacterName) {
      entry.info.characters = [resolved.selectedCharacterName]
    }
    if (sku.price != null && Number.isFinite(Number(sku.price))) {
      entry.info.price = String(Number(sku.price))
    }
    // 选中带专属封面的款式：默认主图改用 SKU 图，不再预勾选「商品默认图」
    alignInfoImagesWithSku(entry, sku)
  }

  // 选中带专属封面的款式后，若图片选择区只是默认勾选了「商品默认图」
  // （没选 SKU 时用的头图），则取消勾选、主图切换为 SKU 图——
  // 避免入库后详情页出现「SKU 图 + 多余的商品默认图」两张。
  // 用户手动多选了其它图时保留原选择（图片选择区状态即入库结果）。
  function alignInfoImagesWithSku(entry, sku) {
    if (!entry?.info || !sku?.cover_url) return
    const defaultCover = entry.coverUrl || entry.info.image || ''
    const images = entry.info.images || []
    const isDefaultOnly = images.length === 1 && images[0] === defaultCover
    if (!isDefaultOnly) return
    entry.info.images = []
    entry.info.image = sku.cover_url
  }

  // 回到「整件商品」：图片选择区为空时恢复商品默认图，保证整件也有一张主图可显示
  function restoreDefaultImages(entry) {
    if (!entry?.info) return
    const defaultCover = entry.coverUrl || ''
    if (defaultCover && !(entry.info.images || []).length) {
      entry.info.images = [defaultCover]
      entry.info.image = defaultCover
    }
  }

  function restoreDefaultPrice(entry) {
    if (!entry?.info) return
    entry.info.price = entry.priceCents > 0 ? String(entry.priceCents / 100) : ''
  }

  // 单选款式（导入侧）：点选切换为唯一选中，再点同一款回到「整件商品」。
  // 有货监控侧保持多选（共用 useMihoyoGoodsQueue 的 selectSku，不受影响）
  function selectSingleSku(entry, variant) {
    if (!entry || !variant || entry.parseFailed) return
    const idx = entry.selectedSkus.findIndex((s) => s.key === variant.key)
    if (idx >= 0) {
      entry.selectedSkus = []
      restoreDefaultImages(entry)
      restoreDefaultPrice(entry)
    } else {
      entry.selectedSkus = [{ key: variant.key, text: variant.text, cover_url: variant.cover_url || '', price: variant.price != null ? Number(variant.price) : null }]
      applySkuInfo(entry, variant)
    }
  }

  // 整件商品：清空选中款式并恢复默认主图（图片区为空时）。
  // 覆盖共享队列的 selectWholeGoods，仅导入侧需要图片联动；有货监控不受影响
  function selectWholeGoods(entry) {
    queueState.selectWholeGoods(entry)
    restoreDefaultImages(entry)
    restoreDefaultPrice(entry)
  }

  // 图片多选切换
  function toggleQueueImage(entry, url) {
    if (!entry?.info) return
    const images = [...(entry.info.images || [])]
    const idx = images.indexOf(url)
    if (idx >= 0) {
      images.splice(idx, 1)
    } else {
      images.push(url)
    }
    entry.info.images = images
    entry.info.image = images[0] || ''
  }

  // ── 生成一条入库数据（选中款式 → 每款一条；未选款式 → 整件一条） ──
  function buildGoodsRow(entry, sku) {
    const info = entry.info || {}
    // 款式选择时已经通过 applySkuInfo 回填角色；保存阶段必须以表单值为准，
    // 否则用户忽略或删除自动识别的角色后会被再次写回。
    const characters = cloneImages(info.characters)
    const skuCover = sku?.cover_url || ''
    const image = skuCover || info.image || ''
    const images = skuCover
      ? [skuCover, ...(info.images || []).filter((u) => u && u !== skuCover)]
      : cloneImages(info.images)
    const skuPrice = sku?.price != null ? Number(sku.price) : null
    const price = skuPrice != null
      ? skuPrice
      : (info.price === '' || info.price == null ? null : Number(info.price))

    const goodsId = String(
      entry.goodsId || entry.goods_id || entry._goodsId ||
      entry.info?.goodsId || extractGoodsIdFromMihoyoUrl(entry.url)
    ).trim()

    return {
      name: String(entry.name || '').trim(),
      category: info.category || '',
      ip: info.ip || '',
      goodsId,
      image,
      images,
      price,
      source: '米游铺',
      purchaseDate: info.purchaseDate || defaultPurchaseDate(),
      notes: info.notes || '',
      tags: cloneImages(info.tags),
      characters,
      variant: sku ? String(sku.text || '') : '',
      isWishlist: isWishlistMode.value,
    }
  }

  // ── 确认导入：整队批量落库 ──
  async function confirmImportQueue() {
    if (savingAll.value || !queue.value.length) return

    const invalid = queue.value.find((e) => !e.parseFailed && !String(e.name || '').trim())
    if (invalid) {
      showGlobalToast(t('import.errorNameRequired'))
      return
    }

    savingAll.value = true
    const rows = []
    for (const entry of queue.value) {
      if (entry.parseFailed) continue
      const targets = entry.selectedSkus.length ? entry.selectedSkus : [null]
      for (const sku of targets) {
        rows.push(buildGoodsRow(entry, sku))
      }
    }

    if (!rows.length) {
      savingAll.value = false
      showGlobalToast(t('import.noData'))
      return
    }

    // 把选中的角色加入预设（如果还没有的话）
    for (const row of rows) {
      for (const charName of row.characters || []) {
        const exists = presets.characters.some((c) =>
          (typeof c === 'string' ? c : c.name) === charName
        )
        if (!exists) {
          presets.addCharacter(charName, row.ip || '')
        }
      }
    }

    try {
      await goodsStore.addGoodsBatch(rows)
      for (const entry of queue.value) {
        if (!entry.parseFailed) {
          updateHistoricalTagContextFromItem({
            ip: entry.info.ip,
            characters: entry.info.characters,
            tags: entry.info.tags,
          })
        }
      }
      showGlobalToast(t(
        isWishlistMode.value ? 'import.importedWishlistToast' : 'import.importedToast',
        { count: rows.length }
      ))
      runWithRouteTransition(() => router.replace(isWishlistMode.value ? '/wishlist' : '/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
    } catch (e) {
      showGlobalToast(t('import.errorSaveFailed', { message: e.message || '' }))
    } finally {
      savingAll.value = false
    }
  }

  return {
    ...queueState,
    urlEntries,
    batchMode,
    batchParseButtonText,
    parsingLinks,
    linkProgress,
    savingAll,
    queueImportCount,
    isQueueItemOwned,
    queueSummary,
    handleBatchImport,
    stopBatchParsing,
    retryParseLink,
    confirmImportQueue,
    toggleQueueImage,
    enqueueFromSearch,
    selectSingleSku,
    selectWholeGoods,
  }
}

function shortenLinkText(url) {
  try {
    const u = new URL(url)
    const path = u.pathname.split('/').filter(Boolean).join('/')
    return path.length > 38 ? `${path.slice(0, 38)}…` : path
  } catch {
    return url.length > 38 ? `${url.slice(0, 38)}…` : url
  }
}
