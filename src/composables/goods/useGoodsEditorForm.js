import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { normalizeCharacterName, usePresetsStore } from '@/stores/presets'
import { formatDate } from '@/utils/format'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { getPrimaryGoodsImageUrl } from '@/utils/goodsImages'
import { syncFieldValue, syncFieldValueNextFrame } from '@/utils/syncFieldValue'
import { validateName as validateTextName, validatePrice as validateNumericPrice } from '@/utils/validate'

const NO_IP_OPTION = '__NO_IP__'
const today = formatDate(new Date(), 'YYYY-MM-DD')
const TABLET_BREAKPOINT = 768

export function useGoodsEditorForm(options = {}) {
  const mode = options.mode === 'edit' ? 'edit' : 'add'
  const editId = options.editId ?? ''
  const initialIsWishlist = Boolean(options.initialIsWishlist)

  const router = useRouter()
  const store = useGoodsStore()
  const presets = usePresetsStore()

  const form = reactive({
    name: '',
    category: '',
    ip: '',
    isWishlist: false,
    characters: [],
    tags: [],
    storageLocation: '',
    price: '',
    actualPrice: '',
    points: '',
    acquiredAt: '',
    images: [],
    tracks: [],
    note: '',
    quantity: 1,
    unitAcquiredAtList: [],
    unitActualPriceList: [],
    unitCharacterList: []
  })

  const showPointsInput = ref(false)
  const showActualPriceInput = ref(false)
  const showUnitAcquiredAtInput = ref(false)
  const showUnitActualPriceInput = ref(false)
  const showUnitCharacterInput = ref(false)
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
  const showCharPicker = ref(false)
  const datePickerValue = ref(toDatePickerValue(form.acquiredAt))
  const unitDatePickerValue = ref(toDatePickerValue(form.acquiredAt))
  const activeUnitDateIndex = ref(-1)
  const minDate = new Date(2000, 0, 1)
  const maxDate = new Date(2100, 11, 31)
  const hasCustomAcquiredAt = ref(false)
  const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth)

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
  const disableActualPriceInput = computed(() => !form.isWishlist && quantityNumber.value >= 2 && showUnitActualPriceInput.value)
  const isTabletViewport = computed(() => viewportWidth.value >= TABLET_BREAKPOINT)
  const datePickerPopupPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))

  function handleViewportResize() {
    viewportWidth.value = window.innerWidth
  }

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
        form.actualPrice = ''
        form.points = ''
        form.unitAcquiredAtList = []
        form.unitActualPriceList = []
        form.unitCharacterList = []
        return
      }

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
        form.name = item.name ?? ''
        form.category = item.category ?? ''
        form.ip = item.ip ?? ''
        form.isWishlist = Boolean(item.isWishlist)
        form.characters = item.characters ? [...item.characters] : []
        form.tags = item.tags ? [...item.tags] : []
        form.storageLocation = item.storageLocation ?? ''
        form.price = item.price ?? ''
        form.actualPrice = item.actualPrice ?? ''
        form.points = item.points ?? ''
        showPointsInput.value = !!item.points
        showActualPriceInput.value = hasActualPriceValue(item.actualPrice)
        form.acquiredAt = item.acquiredAt ?? ''
        form.images = item.images ? [...item.images] : []
        form.tracks = Array.isArray(item.tracks) ? [...item.tracks] : []
        form.note = item.note ?? ''
        form.quantity = Number(item.quantity) || 1
        form.unitAcquiredAtList = Array.isArray(item.unitAcquiredAtList) ? [...item.unitAcquiredAtList] : []
        form.unitActualPriceList = Array.isArray(item.unitActualPriceList) ? [...item.unitActualPriceList] : []
        form.unitCharacterList = Array.isArray(item.unitCharacterList) ? [...item.unitCharacterList] : []
        showUnitAcquiredAtInput.value = form.unitAcquiredAtList.some((value) => !!String(value || '').trim())
        showUnitActualPriceInput.value = form.unitActualPriceList.some((value) => !!String(value || '').trim())
        showUnitCharacterInput.value = form.unitCharacterList.some((value) => !!String(value || '').trim())
        syncUnitAcquiredAtListLength()
        syncUnitActualPriceListLength()
        syncUnitCharacterListLength()
        datePickerValue.value = toDatePickerValue(form.acquiredAt)
      }
    }

    syncUnitAcquiredAtListLength()
    syncUnitActualPriceListLength()
    syncUnitCharacterListLength()
    handleViewportResize()
    window.addEventListener('resize', handleViewportResize)
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleViewportResize)
    document.removeEventListener('mousedown', handleClickOutside)
    document.removeEventListener('touchstart', handleClickOutside)
  })

  async function handleSubmit() {
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

    if (mode === 'edit') {
      const updatedId = await store.updateGoods(editId, { ...form })
      if (!updatedId) {
        alert('保存失败：该谷子可能已不存在，请返回列表重新查看。')
        router.replace('/home')
        return
      }
    } else {
      await store.addGoods({ ...form })
    }

    router.back()
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
