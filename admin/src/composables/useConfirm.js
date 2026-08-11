import { reactive } from 'vue'

/**
 * 全局确认弹窗状态（模块级单例）。
 * 用法：
 *   const { confirm } = useConfirm()
 *   if (await confirm({ title, message, danger, confirmText })) { ... }
 * ConfirmHost 需挂载在 App.vue。
 */

const state = reactive({
  visible: false,
  title: '确认',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  resolve: null
})

export function useConfirm() {
  function confirm(options = {}) {
    return new Promise((resolve) => {
      state.title = options.title || '确认'
      state.message = options.message || ''
      state.confirmText = options.confirmText || '确定'
      state.cancelText = options.cancelText || '取消'
      state.danger = options.danger === true
      state.resolve = resolve
      state.visible = true
    })
  }

  function settle(result) {
    const resolve = state.resolve
    state.resolve = null
    state.visible = false
    if (resolve) resolve(result)
  }

  return { confirmState: state, confirm, settle }
}
