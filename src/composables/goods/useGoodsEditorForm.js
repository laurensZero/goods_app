import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { normalizeCharacterName, usePresetsStore } from '@/stores/presets'
import { formatDate } from '@/utils/format'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'
import { runWithRouteTransition, setPendingDetailReturnPath } from '@/utils/routeTransition'
import { syncFieldValue, syncFieldValueNextFrame } from '@/utils/sync/fieldValue'
import { validateName as validateTextName, validatePrice as validateNumericPrice } from '@/utils/validate'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { prepareGoodsHeroBack } from '@/utils/platform/nativeGoodsHeroTransition'
import { appendStatusTimelineEntry, syncUnitStatusTimeline, syncUnitAcquiredTimeline } from '@/utils/goods/statusTimeline'
import {
  SALE_REMINDER_DEFAULT_OFFSETS,
  ensureSaleReminderPermission,
  normalizeSaleAt,
  normalizeSaleReminderOffsets
} from '@/utils/saleReminder'

const ADD_MOTION_REQUEST_KEY = 'goods-app:add-motion-request-v1'

const NO_IP_OPTION = '__NO_IP__'
const today = formatDate(new Date(), 'YYYY-MM-DD')

export function useGoodsEditorForm(options = {}) {
  const mode = options.mode === 'edit' ? 'edit' : 'add'
  const editId = options.editId ?? ''
  const initialIsWishlist = Boolean(options.initialIsWishlist)
  const getMotionSourceEl = typeof options.getMotionSourceEl === 'function' ? options.getMotionSourceEl : null

  const router = useRouter()
  const store = useGoodsStore()
  const presets = usePresetsStore()

  const form = reactive({
    name: '',
    variant: '',
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
    statusTimeline: []
  })

  const showPointsInput = ref(false)
  const showActualPriceInput = ref(false)
  const showUnitAcquiredAtInput = ref(false)
  const showUnitActualPriceInput = ref(false)
  const showUnitCharacterInput = ref(false)
  const showUnitCollectStatusInput = ref(false)
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

  const availableCharacters = computed(() =>
    form.ip ? presets.characters.filter((character) => character.ip === form.ip) : []
  )
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
      { label: '不设置 IP', value: NO_IP_OPTION },
      ...presets.ips.map((ip) => ({ label: ip, value: ip }))
    ]
  })

  const characterPlaceholder = computed(() => {
    if (!form.ip) return '请先选择 IP'
    if (availableCharacters.value.length === 0) return '该 IP 暂无角色'
    return '请选择角色'
  })
  const primaryPreviewImage = computed(() => getPrimaryGoodsImageUrl(form.images))
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
        if (mode === 'add' && (!hasCustomAcquiredAt.value || form.acquiredAt === today)) {
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

      form.saleReminderEnabled = false
      form.saleAt = ''
      form.saleReminderOffsets = []

      if (mode === 'add' && !form.acquiredAt && !hasCustomAcquiredAt.value) {
        form.acquiredAt = today
      }

      syncUnitCharacterListLength()
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

  onMounted(() => {
    if (mode === 'add') {
      form.isWishlist = initialIsWishlist
      if (!form.isWishlist) {
        form.acquiredAt = today
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
        form.category = item.category ?? ''
        form.ip = item.ip ?? ''
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
        showUnitAcquiredAtInput.value = form.unitAcquiredAtList.some((value) => !!String(value || '').trim())
        showUnitActualPriceInput.value = form.unitActualPriceList.some((value) => !!String(value || '').trim())
        showUnitCharacterInput.value = form.unitCharacterList.some((value) => !!String(value || '').trim())
        showUnitCollectStatusInput.value = form.unitCollectStatusList.some((value) => !!String(value || '').trim())
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
    updateViewport()
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleClickOutside)
    document.removeEventListener('touchstart', handleClickOutside)
  })

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

    if (!form.isWishlist) {
      form.saleAt = ''
      form.saleReminderEnabled = false
      form.saleReminderOffsets = []
    } else {
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
      // 自动记录状态变更到时间线
      let timeline = Array.isArray(form.statusTimeline) ? [...form.statusTimeline] : []
      const oldStatus = originalCollectStatus.value || '已拥有'
      const newStatus = form.collectStatus || '已拥有'

      // 检测用户是否手动编辑了时间线（非自动生成）
      const origTimeline = originalTimeline.value || []
      const timelineEditedByUser = JSON.stringify(timeline.map(e => ({ s: e.status, a: e.at, u: e.unitIndex }))) !==
        JSON.stringify(origTimeline.map(e => ({ s: e.status, a: e.at, u: e.unitIndex })))

      // 用户手动编辑过时间线 → 完全尊重用户编辑，不做任何自动追加/修改
      if (timelineEditedByUser) {
        // 老数据没有时间线但用户也未添加 → 用 acquiredAt 创建初始记录
        if (timeline.length === 0 && form.acquiredAt && origTimeline.length === 0) {
          timeline = [{ status: oldStatus, at: form.acquiredAt }]
        }
        form.statusTimeline = timeline
      } else {
        // 用户没有手动编辑时间线 → 自动处理
        // 老数据没有时间线时，用 acquiredAt 创建初始记录
        if (timeline.length === 0 && form.acquiredAt) {
          timeline = [{ status: oldStatus, at: form.acquiredAt }]
        }

        // 购入日期变更时，更新时间线中最早的匹配状态的非逐份条目日期
        const oldAcquiredAt = originalAcquiredAt.value || ''
        if (form.acquiredAt && form.acquiredAt !== oldAcquiredAt && timeline.length > 0) {
          const targetStatus = oldStatus === newStatus ? newStatus : oldStatus
          for (let i = 0; i < timeline.length; i++) {
            if (timeline[i].status === targetStatus && timeline[i].unitIndex == null) {
              timeline[i] = { ...timeline[i], at: form.acquiredAt }
              break
            }
          }
          timeline.sort((a, b) => a.at.localeCompare(b.at))
        }

        // 逐份购入日期 / 逐份状态变更
        const hasUnitStatuses = Array.isArray(form.unitCollectStatusList) && form.unitCollectStatusList.length > 0
        if (!hasUnitStatuses) {
          const oldUnitDates = originalUnitAcquiredAtList.value || []
          const newUnitDates = Array.isArray(form.unitAcquiredAtList) ? form.unitAcquiredAtList : []
          if (newUnitDates.length > 0) {
            const unitStatuses = Array.isArray(form.unitCollectStatusList) ? form.unitCollectStatusList : []
            timeline = syncUnitAcquiredTimeline(timeline, oldUnitDates, newUnitDates, unitStatuses)
          }
        }

        if (oldStatus !== newStatus) {
          timeline = appendStatusTimelineEntry(timeline, newStatus)
        }
        if (!hasUnitStatuses) {
          const oldUnitList = originalUnitCollectStatusList.value || []
          const newUnitList = Array.isArray(form.unitCollectStatusList) ? form.unitCollectStatusList : []
          if (newUnitList.length > 0) {
            timeline = syncUnitStatusTimeline(timeline, oldUnitList, newUnitList)
          }
        }
      }
      form.statusTimeline = timeline

      const updatedId = await store.updateGoods(editId, { ...form })
      if (!updatedId) {
        alert('保存失败：该谷子可能已不存在，请返回列表重新查看。')
        // Should we always go to home or back?
        // But fade is requested.
        runWithRouteTransition(() => router.replace('/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
        return
      }

      prepareGoodsHeroBack({
        goodsId: editId,
        sourceEl: getMotionSourceEl?.(),
        targetPath: `/detail/${editId}`
      })

      if (originalIsWishlist.value != null && originalIsWishlist.value !== form.isWishlist) {
        setPendingDetailReturnPath(form.isWishlist ? '/wishlist' : '/home')
      }
    } else {
      // 新增时记录初始状态到时间线
      const initialStatus = form.isWishlist ? '' : (form.collectStatus || '已拥有')
      const hasUnitStatuses = Array.isArray(form.unitCollectStatusList) && form.unitCollectStatusList.length > 0
      if (initialStatus) {
        if (hasUnitStatuses) {
          // 有逐份状态时：只记录一条汇总时间线，逐份持有天数由 unitAcquiredAtList 独立计算
          const timelineDate = form.acquiredAt || today
          form.statusTimeline = [{ status: initialStatus, at: timelineDate }]
        } else if (quantityNumber.value >= 2) {
          // 多份无逐份状态：逐份购入日期生成时间线条目
          const unitDates = Array.isArray(form.unitAcquiredAtList) ? form.unitAcquiredAtList : []
          const validUnitDates = unitDates
            .map((d, i) => {
              const date = String(d || '').trim()
              return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, index: i } : null
            })
            .filter(Boolean)

          if (validUnitDates.length > 0) {
            form.statusTimeline = validUnitDates
              .map(({ date, index: i }) => ({
                status: initialStatus,
                at: date,
                unitIndex: i
              }))
              .sort((a, b) => a.at.localeCompare(b.at))

            if (validUnitDates.length < quantityNumber.value) {
              const timelineDate = form.acquiredAt || today
              form.statusTimeline.push({ status: initialStatus, at: timelineDate })
              form.statusTimeline.sort((a, b) => a.at.localeCompare(b.at))
            }
          } else {
            const timelineDate = form.acquiredAt || today
            form.statusTimeline = [{ status: initialStatus, at: timelineDate }]
          }
        } else {
          // 单份无逐份状态：直接使用购入日期
          const timelineDate = form.acquiredAt || today
          form.statusTimeline = [{ status: initialStatus, at: timelineDate }]
        }
      }
      const motionId = String(Date.now())
      const addPromise = store.addGoods({ ...form, id: motionId })
      writeAddMotionRequest(motionId, event)
      runWithRouteTransition(() => router.back(), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
      void addPromise.catch(() => {})
      return
    }

    runWithRouteTransition(() => router.back(), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
  }

  function validateName() {
    const result = validateTextName(form.name, { label: '名称' })
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

  function onDateConfirm({ selectedValues }) {
    const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
    form.acquiredAt = `${year}-${month}-${day}`
    datePickerValue.value = [year, month, day]
    syncAllUnitDatesFromPrimaryDate()
    hasCustomAcquiredAt.value = true
    showDatePicker.value = false
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
    const [fallbackYear, fallbackMonth, fallbackDay] = today.split('-')

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
    showSaleDateTimePicker,
    showCharPicker,
    datePickerValue,
    unitDatePickerValue,
    activeUnitDateIndex,
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
    isTabletViewport,
    datePickerPopupPosition,
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
    hasUnitCollectStatusValue,
    disableCollectStatusInput,
    clearUnitCollectStatusList,
    normalizeUnitCollectStatusValue,
    syncUnitCollectStatusListLength,
    syncAllUnitDatesFromPrimaryDate,
    syncAllUnitPricesFromActualPrice,
    openDatePicker,
    openUnitDatePicker,
    onDateConfirm,
    onUnitDateConfirm,
    toDatePickerValue,
    normalizeDateParts,
    syncField,
    syncFieldLater
  }
}
