import { ref, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  parseSaleAt,
  normalizeSaleReminderEnabled,
  normalizeSaleReminderOffsets,
  SALE_REMINDER_DEFAULT_OFFSETS
} from '@/utils/saleReminder'
import { formatDate } from '@/utils/format'
import { useNotifySettingsStore } from '@/stores/notifySettings'

const NOTIFY_DURATION = 6000

/**
 * 应用内通知管理器 — 右上角弹窗，支持操作按钮、滑动消除、倒计时自动消失。
 *
 * 通知来源：
 *  1. 开售提醒（轮询）
 *  2. 后台同步结果（watch syncStore.syncNotice）
 *  3. OTA 更新就绪（watch webUpdateStore / appUpdateStore）
 */
export function useAppNotify(goodsStore, syncStore, webUpdateStore, appUpdateStore) {
  const notifications = ref([])
  const router = useRouter()
  let pollTimer = null
  const firedKeys = new Set()

  // 获取通知设置 store
  const notifySettingsStore = useNotifySettingsStore()

  // ---- generic push ----

  function push({ text, subText, goodsId, iconType, duration, actions, saleAt, persistent, key, forceAutoClose } = {}) {
    if (!text) return

    // 检查通知是否启用
    if (!notifySettingsStore.effectiveSettings.enabled) return null

    // 检查该类型通知是否启用
    if (!notifySettingsStore.isNotifyTypeEnabled(iconType)) return null

    // 使用设置中的时长，如果没有指定的话
    const effectiveDuration = duration || notifySettingsStore.effectiveSettings.duration || NOTIFY_DURATION

    const notification = {
      id: Date.now() + Math.random(),
      key: key || '',
      goodsId: goodsId ? String(goodsId) : '',
      text,
      subText: subText || '',
      iconType: iconType || 'bell',
      saleAt: saleAt || '',
      createdAt: Date.now(),
      duration: effectiveDuration,
      actions: actions || [],
      persistent: !!persistent
    }

    // 使用设置中的最大显示数量
    const maxVisible = notifySettingsStore.effectiveSettings.maxVisible
    notifications.value = [...notifications.value, notification].slice(-maxVisible)

    // 自动关闭逻辑：如果设置了 forceAutoClose 或者启用了自动关闭且不是持久化通知
    const shouldAutoClose = forceAutoClose || (!persistent && notifySettingsStore.effectiveSettings.autoClose)
    if (shouldAutoClose) {
      setTimeout(() => {
        dismiss(notification.id)
      }, effectiveDuration)
    }

    return notification.id
  }

  function dismissByKey(key) {
    if (!key) return
    notifications.value = notifications.value.filter((n) => n.key !== key)
  }

  function dismiss(id) {
    notifications.value = notifications.value.filter((n) => n.id !== id)
  }

  function clearAll() {
    notifications.value = []
  }

  // ---- 1. Sale reminder polling ----

  function buildKey(goodsId, offset) {
    return `${goodsId}:${offset}`
  }

  function checkDueReminders() {
    const list = goodsStore?.list
    if (!Array.isArray(list) || list.length === 0) return

    const now = Date.now()

    for (const item of list) {
      if (!item?.isWishlist) continue
      if (!normalizeSaleReminderEnabled(item.saleReminderEnabled)) continue

      const saleDate = parseSaleAt(item.saleAt)
      if (!saleDate) continue

      const saleTimeMs = saleDate.getTime()
      const offsets = normalizeSaleReminderOffsets(item.saleReminderOffsets)
      const reminderOffsets = offsets.length ? offsets : SALE_REMINDER_DEFAULT_OFFSETS

      for (const offset of reminderOffsets) {
        const triggerAt = saleTimeMs - offset * 60000
        const key = buildKey(item.id, offset)

        if (firedKeys.has(key)) continue

        const diff = now - triggerAt
        if (diff >= -300000 && diff <= 45000) {
          firedKeys.add(key)
          pushSaleNotification(item, offset)
        }
      }
    }
  }

  function pushSaleNotification(item, offsetMinutes) {
    const name = String(item.name || '谷子').trim() || '谷子'
    const offsetText = formatOffsetText(offsetMinutes)
    const isAtSaleTime = offsetMinutes <= 0

    push({
      goodsId: item.id,
      iconType: 'bell',
      text: isAtSaleTime ? `${name} 开售了` : `${name} ${offsetText}开售`,
      subText: isAtSaleTime ? '现在到开售时间了' : `开售时间：${formatSaleTime(item.saleAt)}`,
      saleAt: isAtSaleTime ? '' : item.saleAt,
      actions: isAtSaleTime
        ? [
            {
              key: 'detail',
              label: '查看详情',
              callback: () => goToDetail(item.id)
            },
            {
              key: 'acquired',
              label: '已入手',
              primary: true,
              callback: () => markAsAcquired(item)
            }
          ]
        : [
            {
              key: 'detail',
              label: '查看详情',
              primary: true,
              callback: () => goToDetail(item.id)
            }
          ]
    })
  }

  async function markAsAcquired(item) {
    if (!item?.id) return
    try {
      await goodsStore.updateGoods(item.id, {
        isWishlist: false,
        acquiredAt: item.acquiredAt || formatDate(new Date(), 'YYYY-MM-DD'),
        saleAt: '',
        saleReminderEnabled: false,
        saleReminderOffsets: []
      })
    } catch {
      // silent fail
    }
  }

  function goToDetail(goodsId) {
    if (!goodsId) return
    router.push(`/detail/${encodeURIComponent(goodsId)}`).catch(() => {})
  }

  // ---- 2. Sync notice watcher ----

  let lastSyncNoticeId = ''

  function watchSync() {
    if (!syncStore) return

    // 同步中 → 持久化通知；同步结束 → 自动关闭 + 成功/失败提示
    // visibility 来源的同步不显示通知
    watch(
      () => syncStore.isSyncing,
      (syncing) => {
        const source = syncStore.syncSource
        const silentSource = source === 'visibility'

        if (syncing) {
          dismissByKey('sync-error')
          if (!silentSource) {
            push({
              iconType: 'syncing',
              text: '正在同步中',
              subText: '请稍候…',
              persistent: true,
              key: 'syncing'
            })
          }
        } else {
          dismissByKey('syncing')
          if (silentSource) return

          if (syncStore.lastError) {
            push({
              iconType: 'warn',
              text: '同步失败',
              subText: syncStore.lastError,
              persistent: true,
              key: 'sync-error',
              actions: [
                {
                  key: 'retry',
                  label: '重试',
                  primary: true,
                  callback: () => syncStore.fullSync({ source: 'manual' }).catch(() => {})
                }
              ]
            })
          } else {
            push({
              iconType: 'success',
              text: '同步成功',
              subText: '数据已是最新',
              duration: 3500
            })
          }
        }
      },
      {}
    )

    if (!syncStore.syncNotice) return

    watch(
      () => syncStore.syncNotice,
      (notice) => {
        if (!notice?.id || notice.id === lastSyncNoticeId) return
        lastSyncNoticeId = notice.id

        // 同步结果通知已由 isSyncing watcher 统一处理，
        // 此处仅保留给未来可能的其他 notice 类型扩展
      },
      { deep: true }
    )
  }

  // ---- 3. OTA update watcher ----

  let lastWebUpdateReady = false
  let lastWebUpdateAvailableNotified = false

  function watchWebUpdate() {
    if (!webUpdateStore) return

    // 下载完成 → 自动重启更新
    watch(
      () => ({
        downloading: webUpdateStore.isDownloading,
        pendingId: webUpdateStore.pendingBundleId,
        pendingVersion: webUpdateStore.pendingVersion
      }),
      (curr) => {
        const isReady = !curr.downloading && !!curr.pendingId
        if (isReady && !lastWebUpdateReady) {
          // 下载完成，自动应用更新
          webUpdateStore.applyPendingUpdateNow()
        }
        lastWebUpdateReady = isReady
      },
      { immediate: true }
    )

    // 更新可用 → 弹 toast（覆盖静默/自动下载场景）
    watch(
      () => webUpdateStore.lastStatus,
      (status) => {
        if (status === 'available' && !lastWebUpdateAvailableNotified) {
          lastWebUpdateAvailableNotified = true
          push({
            iconType: 'update',
            text: '发现新版本',
            subText: webUpdateStore.latestVersion ? `v${webUpdateStore.latestVersion} 可用` : '有新的资源更新',
            duration: 10000,
            actions: [
              {
                key: 'detail',
                label: '查看详情',
                callback: () => router.push('/manage/about')
              },
              {
                key: 'download',
                label: '下载更新',
                primary: true,
                callback: () => {
                  webUpdateStore.downloadAndPrepareUpdate().catch(() => {})
                }
              }
            ]
          })
        }
        if (status === 'latest' || status === 'error') {
          lastWebUpdateAvailableNotified = false
        }
      }
    )
  }

  // ---- 4. APK update watcher ----

  let lastAppUpdateAvailableNotified = false

  function watchAppUpdate() {
    if (!appUpdateStore) return

    watch(
      () => appUpdateStore.lastStatus,
      (status) => {
        if (status === 'available' && !lastAppUpdateAvailableNotified) {
          lastAppUpdateAvailableNotified = true
          push({
            iconType: 'update',
            text: '发现新版本',
            subText: appUpdateStore.latestVersion ? `v${appUpdateStore.latestVersion} 可用` : '有新的应用更新',
            duration: 10000,
            actions: [
              {
                key: 'detail',
                label: '查看详情',
                callback: () => router.push('/manage/about')
              },
              {
                key: 'download',
                label: '下载更新',
                primary: true,
                callback: () => appUpdateStore.downloadAndInstallUpdate().catch(() => {})
              }
            ]
          })
        }
        if (status === 'latest' || status === 'error') {
          lastAppUpdateAvailableNotified = false
        }
      }
    )
  }

  // ---- lifecycle ----

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      checkDueReminders()
    }
  }

  function start() {
    if (pollTimer) return
    checkDueReminders()
    pollTimer = window.setInterval(checkDueReminders, 30000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    watchSync()
    watchWebUpdate()
    watchAppUpdate()
  }

  function stop() {
    if (pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  onUnmounted(stop)

  return {
    notifications,
    push,
    dismiss,
    dismissByKey,
    clearAll,
    start,
    stop
  }
}

function formatOffsetText(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  if (minutes % 1440 === 0) return `提前 ${minutes / 1440} 天`
  if (minutes % 60 === 0) return `提前 ${minutes / 60} 小时`
  return `提前 ${minutes} 分钟`
}

function formatSaleTime(value) {
  const date = parseSaleAt(value)
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
