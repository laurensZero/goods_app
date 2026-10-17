// 单个新增草稿：空白表单不应落草稿（退出后再点添加不应弹「继续上次」，
// 云端也不应被推一份空草稿）。
//
// 回归点：默认态归一化的 watcher（收藏态清空补款提醒等）在 mounted 之后才 flush，
// 若在归一化之前固定「空白基线」，默认值被当成用户填写 → 什么都没填退出也写草稿。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'

const savedForms = []
let clearCount = 0
let ctx = null
let remoteDraft = null

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  onBeforeRouteLeave: () => {}
}))
vi.mock('@/stores/goods', () => ({
  useGoodsStore: () => ({ list: [], trashList: [], getById: () => null, addGoods: vi.fn(), updateGoods: vi.fn() })
}))
vi.mock('@/stores/presets', () => ({
  usePresetsStore: () => ({ characters: [], ips: [], favoriteCharacterSet: new Set() }),
  normalizeCharacterName: (value) => String(value || '').trim()
}))
vi.mock('@/utils/globalToast', () => ({ showGlobalToast: vi.fn() }))
vi.mock('@/utils/image/localImage', () => ({
  collectManagedLocalImagePathsFromGoodsItem: () => [],
  deleteManagedLocalImages: vi.fn(),
  extractManagedLocalImagePath: () => ''
}))
vi.mock('@/utils/image/imageEdit', () => ({ forgetImageEditsBySourcePaths: vi.fn() }))
vi.mock('@/utils/format', () => ({ formatDate: () => '2026-10-17' }))
vi.mock('@/utils/commitActiveInput', () => ({ commitActiveInput: vi.fn() }))
vi.mock('@/utils/routeTransition', () => ({
  runWithRouteTransition: (fn) => fn(),
  setPendingDetailReturnPath: vi.fn()
}))
vi.mock('@/utils/sync/fieldValue', () => ({ syncFieldValue: vi.fn(), syncFieldValueNextFrame: vi.fn() }))
vi.mock('@/utils/validate', () => ({
  validateName: () => ({ valid: true }),
  validatePrice: () => ({ valid: true })
}))
vi.mock('@/composables/viewport/useTabletViewport', () => ({
  useTabletViewport: () => ({ isTabletViewport: ref(false), updateViewport: vi.fn() })
}))
vi.mock('@/utils/platform/nativeGoodsHeroTransition', () => ({ prepareGoodsHeroBack: vi.fn() }))
vi.mock('@/utils/goods/statusTimeline', () => ({
  alignSaleTimelineDates: (value) => value || [],
  computeEditedTimeline: () => [],
  buildAcquisitionTimelineEntries: () => []
}))
vi.mock('@/utils/goods/id', () => ({ nextGoodsId: () => 'id1' }))
vi.mock('@/utils/goods/saleReminder', () => ({
  SALE_REMINDER_DEFAULT_OFFSETS: [1440, 60, 10, 0],
  allowsCollectSaleReminder: () => false,
  ensureSaleReminderPermission: () => Promise.resolve(),
  normalizeSaleAt: (value) => value || '',
  normalizeSaleReminderOffsets: (value) => (Array.isArray(value) ? value : [])
}))
vi.mock('@/composables/batch/useBatchQueue', () => ({
  getSingleDraft: vi.fn(async () => remoteDraft),
  saveSingleDraft: vi.fn(async (_slot, form) => {
    savedForms.push(form)
    return Date.now()
  }),
  clearSingleDraft: vi.fn(async () => { clearCount += 1 }),
  bindSingleDraftSlot: vi.fn(),
  unbindSingleDraftSlot: vi.fn(),
  singleDraftRemoteRevision: ref(0)
}))

const { useGoodsEditorForm } = await import('@/composables/goods/useGoodsEditorForm')

async function mountEditor({ isWishlist = false, resume = false } = {}) {
  const Comp = defineComponent({
    setup() {
      ctx = useGoodsEditorForm({
        mode: 'add',
        draftSlot: isWishlist ? 'wishlist' : 'collection',
        resumeDraft: resume,
        initialIsWishlist: isWishlist
      })
      return () => h('div')
    }
  })
  const wrapper = mount(Comp)
  // 等 onMounted 里的 await nextTick / 读草稿 完成
  await new Promise((resolve) => setTimeout(resolve, 20))
  await nextTick()
  return wrapper
}

async function exitEditor(wrapper) {
  wrapper.unmount()
  await new Promise((resolve) => setTimeout(resolve, 30))
}

describe('单个谷子编辑草稿：空白不落库', () => {
  beforeEach(() => {
    savedForms.length = 0
    clearCount = 0
    remoteDraft = null
  })

  it('收藏：什么都没填就退出 → 不写草稿，并清掉同槽旧草稿', async () => {
    const wrapper = await mountEditor({ isWishlist: false })
    await exitEditor(wrapper)
    expect(savedForms).toEqual([])
    // 空白退出要把同槽残留草稿软删（否则下次点添加仍会弹「继续上次」）
    expect(clearCount).toBeGreaterThan(0)
  })

  it('心愿：什么都没填就退出 → 不写草稿', async () => {
    const wrapper = await mountEditor({ isWishlist: true })
    await exitEditor(wrapper)
    expect(savedForms).toEqual([])
  })

  it('填了名字后退出 → 写草稿', async () => {
    const wrapper = await mountEditor({ isWishlist: false })
    ctx.form.name = '测试谷子'
    await nextTick()
    await exitEditor(wrapper)
    expect(savedForms).toHaveLength(1)
    expect(savedForms[0].name).toBe('测试谷子')
  })

  it('填了又清空 → 不写草稿', async () => {
    const wrapper = await mountEditor({ isWishlist: false })
    ctx.form.name = '测试谷子'
    await nextTick()
    ctx.form.name = ''
    await nextTick()
    await exitEditor(wrapper)
    expect(savedForms).toEqual([])
  })

  it('继续上次：草稿内容回填，退出后仍保留草稿', async () => {
    remoteDraft = { form: { name: '旧草稿', images: [] }, isWishlist: false, updatedAt: 123 }
    const wrapper = await mountEditor({ resume: true })
    expect(ctx.form.name).toBe('旧草稿')
    await exitEditor(wrapper)
    expect(savedForms).toHaveLength(1)
    expect(savedForms[0].name).toBe('旧草稿')
  })
})
