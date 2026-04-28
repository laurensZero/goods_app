import { computed } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'

function formatSyncTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function useManageEntries() {
  const goodsStore = useGoodsStore()
  const eventsStore = useEventsStore()
  const presets = usePresetsStore()
  const syncStore = useSyncStore()
  const rechargeStore = useRechargeStore()

  const collectionCount = computed(() => goodsStore.list.filter((item) => !item?.isWishlist).length)
  const wishlistCount = computed(() => goodsStore.list.filter((item) => item?.isWishlist).length)
  const eventCount = computed(() => eventsStore.list.length)
  const rechargeCount = computed(() => rechargeStore.sortedRecords.value.length)

  const exportSummaryText = computed(() =>
    `${collectionCount.value} 件收藏 ${wishlistCount.value} 件心愿 ${eventCount.value} 场活动 ${rechargeCount.value} 条充值`
  )

  const syncMetaText = computed(() => {
    const statusText = String(syncStore.syncStatus || '')
    if (!syncStore.isSyncing && /(数据已是最新|数据已经是最新|上传完成|拉取完成)/.test(statusText)) {
      return syncStore.lastSyncedAt ? `数据已最新 · ${formatSyncTime(syncStore.lastSyncedAt)}` : '数据已最新'
    }
    if (syncStore.lastSyncedAt) {
      return `上次同步 ${formatSyncTime(syncStore.lastSyncedAt)}`
    }
    return '尚未完成同步'
  })

  const manageEntries = computed(() => [
    {
      key: 'categories', group: 'preset', title: '分类管理', kicker: '预设 / 分类',
      meta: `${presets.categories.length} 项分类预设`,
      detail: '维护收藏分类的命名和归类规则，影响添加、搜索和整理时的筛选体验。',
      summary: '适合先清理命名，再逐步收敛同义分类，避免后续统计分散。',
      recommendation: '如果分类数量已经开始增长，优先统一主分类，再处理细分标签。',
      primaryLabel: '打开分类管理', secondaryLabel: '',
      iconMode: 'text', iconClass: 'cat-icon', iconText: '分',
      path: '/manage/categories',
      stats: [{ label: '分类数量', value: `${presets.categories.length}` }, { label: '影响范围', value: '收藏列表' }]
    },
    {
      key: 'ips', group: 'preset', title: 'IP 管理', kicker: '预设 / 作品',
      meta: `${presets.ips.length} 个作品系列`,
      detail: '统一维护作品、系列和企划名称，减少录入时的拼写分裂。',
      summary: 'IP 是角色、搜索和统计的上层语义，先稳定这里，后续数据会更干净。',
      recommendation: '建议把同系列不同写法先合并，再补齐常用缩写。',
      primaryLabel: '打开 IP 管理', secondaryLabel: '',
      iconMode: 'text', iconClass: 'ip-icon', iconText: 'IP',
      path: '/manage/ips',
      stats: [{ label: 'IP 数量', value: `${presets.ips.length}` }, { label: '适用场景', value: '角色归属' }]
    },
    {
      key: 'characters', group: 'preset', title: '角色管理', kicker: '预设 / 角色',
      meta: `${presets.characters.length} 个角色`,
      detail: '维护角色名称与所属 IP，用于细粒度检索和偏好聚合。',
      summary: '如果你经常按角色收纳或统计，这一项应该保持最完整。',
      recommendation: '优先补齐高频角色，再回头清理低频或重复条目。',
      primaryLabel: '打开角色管理', secondaryLabel: '',
      iconMode: 'text', iconClass: 'char-icon', iconText: '角',
      path: '/manage/characters',
      stats: [{ label: '角色数量', value: `${presets.characters.length}` }, { label: '关联字段', value: 'IP / 收藏' }]
    },
    {
      key: 'storage', group: 'daily', title: '收纳位置', kicker: '日常管理',
      meta: `${presets.storageLocations.length} 个层级节点`,
      detail: '按柜子、抽屉和活页册建立位置树，适合把现实收纳映射到应用里。',
      summary: '位置结构比单个标签更利于找物和回看，也方便后续批量搬迁。',
      recommendation: '先搭出一级和二级结构，再逐步补录具体格位。',
      primaryLabel: '打开收纳位置', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'storage-icon',
      iconPaths: ['M4 7h16', 'M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7', 'M9 11h6', 'M9 15h4'],
      path: '/storage-locations',
      stats: [{ label: '位置节点', value: `${presets.storageLocations.length}` }, { label: '用途', value: '实体收纳' }]
    },
    {
      key: 'theme', group: 'daily', title: '主题模式', kicker: '外观与主题',
      meta: '切换界面主题和外观偏好',
      detail: '管理浅色、深色和主题风格，让信息密度和阅读对比更适合当前设备。',
      summary: '大屏更适合清晰的层次和更低噪声的色彩，小屏则优先保证点击识别。',
      recommendation: '建议在常用设备上分别看一次，确认对比和留白是否稳定。',
      primaryLabel: '打开主题设置', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'theme-icon',
      iconPaths: ['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41', 'M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z'],
      path: '/manage/theme',
      stats: [{ label: '目标', value: '观感统一' }, { label: '影响范围', value: '全局界面' }]
    },
    {
      key: 'trash', group: 'daily', title: '回收站', kicker: '日常管理',
      meta: `${goodsStore.trashList.length} 条待处理记录`,
      detail: '查看误删内容、恢复项目，或在确认后彻底清空历史删除项。',
      summary: '当回收站条目持续增长时，说明日常整理路径可能还需要再顺手一些。',
      recommendation: '建议定期清理长期无恢复价值的记录，保持状态轻量。',
      primaryLabel: '打开回收站', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'trash-icon',
      iconPaths: ['M3 6H21', 'M8 6V4H16V6', 'M19 6L18 20H6L5 6', 'M10 11V17', 'M14 11V17'],
      path: '/trash',
      stats: [{ label: '待处理', value: `${goodsStore.trashList.length}` }, { label: '风险', value: '可恢复' }]
    },
    {
      key: 'export', group: 'data', title: '导出数据', kicker: '数据管理',
      meta: exportSummaryText.value,
      detail: '把收藏、心愿、活动、充值和预设导出为备份文件，支持轻量导出和自定义导出范围。',
      summary: '备份应该是低负担的日常动作，而不是出问题后才想起来做的补救。',
      recommendation: '建议在大改预设或批量导入前先做一次轻量导出。',
      primaryLabel: '立即导出', secondaryLabel: '自定义导出',
      iconMode: 'svg', iconClass: 'export-icon',
      iconPaths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8L12 3L7 8', 'M12 3V15'],
      action: 'export', secondaryAction: 'export-picker',
      stats: [
        { label: '导出范围', value: '收藏 / 活动 / 预设' },
        { label: '当前规模', value: `${collectionCount.value + wishlistCount.value + eventCount.value + rechargeCount.value}` }
      ]
    },
    {
      key: 'import', group: 'data', title: '导入数据', kicker: '数据管理',
      meta: '从备份文件恢复或合并数据',
      detail: '读取备份 JSON，合并收藏、活动、充值和预设信息。',
      summary: '导入属于高影响操作，入口应该明确，反馈也应该足够直接。',
      recommendation: '导入前先做一次当前数据备份，避免误覆盖后难以回滚。',
      primaryLabel: '选择备份文件', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'import-icon',
      iconPaths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10L12 15L17 10', 'M12 15V3'],
      action: 'import',
      stats: [{ label: '支持格式', value: 'JSON 备份' }, { label: '适用场景', value: '迁移 / 恢复' }]
    },
    {
      key: 'sync', group: 'cloud', title: 'GitHub Gist 同步', kicker: '云同步',
      meta: syncMetaText.value,
      detail: '连接 GitHub 后可在多设备之间同步数据，并检查令牌、Gist 和远端状态。',
      summary: '同步页应该更偏状态中心，而不是单次操作页，核心是看得清"现在是否安全"。',
      recommendation: '如果已经登录，优先确认最近同步时间和授权范围是否正常。',
      primaryLabel: '打开同步中心', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'sync-icon',
      iconPaths: ['M21.5 2v6h-6', 'M2.5 22v-6h6', 'M2 11.5a10 10 0 0 1 18.8-4.3', 'M22 12.5a10 10 0 0 1-18.8 4.3'],
      path: '/manage/sync',
      stats: [
        { label: '连接状态', value: syncStore.githubLogin ? '已连接' : '未连接' },
        { label: '最近同步', value: syncStore.lastSyncedAt ? formatSyncTime(syncStore.lastSyncedAt) : '从未同步' }
      ]
    },
    {
      key: 'shares', group: 'cloud', title: '管理分享', kicker: '分享',
      meta: '查看和管理已发起的分享',
      detail: '查看所有已发起的分享记录，复制分享链接、停用或删除不再需要的分享。',
      summary: '集中管理分享入口，避免过多无效链接散落。',
      recommendation: '定期清理过期或不再需要的分享，保持分享列表整洁。',
      primaryLabel: '打开分享管理', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'share-icon',
      iconPaths: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
      path: '/manage/shares',
      stats: [{ label: '用途', value: '管理 / 分享' }, { label: '依赖', value: 'GitHub Token' }]
    },
    {
      key: 'about', group: 'app', title: '关于应用', kicker: '应用信息',
      meta: '版本、说明与使用方式',
      detail: '查看版本、数据说明和同步使用方式，方便回顾规则和排查问题。',
      summary: '说明页应该承担"减少疑问"的职责，而不是单纯展示版本号。',
      recommendation: '把常见导入导出或同步说明放在这里，能显著减少误操作。',
      primaryLabel: '打开关于页', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'about-icon',
      iconPaths: ['M12 10v6', 'M12 7h.01', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18Z'],
      path: '/manage/about',
      stats: [{ label: '内容类型', value: '说明 / 版本' }, { label: '适用时机', value: '排查 / 回顾' }]
    }
  ])

  const manageEntryGroups = computed(() => {
    const groups = [
      { key: 'preset', label: 'Presets', title: '预设与命名' },
      { key: 'daily', label: 'Daily', title: '日常整理' },
      { key: 'data', label: 'Data', title: '备份与恢复' },
      { key: 'cloud', label: 'Cloud', title: '云端状态' },
      { key: 'app', label: 'App', title: '应用信息' }
    ]
    return groups.map((group) => ({
      ...group,
      entries: manageEntries.value.filter((entry) => entry.group === group.key)
    })).filter((group) => group.entries.length > 0)
  })

  return { manageEntries, manageEntryGroups, exportSummaryText, syncMetaText, formatSyncTime }
}
