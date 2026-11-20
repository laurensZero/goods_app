// @ts-check
/**
 * 评论装扮气泡的每页配置（Pinia store）。
 *
 * 五个 tab 页（home/wishlist/events/recharge/my）各自可在主面板右上角挂一个气泡。
 * 整体一个对象存五个 key（别拆成五条 metadata），云端存
 * `user_metadata.mhy_bubbles`（JSON 字符串），本地镜像 `goods_mhy_bubbles`。
 *
 * 读取优先级与 mhy_pendant 一致：
 * - 云端非 undefined（设过）→ 整体以云端为准；某页 key 缺失或显式 null = 那一页已被清空；
 * - 云端 undefined（从没设过）→ 退本地缓存。
 *
 * 本地即写即生效；登录用户再同步云端做多端传播。跨端拉取复用 authStore.refreshUser()
 * 链路（MyView 挂载已有一次；其余页面挂载时若已登录且本地无配置，走模块级 10s 限频
 * 拉一次——五个页面先后挂载只打一次请求，别每页都打）。
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { readPersisted, writePersisted } from '@/utils/platform/storage'

const LOCAL_KEY = 'goods_mhy_bubbles'

/** 可挂气泡的页面 key，与各 tab 页主面板一一对应 */
export const MHY_BUBBLE_PAGES = Object.freeze(['home', 'wishlist', 'events', 'recharge', 'my'])

/** 跨端拉取限频窗口：挂载与登录态 watch 常在同一次 init 里先后触发 */
const USER_SYNC_MIN_INTERVAL_MS = 10_000
// 模块级时间戳：限频窗口跨页面共享（Home/Wishlist/Events/Recharge 先后挂载只打一次）
let lastUserSyncAt = 0

/**
 * 解析单页存的气泡紧凑项，坏数据一律当无气泡。
 * 字段含义见 services/mhyDecor/bubbles.js 的 BubbleItem。
 * @param {any} raw
 */
export function parseBubbleCompact(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.i || !raw.u) return null
  return {
    i: String(raw.i),
    s: raw.s === 'hoyolab' ? 'hoyolab' : 'miyoushe',
    g: String(raw.g || ''),
    n: String(raw.n || ''),
    d: String(raw.d || ''),
    u: String(raw.u),
    bg: String(raw.bg || ''),
    gif: String(raw.gif || ''),
    a: raw.a === true,
    m: String(raw.m || ''),
    t: String(raw.t || '')
  }
}

/**
 * 解析整体配置（字符串 JSON 或已解析对象）→ { [pageKey]: item|null }。
 * raw 为 null（显式清空）/undefined（没设过）时返回 null，由调用方决定回退行为。
 * @param {any} raw
 * @returns {Record<string, import('@/services/mhyDecor/bubbles').BubbleItem | null> | null}
 */
export function parseBubbleConfig(raw) {
  if (raw == null) return null
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object') return null
  /** @type {Record<string, any>} */
  const out = {}
  for (const key of MHY_BUBBLE_PAGES) {
    // key 缺失与显式 null 同义：那一页没挂/已清空
    out[key] = parseBubbleCompact(obj[key])
  }
  return out
}

function emptyConfig() {
  /** @type {Record<string, any>} */
  const out = {}
  for (const key of MHY_BUBBLE_PAGES) out[key] = null
  return out
}

export const useMhyBubblesStore = defineStore('mhyBubbles', () => {
  const authStore = useAuthStore()

  /** @type {{ [K in typeof MHY_BUBBLE_PAGES[number]]: import('@/services/mhyDecor/bubbles').BubbleItem | null }} */
  const byPage = ref(emptyConfig())
  /** 本会话是否已完成首次收敛（restore 只做一次，后续靠 metadata watch 跟进） */
  const restored = ref(false)
  /** 是否已有权威配置在手（云端设过，或本地缓存有内容）——「缓存为空」判定用 */
  const hasAuthoritativeConfig = ref(false)

  /** 把收敛好的配置写进状态；mirror=true 时同步本地镜像（登出/离线启动也有得用） */
  async function applyConfig(config, { mirror = true } = {}) {
    byPage.value = config || emptyConfig()
    if (mirror) {
      try {
        await writePersisted(LOCAL_KEY, JSON.stringify(byPage.value))
      } catch { /* 镜像写失败不影响本次展示 */ }
    }
  }

  /**
   * 收敛气泡配置来源：云端设过就用云端（并镜像回本地），否则退本地缓存。
   * watch user_metadata.mhy_bubbles（immediate）触发：登录态/多端变更都会重新收敛。
   */
  async function restore() {
    restored.value = true
    const cloudRaw = authStore.user?.user_metadata?.mhy_bubbles
    if (cloudRaw !== undefined) {
      // 云端设过（哪怕全 null）：整体以云端为准，不必再拉 user
      hasAuthoritativeConfig.value = true
      await applyConfig(parseBubbleConfig(cloudRaw))
      return
    }
    let localRaw = null
    try {
      localRaw = await readPersisted(LOCAL_KEY)
    } catch { localRaw = null }
    const config = parseBubbleConfig(localRaw)
    hasAuthoritativeConfig.value = !!config && Object.values(config).some(Boolean)
    await applyConfig(config, { mirror: false })
  }

  watch(
    () => authStore.user?.user_metadata?.mhy_bubbles,
    () => { void restore() },
    { immediate: true }
  )

  /**
   * 页面挂载入口：确保配置已收敛；已登录且本地无配置时拉一次最新 user，
   * 让其他端设的气泡尽快落到本机（模块级限频，10s 窗口只打一次）。
   * @param {string} [pageKey]
   */
  async function ensureLoaded(pageKey) {
    void pageKey
    if (!restored.value) await restore()
    maybeSyncCloudUser()
  }

  function maybeSyncCloudUser() {
    if (!authStore.isLoggedIn) return
    // 已有权威配置（云端设过或本地有内容）就不白打请求；
    // MyView 的挂件链路已覆盖登录时机，这里只补「本地为空」的其余页面
    if (hasAuthoritativeConfig.value) return
    const now = Date.now()
    if (now - lastUserSyncAt < USER_SYNC_MIN_INTERVAL_MS) return
    lastUserSyncAt = now
    void authStore.refreshUser()
  }

  /**
   * 设置某页气泡（item=null 清空该页）。本地即写即生效；登录用户同步云端，
   * 返回云端同步 Promise（未登录时为已 resolve），宿主据此弹保存失败 toast。
   * @param {string} pageKey
   * @param {import('@/services/mhyDecor/bubbles').BubbleItem | null} item
   */
  function setPage(pageKey, item) {
    if (!MHY_BUBBLE_PAGES.includes(pageKey)) return Promise.resolve(null)
    byPage.value = { ...byPage.value, [pageKey]: item }
    // 本地缓存整体一个对象存五个 key
    writePersisted(LOCAL_KEY, JSON.stringify(byPage.value)).catch(() => {})
    if (!authStore.isLoggedIn) return Promise.resolve(null)
    // 清空某页也写回整体对象（该页为显式 null），其他端能识别出「已清空」
    return authStore.updateProfile({ mhy_bubbles: JSON.stringify(byPage.value) })
  }

  return { byPage, restored, hasAuthoritativeConfig, restore, ensureLoaded, setPage }
})
