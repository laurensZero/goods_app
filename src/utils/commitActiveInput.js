export function flushActiveInput() {
  const activeElement = document.activeElement

  if (
    activeElement &&
    typeof activeElement.blur === 'function' &&
    (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    )
  ) {
    activeElement.dispatchEvent(new Event('input', { bubbles: true }))
    activeElement.dispatchEvent(new Event('change', { bubbles: true }))
    activeElement.blur()
    return true
  }

  return false
}

export async function commitActiveInput() {
  flushActiveInput()
  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
