import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { showGlobalToast } from '@/utils/globalToast'
import {
  collectManagedLocalImagePathsFromGoodsItem,
  deleteManagedLocalImages,
  extractManagedLocalImagePath
} from '@/utils/image/localImage'
import { forgetImageEditsBySourcePaths } from '@/utils/image/imageEdit'
import { normalizeCharacterName, usePresetsStore } from '@/stores/presets'
import { buildCharacterRowId } from '@/utils/presets/characterId'
import { formatDate } from '@/utils/format'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { runWithRouteTransition, setPendingDetailReturnPath } from '@/utils/routeTransition'
import { syncFieldValue, syncFieldValueNextFrame } from '@/utils/sync/fieldValue'
import { validateName as validateTextName, validatePrice as validateNumericPrice } from '@/utils/validate'
import { useTabletViewport } from '@/composables/viewport/useTabletViewport'
import { prepareGoodsHeroBack } from '@/utils/platform/nativeGoodsHeroTransition'
import { alignSaleTimelineDates, computeEditedTimeline, buildAcquisitionTimelineEntries } from '@/utils/goods/statusTimeline'
import { nextGoodsId } from '@/utils/goods/id'
import {
  SALE_REMINDER_DEFAULT_OFFSETS,
  allowsCollectSaleReminder,
  ensureSaleReminderPermission,
  normalizeSaleAt,
  normalizeSaleReminderOffsets
} from '@/utils/goods/saleReminder'
import {
  getSingleDraft,
  saveSingleDraft,
  clearSingleDraft,
  bindSingleDraftSlot,
  unbindSingleDraftSlot,
  singleDraftRemoteRevision
} from '@/composables/batch/useBatchQueue'

const ADD_MOTION_REQUEST_KEY = 'goods-app:add-motion-request-v1'

const NO_IP_OPTION = '__NO_IP__'

// 按需求值：应用常驻后台跨天后，模块级常量会停留在冷启动那天
function getToday() {
  return formatDate(new Date(), 'YYYY-MM-DD')
}

// 本次编辑会话内新复制、尚未随商品保存的本地图片路径。
// 由 GoodsImageManager 在生成新文件时登记；未保存就离开编辑页时清理，避免孤儿文件。
const sessionNewLocalImagePaths = new Set()

export function trackEditorSessionLocalImage(localPath) {
  const path = extractManagedLocalImagePath(localPath)
  if (path) sessionNewLocalImagePaths.add(path)
}

export function useGoodsEditorForm(options = {}) {
  const mode = options.mode === 'edit' ? 'edit' : 'add'
  const editId = options.editId ?? ''
  const initialIsWishlist = Boolean(options.initialIsWishlist)
  const getMotionSourceEl = typeof options.getMotionSourceEl === 'function' ? options.getMotionSourceEl : null
  const beforeNavigateAway = typeof options.beforeNavigateAway === 'function' ? options.beforeNavigateAway : null
  // 单个新增草稿槽位（'collection' | 'wishlist'）：add 模式下与批量队列草稿共用同一行。
  // 空串 = 不落草稿（编辑态）。resumeDraft=false 表示本次进入要「重新开始」，忽略旧草稿。
  const draftSlot = typeof options.draftSlot === 'string' ? options.draftSlot : ''
  const resumeDraft = options.resumeDraft !== false

  const { t } = useI18n()
  const router = useRouter()
  const store = useGoodsStore()
  const presets = usePresetsStore()

  const form = reactive({
    name: '',
    variant: '',
    size: '',
    category: '',
    ip: '',
    goodsId: '',
    isWishlist: false,
    characters: [],
    tags: [],
    storageLocation: '',
    price: '',
    actualPrice: '',
    points: '',
    acquiredAt: '',
    saleAt: '',
    saleReminderEnabled: false,
    saleReminderOffsets: [...SALE_REMINDER_DEFAULT_OFFSETS],
    images: [],
    tracks: [],
    note: '',
    quantity: 1,
    unitAcquiredAtList: [],
    unitActualPriceList: [],
    unitCharacterList: [],
    unitCollectStatusList: [],
    currency: 'CNY',
    actualPriceCurrency: 'CNY',
    collectStatus: '已拥有',
    shippingFee: '',
    shippingEvents: [],
    sellPrice: '',
    sellPlatform: '',
    sellFee: '',
    sellDate: '',
    unitSaleInfoList: [],
    statusTimeline: [],
    // 自定义字段值 { <defId>: string }；定义列表来自 presets.customFieldDefs
    customFields: {}
  })

  const formBaseline = ref('')
  const formBaselineReady = ref(false)

  function serializeGoodsFormSnapshot() {
    return JSON.stringify({
      name: form.name,
      variant: form.variant,
      size: form.size,
      category: form.category,
      ip: form.ip,
      goodsId: form.goodsId,
      isWishlist: form.isWishlist,
      characters: form.characters,
      tags: form.tags,
      storageLocation: form.storageLocation,
      price: form.price,
      actualPrice: form.actualPrice,
      points: form.points,
      acquiredAt: form.acquiredAt,
      saleAt: form.saleAt,
      saleReminderEnabled: form.saleReminderEnabled,
      saleReminderOffsets: form.saleReminderOffsets,
      images: form.images,
      tracks: form.tracks,
      note: form.note,
      quantity: form.quantity,
      unitAcquiredAtList: form.unitAcquiredAtList,
      unitActualPriceList: form.unitActualPriceList,
      unitCharacterList: form.unitCharacterList,
      unitCollectStatusList: form.unitCollectStatusList,
      currency: form.currency,
      actualPriceCurrency: form.actualPriceCurrency,
      collectStatus: form.collectStatus,
      shippingFee: form.shippingFee,
      shippingEvents: form.shippingEvents,
      sellPrice: form.sellPrice,
      sellPlatform: form.sellPlatform,
      sellFee: form.sellFee,
      sellDate: form.sellDate,
      unitSaleInfoList: form.unitSaleInfoList,
      statusTimeline: form.statusTimeline,
      // 漏加会破坏「未保存改动」基线与自动保存判定
      customFields: form.customFields
    })
  }

  function captureGoodsFormBaseline() {
    formBaseline.value = serializeGoodsFormSnapshot()
    formBaselineReady.value = true
  }

  const hasUnsavedChanges = computed(() => {
    if (!formBaselineReady.value) return false
    return serializeGoodsFormSnapshot() !== formBaseline.value
  })

  // ── 单个新增草稿（add 模式；与批量队列草稿共用同一 batch_drafts 行）──
  const draftEnabled = mode === 'add' && !!draftSlot
  // 空白基线：判断表单是否仍是「初始空白」。为空则不落草稿，并把同槽旧草稿清掉。
  const blankFormSnapshot = ref('')
  // 本机最近一次写入/读取草稿的 updatedAt，用于比对远端是否真的有更新
  const draftPersistedAt = ref(0)
  let draftPersistTimer = null
  // 草稿写入串行化：防抖落库与「保存成功后清草稿」竞争时，保证清草稿永远排在最后
  let draftWriteChain = Promise.resolve()
  // 已提交为商品：停止一切草稿写入（含卸载时的 flush），避免把已清的草稿又写回来
  let draftSuppressed = false

  function enqueueDraftWrite(task) {
    draftWriteChain = draftWriteChain.then(task).catch((e) => {
      console.warn('[useGoodsEditorForm] draft write failed', e)
    })
    return draftWriteChain
  }

  /**
   * 把草稿里的表单快照恢复到表单上；字段名与 serializeGoodsFormSnapshot 一一对应。
   * 恢复后同步派生 UI 状态（展开的价格/逐件输入等），与编辑态载入保持一致。
   */
  function applyDraftSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const clone = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value)
    const keys = [
      'name', 'variant', 'size', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags',
      'storageLocation', 'price', 'actualPrice', 'points', 'acquiredAt', 'saleAt',
      'saleReminderEnabled', 'saleReminderOffsets', 'images', 'tracks', 'note', 'quantity',
      'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList',
      'currency', 'actualPriceCurrency', 'collectStatus', 'shippingFee', 'shippingEvents',
      'sellPrice', 'sellPlatform', 'sellFee', 'sellDate', 'unitSaleInfoList', 'statusTimeline',
      'customFields'
    ]
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) form[key] = clone(snapshot[key])
    }

    // 草稿里存过 acquiredAt（可能被用户改过）→ 挡住 isWishlist watcher 的「今天就清空」逻辑
    hasCustomAcquiredAt.value = true
    form.saleReminderOffsets = normalizeSaleReminderOffsets(form.saleReminderOffsets)
    form.customFields = form.customFields && typeof form.customFields === 'object' && !Array.isArray(form.customFields)
      ? { ...form.customFields }
      : {}
    showPointsInput.value = !!String(form.points || '').trim()
    showActualPriceInput.value = hasActualPriceValue(form.actualPrice)
    showUnitAcquiredAtInput.value = form.unitAcquiredAtList.some((value) => !!String(value || '').trim())
    showUnitActualPriceInput.value = form.unitActualPriceList.some((value) => !!String(value || '').trim())
    showUnitCharacterInput.value = form.unitCharacterList.some((value) => !!String(value || '').trim())
    showUnitCollectStatusInput.value = form.unitCollectStatusList.some((value) => !!String(value || '').trim())
    showShippingEvents.value = form.shippingEvents.length > 0
    syncUnitAcquiredAtListLength()
    syncUnitActualPriceListLength()
    syncUnitCharacterListLength()
    syncUnitCollectStatusListLength()
    datePickerValue.value = toDatePickerValue(form.acquiredAt)
  }

  /** 立即把当前表单写入草稿（空白表单 → 清掉草稿，不删图片文件） */
  function persistDraftNow() {
    if (!draftEnabled || draftSuppressed || !formBaselineReady.value) return draftWriteChain
    if (draftPersistTimer) {
      clearTimeout(draftPersistTimer)
      draftPersistTimer = null
    }
    const snapshot = serializeGoodsFormSnapshot()
    const wishlist = form.isWishlist
    return enqueueDraftWrite(async () => {
      if (snapshot === blankFormSnapshot.value) {
        // 表单已回到初始空白：清草稿行（图片由后续正常清理逻辑处理）
        draftPersistedAt.value = 0
        await clearSingleDraft(draftSlot)
        return
      }
      draftPersistedAt.value = await saveSingleDraft(draftSlot, JSON.parse(snapshot), wishlist)
    })
  }

  /** 保存为商品成功：清掉草稿（不删图片：已归商品所有） */
  function clearDraftAfterSubmit() {
    if (!draftEnabled) return
    draftSuppressed = true
    if (draftPersistTimer) {
      clearTimeout(draftPersistTimer)
      draftPersistTimer = null
    }
    void enqueueDraftWrite(() => clearSingleDraft(draftSlot))
  }

  /** 防抖落草稿：编辑中频繁输入只写最后一次 */
  function scheduleDraftPersist() {
    if (!draftEnabled || !formBaselineReady.value) return
    if (draftPersistTimer) clearTimeout(draftPersistTimer)
    draftPersistTimer = setTimeout(() => { void persistDraftNow() }, 400)
  }

  watch(serializeGoodsFormSnapshot, () => {
    if (formBaselineReady.value) scheduleDraftPersist()
  })

  // 远端 pull 合并命中本槽的单个草稿 → 若本地没有未保存编辑，重读对齐
  watch(singleDraftRemoteRevision, async () => {
    if (!draftEnabled) return
    try {
      const remote = await getSingleDraft(draftSlot)
      if (!remote || remote.updatedAt === draftPersistedAt.value) return
      if (hasUnsavedChanges.value) return
      applyDraftSnapshot(remote.form)
      draftPersistedAt.value = remote.updatedAt
      nextTick(() => captureGoodsFormBaseline())
    } catch (e) {
      console.warn('[useGoodsEditorForm] refresh single draft failed', e)
    }
  })

  onBeforeRouteLeave(() => {
    if (draftEnabled) void persistDraftNow()
    return true
  })

  const showPointsInput = ref(false)
  const showActualPriceInput = ref(false)
  const showUnitAcquiredAtInput = ref(false)
  const showUnitActualPriceInput = ref(false)
  const showUnitCharacterInput = ref(false)
  const showUnitCollectStatusInput = ref(false)
  const showShippingEvents = ref(false)
  const quickCreateTarget = ref('')
  const quickCategoryName = ref('')
  const quickIpName = ref('')
  const quickCharacterName = ref('')
  const quickCharacterIp = ref(NO_IP_OPTION)
  const nameError = ref('')
  const priceError = ref('')

  const charactersFieldRef = ref(null)
  const nameInputRef = ref(null)
  const priceInputRef = ref(null)
  const noteInputRef = ref(null)
  const showDatePicker = ref(false)
  const showUnitDatePicker = ref(false)
  const showSaleDateTimePicker = ref(false)
  const showCustomFieldDatePicker = ref(false)
  const customFieldDatePickerValue = ref([])
  // 正在编辑的 date 型自定义字段 id（AppDatePicker 是共享的，一次只服务一个字段）
  const activeCustomFieldDateId = ref('')
  const showCharPicker = ref(false)
  const datePickerValue = ref(toDatePickerValue(form.acquiredAt))
  const unitDatePickerValue = ref(toDatePickerValue(form.acquiredAt))
  const activeUnitDateIndex = ref(-1)
  const minDate = new Date(2000, 0, 1)
  const maxDate = new Date(2100, 11, 31)
  const hasCustomAcquiredAt = ref(false)
  const originalIsWishlist = ref(null)
  const originalCollectStatus = ref(null)
  const originalUnitCollectStatusList = ref(null)
  const originalAcquiredAt = ref(null)
  const originalUnitAcquiredAtList = ref(null)
  const originalTimeline = ref(null)
  const { isTabletViewport, updateViewport } = useTabletViewport()

  const availableCharacters = computed(() => {
    if (!form.ip) return []
    // 收藏 key 是 (ip,name) 复合 id：同名角色可分属不同 IP
    const favoriteSet = presets.favoriteCharacterSet
    const favKey = (character) => buildCharacterRowId(character.ip, character.name)
    return presets.characters
      .filter((character) => character.ip === form.ip)
      .sort((a, b) => Number(favoriteSet.has(favKey(b))) - Number(favoriteSet.has(favKey(a))))
  })
  /** 收藏判定按 (ip,name) 复合 id；模板里用 */
  function isFavoriteCharacter(ip, name) {
    const key = buildCharacterRowId(ip, name)
    return Boolean(key) && presets.favoriteCharacterSet.has(key)
  }

  const selectedCharacterOptions = computed(() => (
    form.characters.map((character) => ({
      label: character,
      value: character
    }))
  ))
  const storageLocationOptions = computed(() => store.storageLocations)
  const quickCharacterIpOptions = computed(() => {
    if (form.ip) {
      return [{ label: form.ip, value: form.ip }]
    }

    return [
      { label: t('goods.editor.characterIpNone'), value: NO_IP_OPTION },
      ...presets.ips.map((ip) => ({ label: ip, value: ip }))
    ]
  })

  const characterPlaceholder = computed(() => {
    if (!form.ip) return t('goods.editor.characterPlaceholderNoIp')
    if (availableCharacters.value.length === 0) return t('goods.editor.noCharacterPresets')
    return t('goods.editor.characterPlaceholder')
  })
  // 新建/编辑均直接读取当前图片条目的 uri 字段，与图片管理器缩略图、快速编辑弹窗保持一致，
  // 避免经 getPrimaryGoodsImageUrl 重新规范化后取到非当前主图条目。
  const primaryPreviewImage = computed(() => {
    const images = Array.isArray(form.images) ? form.images : []
    const primary = images.find((image) => image && image.isPrimary) || images[0]
    return primary?.uri ? String(primary.uri).trim() : ''
  })
  const quantityNumber = computed(() => Math.max(1, Number(form.quantity) || 1))
  const hasUnitAcquiredAtValue = computed(() => form.unitAcquiredAtList.some((value) => !!String(value || '').trim()))
  const hasUnitActualPriceValue = computed(() => form.unitActualPriceList.some((value) => !!String(value || '').trim()))
  const hasUnitCharacterValue = computed(() => form.unitCharacterList.some((value) => !!String(value || '').trim()))
  const hasUnitCollectStatusValue = computed(() => form.unitCollectStatusList.some((value) => !!String(value || '').trim()))
  const disableActualPriceInput = computed(() => !form.isWishlist && quantityNumber.value >= 2 && showUnitActualPriceInput.value)
  const disableCollectStatusInput = computed(() => !form.isWishlist && quantityNumber.value >= 2 && showUnitCollectStatusInput.value)
  const datePickerPopupPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))

  watch(
    () => form.name,
    (value) => {
      if (String(value || '').trim()) {
        nameError.value = ''
      }
    }
  )

  watch(
    () => form.price,
    (value) => {
      if (validateNumericPrice(value).valid) {
        priceError.value = ''
      }
    }
  )

  watch(
    () => form.characters.join('\u0000'),
    () => {
      syncUnitCharacterListLength()
    }
  )

  watch(
    () => form.collectStatus,
    () => {
      syncUnitCollectStatusListLength()
    }
  )

  watch(
    () => form.ip,
    (ip) => {
      form.characters = form.characters.filter((name) =>
        presets.characters.some((character) => character.name === name && character.ip === ip)
      )
      showCharPicker.value = false
      if (!quickCreateTarget.value || quickCreateTarget.value !== 'character') return
      quickCharacterIp.value = ip || NO_IP_OPTION
    }
  )

  watch(
    () => form.isWishlist,
    (isWishlist) => {
      if (isWishlist) {
        if (mode === 'add' && (!hasCustomAcquiredAt.value || form.acquiredAt === getToday())) {
          form.acquiredAt = ''
        }
        showPointsInput.value = false
        showActualPriceInput.value = false
        showUnitAcquiredAtInput.value = false
        showUnitActualPriceInput.value = false
        showUnitCharacterInput.value = false
        showUnitCollectStatusInput.value = false
        form.actualPrice = ''
        form.points = ''
        form.unitAcquiredAtList = []
        form.unitActualPriceList = []
        form.unitCharacterList = []
        form.unitCollectStatusList = []
        return
      }

      // 心愿 → 收藏：默认清空提醒；若目标状态是待补邮/待补款则保留供编辑
      if (!allowsCollectSaleReminder({ isWishlist: false, collectStatus: form.collectStatus, unitCollectStatusList: form.unitCollectStatusList })) {
        form.saleReminderEnabled = false
        form.saleAt = ''
        form.saleReminderOffsets = []
      }

      if (!form.acquiredAt && !hasCustomAcquiredAt.value) {
        form.acquiredAt = getToday()
      }

      syncUnitCharacterListLength()
    }
  )

  // 收藏品状态切出待补邮/待补款 → 清空补邮/补款提醒（心愿单开售提醒不受影响）
  watch(
    () => [form.isWishlist, form.collectStatus, form.unitCollectStatusList?.join?.('|') || ''],
    () => {
      if (form.isWishlist) return
      if (allowsCollectSaleReminder({ isWishlist: false, collectStatus: form.collectStatus, unitCollectStatusList: form.unitCollectStatusList })) return
      form.saleReminderEnabled = false
      form.saleAt = ''
      form.saleReminderOffsets = []
    }
  )

  watch(
    quantityNumber,
    () => {
      syncUnitAcquiredAtListLength()
      syncUnitActualPriceListLength()
      syncUnitCharacterListLength()
    },
    { immediate: true }
  )

  onMounted(async () => {
    if (mode === 'add') {
      form.isWishlist = initialIsWishlist
      if (!form.isWishlist) {
        form.acquiredAt = getToday()
      }
    }

    if (mode === 'edit') {
      const item = store.getById(editId)
      if (item) {
        originalIsWishlist.value = Boolean(item.isWishlist)
        originalCollectStatus.value = item.collectStatus || '已拥有'
        originalUnitCollectStatusList.value = Array.isArray(item.unitCollectStatusList) ? [...item.unitCollectStatusList] : []
        originalAcquiredAt.value = item.acquiredAt ?? ''
        originalUnitAcquiredAtList.value = Array.isArray(item.unitAcquiredAtList) ? [...item.unitAcquiredAtList] : []
        originalTimeline.value = Array.isArray(item.statusTimeline) ? [...item.statusTimeline] : []
        form.name = item.name ?? ''
        form.variant = item.variant ?? ''
        form.size = item.size ?? ''
        form.category = item.category ?? ''
        form.ip = item.ip ?? ''
        form.goodsId = item.goodsId ?? ''
        form.isWishlist = Boolean(item.isWishlist)
        form.characters = item.characters ? [...item.characters] : []
        form.tags = item.tags ? [...item.tags] : []
        form.storageLocation = item.storageLocation ?? ''
        form.price = item.price ?? ''
        form.actualPrice = item.actualPrice ?? ''
        form.currency = item.currency || 'CNY'
        form.actualPriceCurrency = item.actualPriceCurrency || 'CNY'
        form.collectStatus = item.collectStatus || '已拥有'
        form.shippingFee = item.shippingFee ?? ''
        form.shippingEvents = Array.isArray(item.shippingEvents)
          ? item.shippingEvents.map((e) => ({ ...e }))
          : []
        form.statusTimeline = Array.isArray(item.statusTimeline) ? [...item.statusTimeline] : []
        form.points = item.points ?? ''
        showPointsInput.value = !!item.points
        showActualPriceInput.value = hasActualPriceValue(item.actualPrice)
        form.acquiredAt = item.acquiredAt ?? ''
        form.saleAt = item.saleAt ?? ''
        form.saleReminderEnabled = Boolean(item.saleReminderEnabled)
        form.saleReminderOffsets = normalizeSaleReminderOffsets(item.saleReminderOffsets)
        if (form.saleReminderEnabled && form.saleReminderOffsets.length === 0) {
          form.saleReminderOffsets = [...SALE_REMINDER_DEFAULT_OFFSETS]
        }
        form.images = item.images ? [...item.images] : []
        form.tracks = Array.isArray(item.tracks) ? [...item.tracks] : []
        form.note = item.note ?? ''
        form.quantity = Number(item.quantity) || 1
        form.unitAcquiredAtList = Array.isArray(item.unitAcquiredAtList) ? [...item.unitAcquiredAtList] : []
        form.unitActualPriceList = Array.isArray(item.unitActualPriceList) ? [...item.unitActualPriceList] : []
        form.unitCharacterList = Array.isArray(item.unitCharacterList) ? [...item.unitCharacterList] : []
        form.unitCollectStatusList = Array.isArray(item.unitCollectStatusList) ? [...item.unitCollectStatusList] : []
        form.sellPrice = item.sellPrice ?? ''
        form.sellPlatform = item.sellPlatform ?? ''
        form.sellFee = item.sellFee ?? ''
        form.sellDate = item.sellDate ?? ''
        form.unitSaleInfoList = Array.isArray(item.unitSaleInfoList) ? item.unitSaleInfoList.map((v) => (v ? { ...v } : null)) : []
        form.customFields = item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
          ? { ...item.customFields }
          : {}
        showUnitAcquiredAtInput.value = form.unitAcquiredAtList.some((value) => !!String(value || '').trim())
        showUnitActualPriceInput.value = form.unitActualPriceList.some((value) => !!String(value || '').trim())
        showUnitCharacterInput.value = form.unitCharacterList.some((value) => !!String(value || '').trim())
        showUnitCollectStatusInput.value = form.unitCollectStatusList.some((value) => !!String(value || '').trim())
        showShippingEvents.value = form.shippingEvents.length > 0
        syncUnitAcquiredAtListLength()
        syncUnitActualPriceListLength()
        syncUnitCharacterListLength()
        syncUnitCollectStatusListLength()
        datePickerValue.value = toDatePickerValue(form.acquiredAt)
      }
    }

    syncUnitAcquiredAtListLength()
    syncUnitActualPriceListLength()
    syncUnitCharacterListLength()
    syncUnitCollectStatusListLength()
    if (draftEnabled) {
      // 先等挂载后的默认态归一化跑完（收藏态会清空补款提醒、按数量补齐逐件列表等，
      // 这些 watcher 在 mounted 之后才 flush），再固定「空白基线」。
      // 否则归一化前的默认值会被当成用户填写，导致什么都没填退出也落一份草稿。
      await nextTick()
      blankFormSnapshot.value = serializeGoodsFormSnapshot()
      if (resumeDraft) {
        const draft = await getSingleDraft(draftSlot)
        if (draft) {
          applyDraftSnapshot(draft.form)
          draftPersistedAt.value = draft.updatedAt
        }
      }
      bindSingleDraftSlot(draftSlot)
    }
    updateViewport()
    // 系统同步逐份列表完成后再打基线，避免「打开即脏」
    nextTick(() => {
      captureGoodsFormBaseline()
    })
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
  })

  onBeforeUnmount(() => {
    // 离开编辑页即把当前表单落草稿（fire-and-forget：DB 写入会在组件卸载后继续完成）
    if (draftEnabled) void persistDraftNow()
    document.removeEventListener('mousedown', handleClickOutside)
    document.removeEventListener('touchstart', handleClickOutside)
    cleanupSessionLocalImages()
    if (draftEnabled) unbindSingleDraftSlot(draftSlot)
  })

  // 未保存就离开编辑页：清理本次会话新复制的本地图片，防止孤儿文件。
  // 宁可少删不可误删——凡是仍被任何已保存商品（含回收站）引用的路径一律跳过。
  function cleanupSessionLocalImages() {
    if (sessionNewLocalImagePaths.size === 0) return
    const candidates = [...sessionNewLocalImagePaths]
    sessionNewLocalImagePaths.clear()

    const referenced = new Set()
    for (const item of [...store.list, ...store.trashList]) {
      for (const path of collectManagedLocalImagePathsFromGoodsItem(item)) {
        referenced.add(path)
      }
    }
    // add 模式的当前表单已（或即将）作为草稿落库，其中的本地图片不能当孤儿删
    if (draftEnabled) {
      for (const path of collectManagedLocalImagePathsFromGoodsItem({ images: form.images })) {
        referenced.add(path)
      }
    }

    const orphans = candidates.filter((path) => !referenced.has(path))
    if (orphans.length > 0) {
      void deleteManagedLocalImages(orphans)
      // 底图也是本会话新建的孤儿文件：文件删了，对应的配方行也不能留
      void forgetImageEditsBySourcePaths(orphans)
    }
  }

  function getSubmitOriginRect(event) {
    const target = event?.submitter || event?.currentTarget || event?.target
    if (!target?.getBoundingClientRect) return null

    const rect = target.getBoundingClientRect()
    if (!rect.width || !rect.height) return null

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }
  }

  function writeAddMotionRequest(itemId, event) {
    const originRect = getSubmitOriginRect(event)
    if (!itemId) return

    try {
      sessionStorage.setItem(ADD_MOTION_REQUEST_KEY, JSON.stringify({
        token: Date.now(),
        id: String(itemId),
        originRect
      }))
    } catch {
      // ignore
    }
  }

  async function handleSubmit(event) {
    await commitActiveInput()
    syncDomFields()
    form.name = String(form.name || '').trim()
    if (!validateName()) return

    const priceResult = validateNumericPrice(form.price)
    if (!priceResult.valid) {
      priceError.value = priceResult.message
      priceInputRef.value?.focus?.()
      priceInputRef.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      return
    }
    priceError.value = ''

    const keepsCollectReminder = allowsCollectSaleReminder({
      isWishlist: false,
      collectStatus: form.collectStatus,
      unitCollectStatusList: form.unitCollectStatusList
    })
    if (!form.isWishlist && !keepsCollectReminder) {
      form.saleAt = ''
      form.saleReminderEnabled = false
      form.saleReminderOffsets = []
    } else if (form.isWishlist || keepsCollectReminder) {
      form.saleAt = normalizeSaleAt(form.saleAt)
      form.saleReminderOffsets = normalizeSaleReminderOffsets(form.saleReminderOffsets)
      if (form.saleReminderEnabled && form.saleReminderOffsets.length === 0) {
        form.saleReminderOffsets = [...SALE_REMINDER_DEFAULT_OFFSETS]
      }
      if (form.saleReminderEnabled) {
        await ensureSaleReminderPermission({ request: true, exact: true }).catch(() => null)
      }
    }

    if (mode === 'edit') {
      // 时间线自动维护统一走 computeEditedTimeline。
      // diff 两侧必须按 quantity 填充对齐——表单加载时会把逐件列表"填满"、
      // 落库归一化又会"剥空"(qty<2 → []、全已拥有 → []),直接对比会产生假差异
      const qty = quantityNumber.value
      const padUnitDates = (list, fallbackDate) =>
        Array.from({ length: qty }, (_, i) => normalizeUnitDateValue(list?.[i]) || fallbackDate)
      const padUnitStatuses = (list, fallbackStatus) =>
        Array.from({ length: qty }, (_, i) => normalizeUnitCollectStatusValue(list?.[i]) || fallbackStatus)

      const oldStatus = originalCollectStatus.value || '已拥有'
      const newStatus = form.collectStatus || '已拥有'
      const oldStatusFallback = normalizeUnitCollectStatusValue(oldStatus) || '已拥有'
      const newStatusFallback = normalizeUnitCollectStatusValue(newStatus) || '已拥有'

      form.statusTimeline = computeEditedTimeline({
        formTimeline: form.statusTimeline,
        originalTimeline: originalTimeline.value || [],
        quantity: qty,
        oldStatus,
        newStatus,
        oldAcquiredAt: originalAcquiredAt.value || '',
        newAcquiredAt: form.acquiredAt || '',
        oldUnitDates: qty >= 2 ? padUnitDates(originalUnitAcquiredAtList.value, normalizeUnitDateValue(originalAcquiredAt.value)) : [],
        newUnitDates: qty >= 2 ? padUnitDates(form.unitAcquiredAtList, normalizeUnitDateValue(form.acquiredAt)) : [],
        oldUnitStatuses: qty >= 2 ? padUnitStatuses(originalUnitCollectStatusList.value, oldStatusFallback) : [],
        newUnitStatuses: qty >= 2 ? padUnitStatuses(form.unitCollectStatusList, newStatusFallback) : [],
        isWishlistToCollection: originalIsWishlist.value === true && form.isWishlist === false
      })

      // 出谷日期变更 → 时间线上对应状态条目的日期跟随对齐
      form.statusTimeline = alignSaleTimelineDates(form.statusTimeline, {
        collectStatus: form.collectStatus,
        sellDate: form.sellDate,
        unitStatuses: qty >= 2 ? padUnitStatuses(form.unitCollectStatusList, newStatusFallback) : [],
        unitSaleInfoList: form.unitSaleInfoList
      })

      const updatedId = await store.updateGoods(editId, { ...form })
      if (!updatedId) {
        showGlobalToast(t('goods.editor.saveFailedMissing'))
        // Should we always go to home or back?
        // But fade is requested.
        beforeNavigateAway?.()
        runWithRouteTransition(() => router.replace('/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
        return
      }
      // 保存成功：会话内新图片已随商品落库，移出待清理集合
      sessionNewLocalImagePaths.clear()

      prepareGoodsHeroBack({
        goodsId: editId,
        sourceEl: getMotionSourceEl?.(),
        targetPath: `/detail/${editId}`
      })

      if (originalIsWishlist.value != null && originalIsWishlist.value !== form.isWishlist) {
        setPendingDetailReturnPath(form.isWishlist ? '/wishlist' : '/home')
      }
    } else {
      // 新增时记录初始状态到时间线;用户已在时间线 Tab 手动添加过条目则完全尊重,不覆写
      const initialStatus = form.isWishlist ? '' : (form.collectStatus || '已拥有')
      const timelineEditedByUser = Array.isArray(form.statusTimeline) && form.statusTimeline.length > 0
      if (initialStatus && !timelineEditedByUser) {
        const fallbackDate = form.acquiredAt || getToday()
        if (quantityNumber.value >= 2) {
          // 多份:同一天下单的件归为一条多件条目(如第 1-11 件 / 第 12-14 件);
          // 有逐份状态也一样先记购入史,卖出/挂牌由随后的 alignSaleTimelineDates 补
          form.statusTimeline = buildAcquisitionTimelineEntries({
            status: initialStatus,
            unitDates: Array.isArray(form.unitAcquiredAtList) ? form.unitAcquiredAtList : [],
            fallbackDate
          })
        } else {
          form.statusTimeline = [{ status: initialStatus, at: fallbackDate }]
        }
      }
      // 新增即出谷的场景:出谷日期对齐时间线条目
      form.statusTimeline = alignSaleTimelineDates(form.statusTimeline, {
        collectStatus: form.collectStatus,
        sellDate: form.sellDate,
        unitStatuses: Array.isArray(form.unitCollectStatusList) ? form.unitCollectStatusList : [],
        unitSaleInfoList: form.unitSaleInfoList
      })

      const motionId = nextGoodsId()
      const addPromise = store.addGoods({ ...form, id: motionId })
      // 保存已发起：会话内新图片归商品所有，移出待清理集合
      sessionNewLocalImagePaths.clear()
      // 保存成功：草稿使命结束（不删图片，图片已随商品落库）
      clearDraftAfterSubmit()
      writeAddMotionRequest(motionId, event)
      beforeNavigateAway?.()
      runWithRouteTransition(() => router.back(), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
      // 先播动画后落库：DB 写入失败时回滚内存条目并提示，避免"看似成功、重启后消失"
      void addPromise.catch(() => {
        store.list = store.list.filter((item) => item.id !== motionId)
        showGlobalToast(t('goods.editor.addFailed'))
      })
      return
    }

    beforeNavigateAway?.()
    runWithRouteTransition(() => router.back(), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
  }

  function validateName() {
    const result = validateTextName(form.name, { label: t('common.name') })
    if (result.valid) {
      nameError.value = ''
      return true
    }

    nameError.value = result.message
    nameInputRef.value?.focus?.()
    nameInputRef.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    return false
  }

  function toggleCharPicker() {
    if (!form.ip) return
    showCharPicker.value = !showCharPicker.value
  }

  function closeQuickCreate() {
    quickCreateTarget.value = ''
    quickCategoryName.value = ''
    quickIpName.value = ''
    quickCharacterName.value = ''
    quickCharacterIp.value = form.ip || NO_IP_OPTION
  }

  function toggleQuickCreate(type) {
    if (quickCreateTarget.value === type) {
      closeQuickCreate()
      return
    }

    quickCreateTarget.value = type
    quickCategoryName.value = ''
    quickIpName.value = ''
    quickCharacterName.value = ''
    quickCharacterIp.value = form.ip || NO_IP_OPTION
  }

  async function submitQuickCategory() {
    await commitActiveInput()
    const name = String(quickCategoryName.value || '').trim()
    if (!name) return
    await presets.addCategory(name)
    form.category = name
    closeQuickCreate()
  }

  async function submitQuickIp() {
    await commitActiveInput()
    const name = String(quickIpName.value || '').trim()
    if (!name) return
    await presets.addIp(name)
    form.ip = name
    closeQuickCreate()
  }

  async function submitQuickCharacter() {
    await commitActiveInput()
    const name = normalizeCharacterName(quickCharacterName.value)
    if (!name) return

    const targetIp = form.ip || (quickCharacterIp.value === NO_IP_OPTION ? '' : quickCharacterIp.value)
    await presets.addCharacter(name, targetIp)

    if (!form.ip && targetIp) {
      form.ip = targetIp
    }

    if (!form.characters.includes(name)) {
      form.characters.push(name)
    }

    closeQuickCreate()
  }

  function toggleChar(name) {
    const index = form.characters.indexOf(name)
    if (index === -1) {
      form.characters.push(name)
    } else {
      form.characters.splice(index, 1)
    }
  }

  function setWishlist(nextValue) {
    form.isWishlist = nextValue
    if (nextValue && form.saleReminderOffsets.length === 0) {
      form.saleReminderOffsets = [...SALE_REMINDER_DEFAULT_OFFSETS]
    }
  }

  function setSaleReminderEnabled(nextValue) {
    form.saleReminderEnabled = Boolean(nextValue)
    if (form.saleReminderEnabled && form.saleReminderOffsets.length === 0) {
      form.saleReminderOffsets = [...SALE_REMINDER_DEFAULT_OFFSETS]
    }
  }

  function toggleSaleReminderOffset(offsetMinutes) {
    const offset = Number(offsetMinutes)
    if (!Number.isInteger(offset) || offset < 0) return
    const current = new Set(normalizeSaleReminderOffsets(form.saleReminderOffsets))
    if (current.has(offset)) current.delete(offset)
    else current.add(offset)
    form.saleReminderOffsets = [...current].sort((a, b) => b - a)
  }

  function addSaleReminderOffset(offsetMinutes) {
    const offset = Number(offsetMinutes)
    if (!Number.isInteger(offset) || offset < 0) return false
    const current = new Set(normalizeSaleReminderOffsets(form.saleReminderOffsets))
    current.add(offset)
    form.saleReminderOffsets = [...current].sort((a, b) => b - a)
    return true
  }

  function removeSaleReminderOffset(offsetMinutes) {
    const offset = Number(offsetMinutes)
    const current = normalizeSaleReminderOffsets(form.saleReminderOffsets).filter((value) => value !== offset)
    form.saleReminderOffsets = current
  }

  function hasActualPriceValue(value) {
    return value !== '' && value != null
  }

  function normalizeUnitDateValue(value) {
    const normalized = String(value || '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
  }

  function normalizeUnitDateAt(index) {
    if (index < 0 || index >= form.unitAcquiredAtList.length) return
    form.unitAcquiredAtList[index] = normalizeUnitDateValue(form.unitAcquiredAtList[index])
  }

  function clearUnitAcquiredAtList() {
    form.unitAcquiredAtList = []
    showUnitAcquiredAtInput.value = false
  }

  function normalizeUnitPriceValue(value) {
    if (value === '' || value == null) return ''
    const numeric = Number.parseFloat(String(value).trim())
    if (!validateNumericPrice(numeric).valid) return ''
    return `${Math.round(numeric * 100) / 100}`
  }

  function normalizeUnitPriceAt(index) {
    if (index < 0 || index >= form.unitActualPriceList.length) return
    form.unitActualPriceList[index] = normalizeUnitPriceValue(form.unitActualPriceList[index])
  }

  function clearUnitActualPriceList() {
    form.unitActualPriceList = []
    showUnitActualPriceInput.value = false
  }

  function normalizeUnitCharacterValue(value) {
    const normalized = normalizeCharacterName(value)
    return form.characters.includes(normalized) ? normalized : ''
  }

  function clearUnitCharacterList() {
    form.unitCharacterList = []
    showUnitCharacterInput.value = false
  }

  function normalizeUnitCollectStatusValue(value) {
    const normalized = String(value || '').trim()
    return normalized
  }

  function clearUnitCollectStatusList() {
    form.unitCollectStatusList = []
    showUnitCollectStatusInput.value = false
  }

  function clearSaleReminder() {
    form.saleAt = ''
    form.saleReminderEnabled = false
    form.saleReminderOffsets = []
  }

  function openSaleDateTimePicker() {
    showSaleDateTimePicker.value = true
  }

  function onSaleDateTimeConfirm(value) {
    form.saleAt = value || ''
    showSaleDateTimePicker.value = false
  }

  function syncUnitAcquiredAtListLength() {
    const targetLength = quantityNumber.value
    const fallbackDate = normalizeUnitDateValue(form.acquiredAt)
    const current = Array.isArray(form.unitAcquiredAtList) ? [...form.unitAcquiredAtList] : []
    const next = Array.from({ length: targetLength }, (_, index) => normalizeUnitDateValue(current[index]) || fallbackDate)

    while (next.length > 0 && !next[next.length - 1]) {
      next.pop()
    }

    form.unitAcquiredAtList = next

    if (targetLength < 2) {
      showUnitAcquiredAtInput.value = false
    }
  }

  function syncUnitActualPriceListLength() {
    const targetLength = quantityNumber.value
    const fallbackPrice = normalizeUnitPriceValue(form.actualPrice)
    const current = Array.isArray(form.unitActualPriceList) ? [...form.unitActualPriceList] : []
    const next = Array.from({ length: targetLength }, (_, index) => normalizeUnitPriceValue(current[index]) || fallbackPrice)

    while (next.length > 0 && !next[next.length - 1]) {
      next.pop()
    }

    form.unitActualPriceList = next

    if (targetLength < 2) {
      showUnitActualPriceInput.value = false
    }
  }

  function syncUnitCharacterListLength() {
    const targetLength = quantityNumber.value

    if (form.isWishlist || targetLength < 2 || form.characters.length === 0) {
      form.unitCharacterList = []
      showUnitCharacterInput.value = false
      return
    }

    if (form.characters.length === targetLength) {
      const current = Array.isArray(form.unitCharacterList) ? [...form.unitCharacterList] : []
      const hasFilledUnitCharacters = current.some((value) => !!String(value || '').trim())
      if (!hasFilledUnitCharacters) {
        form.unitCharacterList = [...form.characters]
        return
      }
    }

    const fallbackCharacter = form.characters.length === 1 ? form.characters[0] : ''
    const current = Array.isArray(form.unitCharacterList) ? [...form.unitCharacterList] : []
    const next = Array.from({ length: targetLength }, (_, index) => normalizeUnitCharacterValue(current[index]) || fallbackCharacter)

    form.unitCharacterList = next

    if (targetLength < 2) {
      showUnitCharacterInput.value = false
    }
  }

  function syncUnitCollectStatusListLength() {
    const targetLength = quantityNumber.value

    if (form.isWishlist || targetLength < 2) {
      form.unitCollectStatusList = []
      showUnitCollectStatusInput.value = false
      return
    }

    const fallbackStatus = normalizeUnitCollectStatusValue(form.collectStatus) || '已拥有'
    const current = Array.isArray(form.unitCollectStatusList) ? [...form.unitCollectStatusList] : []
    const next = Array.from({ length: targetLength }, (_, index) => normalizeUnitCollectStatusValue(current[index]) || fallbackStatus)

    while (next.length > 0 && !next[next.length - 1]) {
      next.pop()
    }

    form.unitCollectStatusList = next

    if (targetLength < 2) {
      showUnitCollectStatusInput.value = false
    }
  }

  function syncAllUnitDatesFromPrimaryDate() {
    if (form.isWishlist || quantityNumber.value < 2) return

    const normalizedDate = normalizeUnitDateValue(form.acquiredAt)
    if (!normalizedDate) return

    form.unitAcquiredAtList = Array.from({ length: quantityNumber.value }, () => normalizedDate)
  }

  function syncAllUnitPricesFromActualPrice() {
    if (form.isWishlist || quantityNumber.value < 2) return

    const normalizedPrice = normalizeUnitPriceValue(form.actualPrice)
    if (!normalizedPrice) return

    form.unitActualPriceList = Array.from({ length: quantityNumber.value }, () => normalizedPrice)
  }

  function openDatePicker() {
    datePickerValue.value = toDatePickerValue(form.acquiredAt)
    showDatePicker.value = true
  }

  function openUnitDatePicker(index) {
    if (index < 0 || index >= quantityNumber.value) return
    activeUnitDateIndex.value = index
    unitDatePickerValue.value = toDatePickerValue(form.unitAcquiredAtList[index] || form.acquiredAt)
    showUnitDatePicker.value = true
  }

  const showShippingDatePicker = ref(false)
  const shippingDatePickerValue = ref([])
  const activeShippingEventIndex = ref(-1)

  function openShippingDatePicker(index) {
    const event = form.shippingEvents[index]
    const current = event?.date || form.acquiredAt
    activeShippingEventIndex.value = index
    shippingDatePickerValue.value = toDatePickerValue(current)
    showShippingDatePicker.value = true
  }

  function onShippingDateConfirm({ selectedValues }) {
    const index = activeShippingEventIndex.value
    if (index < 0 || index >= form.shippingEvents.length) {
      showShippingDatePicker.value = false
      return
    }
    const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
    form.shippingEvents[index].date = `${year}-${month}-${day}`
    shippingDatePickerValue.value = [year, month, day]
    showShippingDatePicker.value = false
  }

  /** 逐件入手日去重（保序）；无逐件日期时回退商品级购入日 */
  function getUniqueUnitDates() {
    const seen = new Set()
    const dates = []
    const push = (value) => {
      const s = normalizeUnitDateValue(value)
      if (!s || seen.has(s)) return
      seen.add(s)
      dates.push(s)
    }
    if (Array.isArray(form.unitAcquiredAtList)) {
      for (const value of form.unitAcquiredAtList) push(value)
    }
    if (dates.length === 0) push(form.acquiredAt)
    if (dates.length === 0) push(getToday())
    return dates
  }

  function addShippingEvent() {
    // 按去重后的逐份入手日自动补运费事件（已存在的日期不重复加）
    const unitDates = getUniqueUnitDates()
    const existing = new Set(
      form.shippingEvents
        .map((e) => normalizeUnitDateValue(e?.date))
        .filter(Boolean)
    )
    let added = 0
    for (const date of unitDates) {
      if (existing.has(date)) continue
      form.shippingEvents.push({ date, fee: '' })
      existing.add(date)
      added += 1
    }
    // 全部日期都已有事件时，再补一条可用日历改日期的空行
    if (added === 0) {
      form.shippingEvents.push({ date: unitDates[0] || getToday(), fee: '' })
    }
    syncShippingFeeFromEvents()
  }

  function removeShippingEvent(index) {
    if (index < 0 || index >= form.shippingEvents.length) return
    form.shippingEvents.splice(index, 1)
    syncShippingFeeFromEvents()
  }

  function normalizeShippingEventFee(index) {
    const event = form.shippingEvents[index]
    if (!event) return
    const raw = String(event.fee ?? '').trim()
    if (!raw) {
      event.fee = ''
      syncShippingFeeFromEvents()
      return
    }
    const n = Number(raw)
    event.fee = Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100) / 100) : ''
    syncShippingFeeFromEvents()
  }

  function syncShippingFeeFromEvents() {
    if (form.shippingEvents.length === 0) {
      form.shippingFee = ''
      return
    }
    const total = form.shippingEvents.reduce((sum, e) => sum + (Number(e.fee) || 0), 0)
    form.shippingFee = total > 0 ? String(Math.round(total * 100) / 100) : ''
  }

  function clearShippingEvents() {
    form.shippingEvents = []
    form.shippingFee = ''
  }

  function onDateConfirm({ selectedValues }) {
    const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
    form.acquiredAt = `${year}-${month}-${day}`
    datePickerValue.value = [year, month, day]
    syncAllUnitDatesFromPrimaryDate()
    hasCustomAcquiredAt.value = true
    showDatePicker.value = false
  }

  /** 打开某个 date 型自定义字段的日期选择器（空值/脏值默认定位到今天） */
  function openCustomFieldDatePicker(defId) {
    const current = String(form.customFields?.[defId] || '').trim()
    customFieldDatePickerValue.value = toDatePickerValue(
      /^\d{4}-\d{2}-\d{2}$/.test(current) ? current : formatDate(new Date(), 'YYYY-MM-DD')
    )
    activeCustomFieldDateId.value = defId
    showCustomFieldDatePicker.value = true
  }

  function onCustomFieldDateConfirm({ selectedValues }) {
    const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
    const defId = activeCustomFieldDateId.value
    if (defId) setCustomFieldValue(defId, `${year}-${month}-${day}`)
    customFieldDatePickerValue.value = [year, month, day]
    showCustomFieldDatePicker.value = false
    activeCustomFieldDateId.value = ''
  }

  function setCustomFieldValue(defId, value) {
    if (!defId) return
    if (!form.customFields || typeof form.customFields !== 'object' || Array.isArray(form.customFields)) {
      form.customFields = {}
    }
    const next = String(value == null ? '' : value)
    if (next) form.customFields[defId] = next
    else delete form.customFields[defId]
  }

  function clearCustomFieldValue(defId) {
    setCustomFieldValue(defId, '')
  }

  function onUnitDateConfirm({ selectedValues }) {
    const index = activeUnitDateIndex.value
    if (index < 0 || index >= quantityNumber.value) {
      showUnitDatePicker.value = false
      return
    }

    const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
    form.unitAcquiredAtList[index] = `${year}-${month}-${day}`
    unitDatePickerValue.value = [year, month, day]
    showUnitDatePicker.value = false
  }

  function toDatePickerValue(dateString) {
    const [year, month, day] = normalizeDateParts(dateString)
    return [year, month, day]
  }

  function normalizeDateParts(dateString) {
    const [fallbackYear, fallbackMonth, fallbackDay] = getToday().split('-')

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
    if (noteInputRef.value) form.note = noteInputRef.value.value ?? ''
  }

  return {
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
    showShippingDatePicker,
    showSaleDateTimePicker,
    showCustomFieldDatePicker,
    customFieldDatePickerValue,
    activeCustomFieldDateId,
    openCustomFieldDatePicker,
    onCustomFieldDateConfirm,
    setCustomFieldValue,
    clearCustomFieldValue,
    showCharPicker,
    datePickerValue,
    unitDatePickerValue,
    shippingDatePickerValue,
    activeUnitDateIndex,
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
    disableActualPriceInput,
    isTabletViewport,
    datePickerPopupPosition,
    hasUnsavedChanges,
    captureGoodsFormBaseline,
    handleSubmit,
    validateName,
    toggleCharPicker,
    closeQuickCreate,
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
    clearSaleReminder,
    openSaleDateTimePicker,
    onSaleDateTimeConfirm,
    hasActualPriceValue,
    normalizeUnitDateValue,
    normalizeUnitDateAt,
    clearUnitAcquiredAtList,
    normalizeUnitPriceValue,
    normalizeUnitPriceAt,
    clearUnitActualPriceList,
    clearUnitCharacterList,
    syncUnitAcquiredAtListLength,
    syncUnitActualPriceListLength,
    syncUnitCharacterListLength,
    showUnitCollectStatusInput,
    showShippingEvents,
    hasUnitCollectStatusValue,
    disableCollectStatusInput,
    clearUnitCollectStatusList,
    normalizeUnitCollectStatusValue,
    syncUnitCollectStatusListLength,
    syncAllUnitDatesFromPrimaryDate,
    syncAllUnitPricesFromActualPrice,
    openDatePicker,
    openUnitDatePicker,
    openShippingDatePicker,
    onDateConfirm,
    onUnitDateConfirm,
    onShippingDateConfirm,
    addShippingEvent,
    removeShippingEvent,
    normalizeShippingEventFee,
    clearShippingEvents,
    syncShippingFeeFromEvents,
    toDatePickerValue,
    normalizeDateParts,
    syncField,
    syncFieldLater
  }
}
