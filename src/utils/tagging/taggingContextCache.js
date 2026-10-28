import { watch, effectScope } from 'vue'
import { createCategoryKeywordAggregator } from './learnCategoryKeywords'
import { createCategoryNeighborIndex } from './categoryNeighbors'

/**
 * 全应用共享的「商品列表 → 标签上下文」推导缓存。
 *
 * 背景：learnCategoryKeywords 的 n-gram 扫描与角色/标签提取对数千条收藏
 * 要几十到几百毫秒。原先 useSmartTagging 每个实例各算一份（导入页队列每
 * 展开一项就多一次全库扫描），且都在主线程同步跑，容易卡 UI。
 *
 * 现在按 goodsStore 单例共享，且对频繁更新做了节流 + 增量学习：
 * - goods/预设变化只标记脏并排一次重建，连续变更只触发一次；
 * - 商品列表变化走增量聚合（syncList）：只对新增/改名/删除的商品重算 n-gram，
 *   未变商品零成本跳过；预设分类/角色（黑名单）变化时全量重建；
 * - 重建按 ~8ms 分片，切页/点击永远能插进来，不再有一次性长任务；
 * - 导入链路使用 getLearnedKeywordsSnapshot()：冷启动/脏期间直接返回旧值
 *   并异步重建，绝不在导入主路径上同步全扫；
 * - 预热不随 App 启动做，由导入页 onMounted 调用 warmTaggingContext() 进页才算。
 */
const cacheByGoodsStore = new WeakMap()

const QUIET_MS = 2500
const MAX_STALE_MS = 30_000
const REBUILD_SLICE_MS = 8
// 冷启动快照必须是稳定引用：调用方（导入/上新上下文）会把它当缓存 key，
// 每次 new [] 会让缓存永远命中不了，等于每次都在主线程重扫全库。
const EMPTY_LEARNED_KEYWORDS = Object.freeze([])

// 商品稳定 key：优先业务 id（同步重拉后同 id 新对象可被增量跳过），退化用对象引用
const goodsKeyOf = (item) => (item?.id != null ? `id:${item.id}` : item)

function scanGoodsDerived(presetsStore, goodsStore) {
  const charMap = {}
  const charSets = {}
  const extractedTags = new Set()

  if (presetsStore.characters?.length) {
    presetsStore.characters.forEach((c) => {
      if (!c?.name) return
      const ip = c.ip || 'unknown'
      if (!charMap[ip]) {
        charMap[ip] = []
        charSets[ip] = new Set()
      }
      if (!charSets[ip].has(c.name)) {
        charSets[ip].add(c.name)
        charMap[ip].push(c.name)
      }
    })
  }

  if (goodsStore?.list?.length) {
    goodsStore.list.forEach((item) => {
      if (item.tags && item.tags.length) {
        item.tags.forEach((t) => extractedTags.add(t))
      }
      if (item.characters && item.characters.length) {
        const ip = item.ip || 'unknown'
        if (!charMap[ip]) {
          charMap[ip] = []
          charSets[ip] = new Set()
        }
        item.characters.forEach((c) => {
          if (!charSets[ip].has(c)) {
            charSets[ip].add(c)
            charMap[ip].push(c)
          }
        })
      }
    })
  }

  return { charMap, extractedTags }
}

export function getSharedTaggingContext(presetsStore, goodsStore) {
  let entry = cacheByGoodsStore.get(goodsStore)
  if (entry && entry.presets === presetsStore) return entry

  entry = {
    presets: presetsStore,
    derived: null,
    learned: null,
    // 相似商品分类索引：按需构建，商品/分类重建时作废
    categoryIndex: null,
    dirty: true,
    lastBuildAt: 0,
    refreshTimer: 0,
    building: false,
    buildToken: 0,
    // 增量学习聚合器：冷启动/预设变化时全量重建，之后商品列表变化走增量同步
    agg: null,
    needsFullLearn: true,
    // 首轮学习完成前挂起的等待者：供页面预热「导入上下文」时等标签稳定后再建，
    // 避免建完立刻因 learned 引用变化作废、把全库扫描又丢回点击路径。
    learnedWaiters: new Set(),
  }
  cacheByGoodsStore.set(goodsStore, entry)

  const resolveLearnedWaiters = () => {
    if (entry.learnedWaiters.size === 0) return
    const learned = entry.learned || EMPTY_LEARNED_KEYWORDS
    for (const resolve of entry.learnedWaiters) resolve(learned)
    entry.learnedWaiters.clear()
  }

  const finishBuild = (token, snapshot) => {
    if (token !== entry.buildToken) return
    try {
      entry.learned = entry.agg.finalize()
      entry.lastBuildAt = Date.now()
    } catch {
      entry.dirty = true
      entry.needsFullLearn = true
    } finally {
      entry.building = false
      resolveLearnedWaiters()
    }

    const listChanged = goodsStore?.list !== snapshot.list
      || (goodsStore?.list?.length || 0) !== snapshot.length
    const presetsChanged = presetsStore.characters !== snapshot.characters
      || presetsStore.categories !== snapshot.categories
    if (presetsChanged) entry.needsFullLearn = true
    if (listChanged || presetsChanged || entry.dirty) {
      entry.dirty = true
      scheduleRebuild()
    } else {
      entry.dirty = false
    }
  }

  const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0))

  const runChunkedBuild = async () => {
    if (entry.building) return
    if (entry.refreshTimer) {
      clearTimeout(entry.refreshTimer)
      entry.refreshTimer = 0
    }

    entry.building = true
    entry.dirty = false
    // 商品/分类可能要变了，先丢掉旧的相似度索引，下次查询时重建
    entry.categoryIndex = null
    const token = ++entry.buildToken
    const snapshot = {
      list: goodsStore?.list,
      length: goodsStore?.list?.length || 0,
      characters: presetsStore.characters,
      categories: presetsStore.categories,
    }
    const list = Array.isArray(snapshot.list) ? snapshot.list : []

    try {
      entry.derived = scanGoodsDerived(presetsStore, goodsStore)
    } catch {
      // 保留旧 derived，继续尝试学习
    }

    try {
      const full = entry.needsFullLearn || !entry.agg
      if (full) {
        entry.agg = createCategoryKeywordAggregator({
          categories: snapshot.categories || [],
          characters: snapshot.characters || [],
        })
        entry.agg.rebuild([], goodsKeyOf)
      } else {
        // 增量同步也分片：批量导入时可能一次新增几百条，n-gram 全算同样是长任务。
        // 先 O(N) 收集 key（很轻），再按 8ms 预算逐条 syncEntry；最后分片清理失效项。
        const presentKeys = new Set()
        const seenRefs = new Set()
        const queue = []
        for (let index = 0; index < list.length; index += 1) {
          const item = list[index]
          if (!item || seenRefs.has(item)) continue
          seenRefs.add(item)
          const key = goodsKeyOf(item)
          presentKeys.add(key)
          queue.push({ key, item })
        }

        let index = 0
        while (index < queue.length) {
          if (token !== entry.buildToken) return
          const sliceStart = performance.now()
          while (index < queue.length && performance.now() - sliceStart < REBUILD_SLICE_MS) {
            entry.agg.syncEntry(queue[index].key, queue[index].item)
            index += 1
          }
          if (index < queue.length) await yieldToMain()
        }

        const staleKeys = entry.agg.keys().filter((key) => !presentKeys.has(key))
        for (let i = 0; i < staleKeys.length; i += 1) {
          if (token !== entry.buildToken) return
          entry.agg.removeKey(staleKeys[i])
          if (i % 500 === 499) await yieldToMain()
        }

        finishBuild(token, snapshot)
        return
      }

      // 全量重建：逐条 upsert，每 ~8ms 让出主线程
      let index = 0
      while (index < list.length) {
        if (token !== entry.buildToken) return
        const sliceStart = performance.now()
        while (index < list.length && performance.now() - sliceStart < REBUILD_SLICE_MS) {
          const item = list[index]
          entry.agg.upsertKey(goodsKeyOf(item), item)
          index += 1
        }
        if (index < list.length) {
          await yieldToMain()
        }
      }

      // 全部 upsert 完才允许走增量；中途取消/异常时下次仍全量分片重建，
      // 避免拿半成品聚合器做一次同步 syncList 把主线程又卡住。
      entry.needsFullLearn = false
      finishBuild(token, snapshot)
    } catch {
      if (token === entry.buildToken) {
        entry.building = false
        entry.dirty = true
        entry.needsFullLearn = true
        scheduleRebuild()
      }
      // 构建失败也要 settle，否则预热导入上下文的 Promise 会一直挂着
      resolveLearnedWaiters()
    }
  }

  const scheduleRebuild = (delay = QUIET_MS) => {
    entry.dirty = true
    if (entry.building) return
    if (entry.refreshTimer) {
      // 读取方要求尽快重建时，把静默防抖提前
      if (delay !== 0) return
      clearTimeout(entry.refreshTimer)
      entry.refreshTimer = 0
    }
    entry.refreshTimer = setTimeout(() => {
      entry.refreshTimer = 0
      void runChunkedBuild()
    }, delay)
  }

  const rebuildNowSync = () => {
    // 取消排队/进行中的分片重建，改为一次性同步算完（仅编辑器等必须同步的读取方使用）
    entry.buildToken += 1
    entry.building = false
    entry.categoryIndex = null
    if (entry.refreshTimer) {
      clearTimeout(entry.refreshTimer)
      entry.refreshTimer = 0
    }
    try {
      entry.derived = scanGoodsDerived(presetsStore, goodsStore)
      const list = goodsStore?.list || []
      if (!entry.agg || entry.needsFullLearn) {
        entry.agg = createCategoryKeywordAggregator({
          categories: presetsStore.categories || [],
          characters: presetsStore.characters || [],
        })
        entry.agg.rebuild(list, goodsKeyOf)
        entry.needsFullLearn = false
      } else {
        entry.agg.syncList(list, goodsKeyOf)
      }
      entry.learned = entry.agg.finalize()
      entry.lastBuildAt = Date.now()
      entry.dirty = false
    } catch {
      // 构建失败时保留旧缓存，标记仍脏等下次机会
      entry.dirty = true
    }
    resolveLearnedWaiters()
  }

  // 浅层失效信号：list 引用替换 / 长度增减 / 预设角色、分类变化。
  // 故意不 deep watch 整个列表——频繁变更只登记一次，防抖后统一增量同步。
  // 预设角色/分类是 n-gram 黑名单，变了没有增量路径，需全量重建。
  // 用 detached effectScope：entry 可能在组件生命周期内创建，但缓存是
  // 应用级的，watch 不能随创建组件卸载而停止（detached=true 不收编任何组件）
  const watchScope = effectScope(true)
  let watchedCharacters = presetsStore.characters
  let watchedCategories = presetsStore.categories
  watchScope.run(() =>
    watch(
      () => [
        goodsStore?.list,
        goodsStore?.list?.length,
        presetsStore.characters,
        presetsStore.categories,
      ],
      () => {
        if (
          presetsStore.characters !== watchedCharacters ||
          presetsStore.categories !== watchedCategories
        ) {
          watchedCharacters = presetsStore.characters
          watchedCategories = presetsStore.categories
          entry.needsFullLearn = true
        }
        scheduleRebuild()
      }
    )
  )

  // 读取入口：冷启动同步算一次；脏但仍有旧缓存时直接返回旧值（重算已排期）
  const read = (pick) => {
    if (entry.building) return pick()
    if (entry.dirty) {
      const staleTooLong = entry.lastBuildAt > 0 && Date.now() - entry.lastBuildAt >= MAX_STALE_MS
      if (!entry.derived || staleTooLong) rebuildNowSync()
    }
    return pick()
  }

  entry.getGoodsDerived = () => read(() => entry.derived)
  entry.getLearnedKeywords = () => read(() => entry.learned)

  // 相似商品分类索引：首次查询时同步构建，之后复用；重建学习词时上面已置空
  entry.getCategoryNeighborIndex = () => {
    if (!entry.categoryIndex) {
      entry.categoryIndex = createCategoryNeighborIndex(goodsStore?.list || [])
    }
    return entry.categoryIndex
  }

  /**
   * 导入链路专用：绝不同步全扫。
   * 冷启动/脏期间返回现有快照（可能为空），并把分片重建排到下一拍。
   * 这样购物车/订单规整不会因为标签学习在主线程上停住。
   */
  entry.getLearnedKeywordsSnapshot = () => {
    const staleTooLong = entry.lastBuildAt > 0 && Date.now() - entry.lastBuildAt >= MAX_STALE_MS
    if (entry.dirty || staleTooLong) scheduleRebuild(0)
    return entry.learned || EMPTY_LEARNED_KEYWORDS
  }

  /**
   * 等待首轮标签学习完成（已完成后立即返回）。
   * 页面预热导入上下文时先 await 它，保证上下文只建一次。
   * 分片重建失败或同步重建接管时也会 resolve，不会把调用方永久挂住。
   * eager=false 时由调用方负责排队重建（如 warmTaggingContext 的空闲预热），
   * 避免进页第一帧就和列表渲染抢主线程。
   */
  entry.waitForLearned = ({ eager = true } = {}) => {
    if (entry.learned || entry.lastBuildAt > 0) {
      return Promise.resolve(entry.learned || EMPTY_LEARNED_KEYWORDS)
    }
    if (eager && !entry.building && !entry.refreshTimer) scheduleRebuild(0)
    return new Promise((resolve) => {
      entry.learnedWaiters.add(resolve)
    })
  }

  entry.rebuildNow = rebuildNowSync
  entry.scheduleRebuild = scheduleRebuild
  return entry
}

/**
 * 静默预热：提前把共享推导算好，避免用户首次读取时在主线程上同步重扫。
 * 默认宽松（启动级）；进入页面时传较短 timeout，让分片重建尽快开始。
 * @returns {() => void} 取消尚未开始的重建（页面已离开时用）
 */
export function warmTaggingContext(presetsStore, goodsStore, { timeout = 8000 } = {}) {
  const entry = getSharedTaggingContext(presetsStore, goodsStore)
  if (!entry.dirty && entry.learned) return () => {}

  let cancelled = false
  let timer = 0
  const start = () => {
    timer = 0
    if (cancelled) return
    // 空闲回调真正执行时，别的读取方（如 waitForLearned）可能已经触发或完成了重建：
    // 此时再排一轮只会白白多跑一次全量/增量聚合，直接跳过。
    if (entry.building || (entry.learned && !entry.dirty)) return
    entry.scheduleRebuild(0)
  }

  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(start, { timeout })
    return () => {
      cancelled = true
      try {
        cancelIdleCallback(id)
      } catch {
        // ignore
      }
    }
  }

  timer = setTimeout(start, Math.min(timeout, 300))
  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
