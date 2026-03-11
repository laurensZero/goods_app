import { ref } from 'vue'
import { useGoodsStore } from '@/stores/goods'

/**
 * 预设删除二次确认逻辑
 * @param {Object} options
 * @param {(list: any[], name: string) => any[]} options.getAffected - 过滤出受影响的谷子
 * @param {(item: any, name: string) => any} options.patch - 返回清空字段后的谷子对象
 * @param {(name: string) => Promise<void>} options.removePreset - 调用 store 删除预设
 */
export function usePresetDelete({ getAffected, patch, removePreset }) {
  const store = useGoodsStore()

  const showDeleteConfirm = ref(false)
  const pendingDeleteName = ref('')
  const affectedCount = ref(0)

  async function tryRemove(name) {
    const affected = getAffected(store.list, name)
    if (affected.length > 0) {
      pendingDeleteName.value = name
      affectedCount.value = affected.length
      showDeleteConfirm.value = true
      return
    }
    await removePreset(name)
  }

  async function confirmDelete() {
    showDeleteConfirm.value = false
    const name = pendingDeleteName.value
    const affected = getAffected(store.list, name)
    for (const item of affected) {
      await store.updateGoods(item.id, patch(item, name))
    }
    await removePreset(name)
    pendingDeleteName.value = ''
    affectedCount.value = 0
  }

  return { showDeleteConfirm, pendingDeleteName, affectedCount, tryRemove, confirmDelete }
}
