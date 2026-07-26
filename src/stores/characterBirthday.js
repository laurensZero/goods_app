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
export const BIRTHDAY_EGG_MIN_QUANTITY = 3

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
    const now = new Date()
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

  // 按需刷新：达标角色集合变化或缓存过期时才会真正发请求
  async function refresh({ force = false } = {}) {
    const names = qualifiedEntries.value.map((entry) => entry.label)
    rows.value = await refreshBirthdayRows(names, { force })
  }

  // 启动检查：开关开启 + 今日有生日 + 今天未弹过 → 弹卡片
  async function checkAndDecide() {
    if (!notifySettings.settings.enabled || !notifySettings.settings.birthdayEgg) return
    await refresh()
    if (!todayBirthdays.value.length) return

    const record = readRecord()
    const currentDay = todayKey()
    if (record.lastShownDay === currentDay) return

    dialogVisible.value = true
    persistRecord({ lastShownDay: currentDay, lastShownAt: new Date().toISOString() })
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
  }

  // Console 测试入口（浏览器 DevTools / 真机 chrome://inspect）：
  //   testBirthdayEgg()      —— 弹预览卡片（谷子最多的达标角色 + 示例数据补齐轮播）
  //   testBirthdayEgg(true)  —— 清掉「今天已弹过」标记后走真实检查流程（需云端表有今日生日）
  if (typeof window !== 'undefined') {
    window.testBirthdayEgg = (real = false) => {
      if (!real) {
        openTestDialog()
        return '已弹出预览卡片'
      }
      try {
        localStorage.removeItem(RECORD_KEY)
      } catch { /* ignore */ }
      void checkAndDecide()
      return '已清除今日标记并触发真实检查（无今日生日则不弹）'
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
