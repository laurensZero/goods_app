// 勾选类控件没有「未提交的输入」可冲刷：它们的 change 由用户点击当场触发一次，
// 再补发一次等于把 toggle 执行两遍（时间线选件勾上后点保存会被还原）。
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio'])

export function flushActiveInput() {
  const activeElement = document.activeElement

  if (!activeElement || typeof activeElement.blur !== 'function') return false

  const tagName = activeElement.tagName
  const isTextInput =
    tagName === 'TEXTAREA' ||
    activeElement.isContentEditable === true ||
    (tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.has(String(activeElement.type || '').toLowerCase()))

  if (!isTextInput) return false

  activeElement.dispatchEvent(new Event('input', { bubbles: true }))
  activeElement.dispatchEvent(new Event('change', { bubbles: true }))
  activeElement.blur()
  return true
}

export async function commitActiveInput() {
  flushActiveInput()
  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
