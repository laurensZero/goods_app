export const EVENT_LINKED_GOODS_PICKER_RESULT_KEY = 'goods-app:event-linked-goods-picker-result'

export function readEventLinkedGoodsPickerResult() {
  const raw = sessionStorage.getItem(EVENT_LINKED_GOODS_PICKER_RESULT_KEY)
  if (!raw) return null

  sessionStorage.removeItem(EVENT_LINKED_GOODS_PICKER_RESULT_KEY)

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.ids) ? parsed.ids.filter(Boolean) : null
  } catch {
    return null
  }
}

export function writeEventLinkedGoodsPickerResult(ids) {
  sessionStorage.setItem(EVENT_LINKED_GOODS_PICKER_RESULT_KEY, JSON.stringify({
    ids: Array.isArray(ids) ? ids.filter(Boolean) : []
  }))
}
