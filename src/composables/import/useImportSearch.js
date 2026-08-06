import { nextTick } from 'vue'
import { useMihoyoGoodsSearch, normalizeSearchHintText } from '@/composables/import/useMihoyoGoodsSearch'

export { normalizeSearchHintText }

/**
 * 收藏导入搜索（ImportView 专属）：在共享搜索引擎之上，
 * 选中结果后自动填充 URL 并解析商品表单。
 */
export function useImportSearch({ setUrlInputValue, handleParse }) {
  const search = useMihoyoGoodsSearch()

  async function selectSearchResult(item) {
    if (!item?.goods_id) return

    search.selectSearchResult(item)
    setUrlInputValue(`https://www.mihoyogift.com/goods/${item.goods_id}`)
    await nextTick()
    await handleParse()
  }

  function shortenUrl(url) {
    try {
      const u = new URL(url)
      const path = u.pathname.split('/').filter(Boolean).join('/')
      return path.length > 38 ? path.slice(0, 38) + '…' : path
    } catch {
      return url.length > 38 ? url.slice(0, 38) + '…' : url
    }
  }

  return {
    ...search,
    selectSearchResult,
    shortenUrl,
  }
}