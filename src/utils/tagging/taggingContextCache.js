import { watch, effectScope } from 'vue'
import { createCategoryKeywordAggregator } from './learnCategoryKeywords'

/**
 * 全应用共享的「商品列表 → 标签上下文」推导缓存。
 *
 * 背景：learnCategoryKeywords 的 n-gram 扫描与角色/标签提取对数千条收藏
 * 要几十到几百毫秒。原先 useSmartTagging 每个实例各算一份（导入页队列每
 * 展开一项就多一次全库扫描），且都在主线程同步跑，容易卡 UI。
 *
 * 现在按 goodsStore 单例共享，且对频繁更新做了节流 + 增量学习：
 * - goods/预设变化只标记脏并排一次防抖重建（安静 ~2.5s 后在空闲期静默重算），
 *   一段时间内的连续变更（同步拉取、批量导入等）只触发一次重算；
 * - 商品列表变化走增量聚合（syncList）：只对新增/改名/删除的商品重算 n-gram，
 *   未变商品零成本跳过；预设分类/角色（黑名单）变化时全量重建——角色名过滤
 *   已改为子串索引查询，全量也就十几毫秒，无需持久化复用旧聚合状态；
 * - 脏期间读取直接返回旧缓存，不阻塞；仅冷启动或缓存过旧（>30s）时同步兜底；
 * - 预热不随 App 启动做，由导入页 onMounted 调用 warmTaggingContext() 进页才算。
 */
const cacheByGoodsStore = new WeakMap()

const QUIET_MS = 2500
const MAX_STALE_MS = 30_000

// 商品稳定 key：优先业务 id（同步重拉后同 id 新对象可被增量跳过），退化用对象引用
const goodsKeyOf = (item) => (item?.id != null ? `id:${item.id}` : item)

function scanGoodsDerived(presetsStore, goodsStore) {
  const charMap = {}
  const extractedTags = new Set()

  if (presetsStore.characters?.length) {
    presetsStore.characters.forEach((c) => {
      if (!c?.name) return
      const ip = c.ip || 'unknown'
      if (!charMap[ip]) charMap[ip] = []
      charMap[ip].push(c.name)
    })
  }

  if (goodsStore?.list?.length) {
    goodsStore.list.forEach((item) => {
      if (item.tags && item.tags.length) {
        item.tags.forEach((t) => extractedTags.add(t))
      }
      if (item.characters && item.characters.length) {
        const ip = item.ip || 'unknown'
        if (!charMap[ip]) charMap[ip] = []
        item.characters.forEach((c) => {
          if (!charMap[ip].includes(c)) charMap[ip].push(c)
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
    dirty: true,
    lastBuildAt: 0,
    refreshTimer: 0,
    // 增量学习聚合器：冷启动/预设变化时全量重建，之后商品列表变化走增量同步
    agg: null,
    needsFullLearn: true,
  }
  cacheByGoodsStore.set(goodsStore, entry)

  const rebuild = () => {
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
        // 增量学习：只处理新增/改名/删除的商品，未变商品零成本跳过
        entry.agg.syncList(list, goodsKeyOf)
      }
      entry.learned = entry.agg.finalize()
      entry.lastBuildAt = Date.now()
      entry.dirty = false
    } catch {
      // 构建失败时保留旧缓存，标记仍脏等下次机会
      entry.dirty = true
    }
  }

  const scheduleRebuild = () => {
    entry.dirty = true
    if (entry.refreshTimer) return
    entry.refreshTimer = setTimeout(() => {
      entry.refreshTimer = 0
      // 静默重建：放到空闲期跑，避免占用主线程关键路径
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => rebuild(), { timeout: 5000 })
      } else {
        rebuild()
      }
    }, QUIET_MS)
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
    if (entry.dirty) {
      const staleTooLong = entry.lastBuildAt > 0 && Date.now() - entry.lastBuildAt >= MAX_STALE_MS
      if (!entry.derived || staleTooLong) rebuild()
    }
    return pick()
  }

  entry.getGoodsDerived = () => read(() => entry.derived)
  entry.getLearnedKeywords = () => read(() => entry.learned)
  entry.rebuildNow = rebuild
  return entry
}

/**
 * 静默预热：提前把共享推导算好，避免用户首次读取时在主线程上同步重扫。
 * 默认宽松（启动级）；进入页面时传较短 timeout，让重建尽快抢在首个读取前完成。
 * @returns {() => void} 取消尚未执行预热（页面已离开时用，避免抢占下一页面主线程）
 */
export function warmTaggingContext(presetsStore, goodsStore, { timeout = 8000 } = {}) {
  const run = () => {
    try {
      const entry = getSharedTaggingContext(presetsStore, goodsStore)
      if (entry.dirty) entry.rebuildNow()
    } catch {
      // 预热失败不影响后续懒计算
    }
  }
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout })
    return () => {
      try {
        cancelIdleCallback(id)
      } catch {
        // ignore
      }
    }
  }
  const id = setTimeout(run, Math.min(timeout, 300))
  return () => clearTimeout(id)
}
