export function scrollToTopAnimated(target, duration = 260, onComplete = null, preferredSource = 'auto') {
  const element = typeof target === 'function' ? target() : target
  const elementStartTop = Number(element?.scrollTop || 0)
  const windowStartTop = Number(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
  const source = preferredSource === 'element' || preferredSource === 'window'
    ? preferredSource
    : (elementStartTop > windowStartTop ? 'element' : 'window')
  const startTop = source === 'element' ? elementStartTop : windowStartTop

  const setTop = (top) => {
    if (source === 'element' && element) {
      element.scrollTop = top
    }
    if (source === 'window' || !element) {
      try { document.documentElement.scrollTop = top } catch {}
      try { document.body.scrollTop = top } catch {}
      try { window.scrollTo(0, top) } catch {}
    }
  }

  if (startTop <= 0) {
    window.requestAnimationFrame(() => onComplete?.())
    return
  }

  setTop(0)
  window.requestAnimationFrame(() => onComplete?.())
}
