/**
 * 淘宝导入暂存队列：搜索结果 / 链接解析出的草稿先进队，逐件编辑保存。
 *
 * - 解析串行执行（SSR 详情页慢、有风控），失败项留在队列里可重试
 * - 同一 itemId 去重（重复入队返回已有条目）
 * - onReady / onFailed 回调供视图更新 Cookie 状态等副作用
 */
import { computed, ref } from 'vue'
import { extractTaobaoItemId } from '@/utils/taobao/detail'
import { fetchTaobaoDraft } from '@/utils/taobao/service'

export function useTaobaoQueue({ onReady, onFailed } = {}) {
  /** @type {import('vue').Ref<Array<{uid:string,itemId:string,input:string,status:'parsing'|'ready'|'failed',draft:any,error:Error|null,snapshot:any}>>} */
  const entries = ref([])
  let uidSeq = 0
  let pumping = false

  const count = computed(() => entries.value.length)

  function findByItemId(itemId) {
    const id = String(itemId || '')
    return id ? entries.value.find((entry) => entry.itemId === id) || null : null
  }

  /**
   * 入队一个待解析条目（input 为链接或裸 itemId）
   * @returns {{entry: object, duplicated: boolean}}
   */
  function enqueue(input, itemId = '') {
    const id = String(itemId || extractTaobaoItemId(input) || '')
    const existing = findByItemId(id)
    if (existing) return { entry: existing, duplicated: true }
    const entry = {
      uid: `tbq-${++uidSeq}`,
      itemId: id,
      input: String(input || id || ''),
      status: 'parsing',
      draft: null,
      error: null,
      snapshot: null,
    }
    entries.value = [...entries.value, entry]
    pump()
    return { entry, duplicated: false }
  }

  /** 串行泵：同一时刻只发一个详情请求 */
  async function pump() {
    if (pumping) return
    pumping = true
    try {
      for (;;) {
        const entry = entries.value.find((e) => e.status === 'parsing')
        if (!entry) break
        try {
          const draft = await fetchTaobaoDraft(entry.input)
          // await 期间条目可能已被 remove/clear：不得把结果写回幽灵条目并触发回调，
          // 否则清空队列后仍会被一条「幽灵完成」改写 Cookie 状态等视图副作用
          if (!entries.value.includes(entry)) continue
          entry.draft = draft
          entry.status = 'ready'
          onReady?.(entry)
        } catch (error) {
          if (!entries.value.includes(entry)) continue
          entry.error = error instanceof Error ? error : new Error(String(error))
          entry.status = 'failed'
          onFailed?.(entry)
        }
      }
    } finally {
      pumping = false
    }
  }

  /** 重试失败条目（非 failed 状态忽略） */
  function retry(uid) {
    const entry = entries.value.find((e) => e.uid === uid)
    if (!entry || entry.status !== 'failed') return
    entry.error = null
    entry.status = 'parsing'
    pump()
  }

  function remove(uid) {
    entries.value = entries.value.filter((e) => e.uid !== uid)
  }

  function clear() {
    entries.value = []
  }

  return { entries, count, findByItemId, enqueue, retry, remove, clear }
}
