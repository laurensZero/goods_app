export function resizeTextarea(textarea) {
  if (!textarea || typeof textarea !== 'object') return
  if (typeof textarea.style === 'undefined' || typeof textarea.scrollHeight !== 'number') return

  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}