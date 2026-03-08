export function syncFieldValue(target, key, event, options = {}) {
  if (!event?.target) return

  const { trim = false } = options
  const nextValue = `${event.target.value ?? ''}`
  target[key] = trim ? nextValue.trim() : nextValue
}

export function syncFieldValueNextFrame(target, key, event, options = {}) {
  requestAnimationFrame(() => {
    syncFieldValue(target, key, event, options)
  })
}
