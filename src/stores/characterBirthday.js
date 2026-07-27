import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useNotifySettingsStore } from '@/stores/notifySettings'
import { buildLeaderboardEntries } from '@/utils/goods/leaderboard'
import { buildBirthdayIndex, matchBirthdayRow, isBirthdayOnDate } from '@/utils/goods/birthday'
import { loadCachedBirthdayRows, refreshBirthdayRows } from '@/services/birthdayService'
import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'

// 触发彩蛋的最低谷子数（按角色聚合，口径与角色排行榜一致：
// 排除心愿单与已出/已赠出/丢失，多角色商品按份数分摊）
export const BIRTHDAY_EGG_MIN_QUANTITY = 9

const RECORD_KEY = 'goods_birthday_egg_record'
// 收集上限放宽一些（部分商品可能无图），实际显示数量由弹窗按屏宽截取（9/16）
const MAX_WALL_IMAGES = 30

function todayKey(date = new Date()) {
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function readRecord() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECORD_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistRecord(record) {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record || {}))
  } catch {
    // ignore
  }
}

export const useCharacterBirthdayStore = defineStore('characterBirthday', () => {
  const goodsStore = useGoodsStore()
  const presets = usePresetsStore()
  const notifySettings = useNotifySettingsStore()

  const rows = ref(loadCachedBirthdayRows())
  const dialogVisible = ref(false)
  // 测试入口注入的预览数据；非空时弹窗显示它而不是真实的今日生日
  const previewBirthdays = ref([])
  // 测试用模拟日期（testBirthdayEgg(true, '3-7')）；非空时按该日期判定生日，关闭弹窗后清除
  const dateOverride = ref(null)

  const presetIpMap = computed(() => (
    new Map(presets.characters.map((character) => [character.name, character.ip || '']))
  ))

  // 达标角色（谷子数 ≥ 阈值），meta 为该角色归属 IP（商品 ip 优先，预设兜底）
  const qualifiedEntries = computed(() => {
    const { entries } = buildLeaderboardEntries(
      goodsStore.collectionViewList,
      'character',
      presetIpMap.value
    )
    return entries.filter((entry) => entry.quantity >= BIRTHDAY_EGG_MIN_QUANTITY)
  })

  function collectImageUrls(characterName) {
    const imageUrls = []
    for (const item of goodsStore.collectionViewList) {
      if (!Array.isArray(item.characters)) continue
      if (!item.characters.some((name) => String(name || '').trim() === characterName)) continue
      const url = getPrimaryGoodsImageUrl(item.images, item.coverImage || item.image)
      if (url) imageUrls.push(url)
      if (imageUrls.length >= MAX_WALL_IMAGES) break
    }
    return imageUrls
  }

  const todayBirthdays = computed(() => {
    if (!rows.value.length || !qualifiedEntries.value.length) return []

    const index = buildBirthdayIndex(rows.value)
    const now = dateOverride.value || new Date()
    const list = []

    for (const entry of qualifiedEntries.value) {
      const row = matchBirthdayRow(index, { name: entry.label, ip: entry.meta })
      if (!row || !isBirthdayOnDate(row.month, row.day, now)) continue

      const imageUrls = collectImageUrls(entry.label)

      list.push({
        id: row.id || `${row.ip}/${row.name}`,
        name: entry.label,
        ip: row.ip || entry.meta || '',
        month: row.month,
        day: row.day,
        color: row.color,
        message: row.message,
        quantity: entry.quantity,
        totalValue: entry.actualTotalValue,
        imageUrls
      })
    }
    return list
  })

  // 刷新生日数据：默认增量拉取（按 updated_at），仅返回变更行；force 或 key 集合变化时全量
  async function refresh({ force = false } = {}) {
    const names = qualifiedEntries.value.map((entry) => entry.label)
    rows.value = await refreshBirthdayRows(names, { force })
  }

  // 启动检查：开关开启 + 今日有生日 + 今天未弹过 → 弹卡片
  async function checkAndDecide() {
    if (!notifySettings.settings.enabled || !notifySettings.settings.birthdayEgg) return
    await refresh()
    if (!todayBirthdays.value.length) return

    // 模拟日期测试不读也不写「今天已弹过」标记，避免影响真实当天的弹窗
    if (!dateOverride.value) {
      const record = readRecord()
      const currentDay = todayKey()
      if (record.lastShownDay === currentDay) return
      persistRecord({ lastShownDay: currentDay, lastShownAt: new Date().toISOString() })
    }

    dialogVisible.value = true
  }

  // My 页手动回看：无视「今天已弹过」标记
  function openDialog() {
    if (todayBirthdays.value.length) dialogVisible.value = true
  }

  // 弹窗实际显示的数据：测试预览优先
  const visibleBirthdays = computed(() => (
    previewBirthdays.value.length ? previewBirthdays.value : todayBirthdays.value
  ))

  // 通知设置页的测试入口：用谷子最多的达标角色（真实统计+图片墙）构造
  // 今天生日的预览卡片，不足两张用示例数据补齐以便测试轮播
  function openTestDialog() {
    const now = new Date()
    const list = [...qualifiedEntries.value]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 2)
      .map((entry, index) => ({
        id: `preview-${index}`,
        name: entry.label,
        ip: entry.meta || '',
        month: now.getMonth() + 1,
        day: now.getDate(),
        color: index === 0 ? '#39c5bb' : '#e2557f',
        message: '',
        quantity: entry.quantity,
        totalValue: entry.actualTotalValue,
        imageUrls: collectImageUrls(entry.label)
      }))

    while (list.length < 2) {
      list.push({
        id: `preview-mock-${list.length}`,
        name: '初音未来',
        ip: 'VOCALOID',
        month: now.getMonth() + 1,
        day: now.getDate(),
        color: '#39c5bb',
        message: '',
        quantity: 3,
        totalValue: 520.5,
        imageUrls: []
      })
    }

    previewBirthdays.value = list
    dialogVisible.value = true
  }

  function dismiss() {
    dialogVisible.value = false
    previewBirthdays.value = []
    dateOverride.value = null
  }

  // Console 测试入口（浏览器 DevTools / 真机 chrome://inspect）：
  //   testBirthdayEgg()              —— 弹预览卡片（谷子最多的达标角色 + 示例数据补齐轮播）
  //   testBirthdayEgg(true)          —— 清掉「今天已弹过」标记后走真实检查流程（需云端表有今日生日）
  //   testBirthdayEgg(true, '3-7')   —— 按模拟日期走真实流程；也接受 '3/7'、'2028-2-29'（带年份可测闰年）
  if (typeof window !== 'undefined') {
    window.testBirthdayEgg = (real = false, date = '') => {
      if (!real) {
        openTestDialog()
        return '已弹出预览卡片'
      }

      // 测试模式强制重查云端，避免 24h 缓存吃掉刚在 Dashboard 加的行
      const run = async () => {
        await refresh({ force: true })
        await checkAndDecide()
      }

      const match = String(date).trim().match(/^(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})$/)
      if (match) {
        const year = match[1] ? Number(match[1]) : new Date().getFullYear()
        dateOverride.value = new Date(year, Number(match[2]) - 1, Number(match[3]))
        void run()
        return `按 ${dateOverride.value.toLocaleDateString()} 模拟真实检查（已强制刷新云端缓存；关闭弹窗后恢复）`
      }

      dateOverride.value = null
      try {
        localStorage.removeItem(RECORD_KEY)
      } catch { /* ignore */ }
      void run()
      return '已清除今日标记并强制刷新后触发真实检查（无今日生日则不弹）'
    }
  }

  return {
    rows,
    dialogVisible,
    qualifiedEntries,
    todayBirthdays,
    visibleBirthdays,
    refresh,
    checkAndDecide,
    openDialog,
    openTestDialog,
    dismiss
  }
})
