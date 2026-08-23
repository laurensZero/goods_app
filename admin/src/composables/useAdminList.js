import { ref } from 'vue'

/**
 * 管理台统一列表状态机。
 *
 * @param {Object} options
 * @param {Function} options.loader  加载函数，接收 ({ keyword, page, pageSize, reset }) 返回 Promise<Array>
 * @param {number} [options.pageSize] 每页数量，0 = 不分页一次全量
 * @param {string} [options.emptyText] 空列表文案
 * @param {boolean} [options.showLoadStatus] 重置加载成功后是否写入「共 N 条」状态；
 *                                           自带统计展示的分区可关闭以避免重复
 * @returns
 *  - items       列表数据
 *  - loading     加载中
 *  - status      { text, type }
 *  - keyword     搜索关键词（v-model）
 *  - hasMore     是否还有下一页
 *  - setStatus   手动设置状态
 *  - load()      首次/重置加载
 *  - loadMore()  加载下一页（追加）
 *  - reset()     清空并重新加载
 *  - setItems()  外部直接替换列表（如局部更新后）
 */
export function useAdminList({ loader, pageSize = 0, emptyText = '暂无数据', showLoadStatus = true }) {
  const items = ref([])
  const loading = ref(false)
  const keyword = ref('')
  const page = ref(1)
  const hasMore = ref(false)
  const status = ref({ text: '', type: 'default' })

  function setStatus(text, type = 'default') {
    status.value = { text, type }
  }

  async function fetchPage({ reset = false } = {}) {
    if (loading.value) return
    loading.value = true
    const targetPage = reset ? 1 : page.value
    try {
      const batch = await loader({
        keyword: keyword.value,
        page: targetPage,
        pageSize,
        reset
      })
      const list = Array.isArray(batch) ? batch : []
      items.value = reset ? list : [...items.value, ...list]
      page.value = targetPage + 1
      if (pageSize > 0) {
        hasMore.value = list.length >= pageSize
      } else {
        hasMore.value = false
      }
      if (reset && showLoadStatus) {
        setStatus(list.length ? `共 ${list.length} 条。` : emptyText, list.length ? 'ok' : 'default')
      }
      return list
    } catch (e) {
      if (reset) items.value = []
      setStatus(e?.message || '加载失败。', 'error')
      return []
    } finally {
      loading.value = false
    }
  }

  async function load() {
    return fetchPage({ reset: true })
  }

  async function loadMore() {
    return fetchPage({ reset: false })
  }

  async function reset() {
    items.value = []
    page.value = 1
    hasMore.value = false
    return load()
  }

  function setItems(list) {
    items.value = Array.isArray(list) ? list : []
    setStatus(`共 ${items.value.length} 条。`, 'ok')
  }

  return {
    items,
    loading,
    status,
    keyword,
    hasMore,
    setStatus,
    load,
    loadMore,
    reset,
    setItems
  }
}
