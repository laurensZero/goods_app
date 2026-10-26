import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

/**
 * 分片规整导入列表。
 *
 * 米游铺购物车/订单拉取回来后要「建导入上下文 + 逐条 resolve」。这一步在
 * 安卓 WebView 上可能几百毫秒到数秒；同步跑会把主线程占住，用户在这个窗口
 * 里切 tab 的点击只能排队，表现就是卡死/整页无响应。
 *
 * 这里统一做三件事：
 * 1. 首帧之后再建上下文，点击/切 tab 永远先被处理；
 * 2. 每处理一个 source（店铺/订单）检查 8ms 预算，超时立刻让出；
 * 3. 内嵌 tab 切走时暂停，切回从断点继续；卸载/重新拉取时取消旧任务。
 *
 * 结果只在全部完成时发布一次，避免分片过程中反复整表 diff/重绘。
 */
export function useChunkedImportPreparation({
  getSources,
  createContext,
  processSource,
  beforePublish = null,
  isActive = () => true,
  budgetMs = 8,
} = {}) {
  const result = ref([])
  const preparing = ref(false)
  const done = ref(false)

  let task = null
  let token = 0
  let running = false
  let runSeq = 0

  const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0))

  function reset() {
    token += 1
    runSeq += 1
    task = null
    running = false
    done.value = false
    preparing.value = false
    result.value = []
  }

  function cancel() {
    token += 1
    runSeq += 1
    task = null
    running = false
    preparing.value = false
  }

  async function run() {
    if (running) return
    if (!task) {
      const sources = getSources()
      if (!Array.isArray(sources) || sources.length === 0) {
        result.value = []
        done.value = true
        preparing.value = false
        return
      }
      task = {
        token,
        sources,
        context: null,
        index: 0,
        results: [],
      }
    }

    const current = task
    const runId = ++runSeq
    running = true
    preparing.value = true
    try {
      // 先让出一拍：列表首帧 / 切 tab 点击优先，不做同步大计算
      await yieldToMain()
      if (current.token !== token) return

      if (!current.context) current.context = createContext()

      let sliceStart = performance.now()
      while (current.index < current.sources.length) {
        if (current.token !== token) return
        if (!isActive()) {
          // 切走了：暂停并保留已算好的部分，切回继续
          preparing.value = false
          return
        }

        let processed = null
        try {
          processed = processSource(current.sources[current.index], current.context)
        } catch (error) {
          // 单条数据异常不应让整表永远停在「整理中」
          console.warn('[import] 规整失败，已跳过', error)
        }
        current.index += 1
        if (processed) current.results.push(processed)
        if (performance.now() - sliceStart >= budgetMs) {
          await yieldToMain()
          if (current.token !== token) return
          sliceStart = performance.now()
        }
      }

      // 全部完成才发布：一次赋值、一次渲染
      try {
        beforePublish?.(current.results)
      } catch (error) {
        // 发布前钩子（默认全选等）出错也不能把整表卡在「整理中」
        console.warn('[import] 发布前处理失败', error)
      }
      result.value = current.results
      done.value = true
      preparing.value = false
      task = null
    } finally {
      if (runId === runSeq) running = false
    }
  }

  function request() {
    if (!isActive()) return
    if (running) return
    if (!task && done.value) return

    const sources = getSources()
    if (!Array.isArray(sources) || sources.length === 0) {
      result.value = []
      done.value = true
      return
    }

    void run()
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(cancel)
  }

  return { result, preparing, done, request, reset, cancel }
}
