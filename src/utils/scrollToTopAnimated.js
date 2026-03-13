export function scrollToTopAnimated(target, duration = 260, onComplete = null, preferredSource = 'auto') {
  const element = typeof target === 'function' ? target() : target
  const elementStartTop = Number(element?.scrollTop || 0)
  const windowStartTop = Number(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
  const source = preferredSource === 'element' || preferredSource === 'window'
    ? preferredSource
    : (elementStartTop > windowStartTop ? 'element' : 'window')
  const startTop = source === 'element' ? elementStartTop : windowStartTop

  if (startTop <= 0) {
    window.requestAnimationFrame(() => onComplete?.())
    return
  }

  const startTime = performance.now()

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

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

  const frame = (now) => {
    const progress = Math.min(1, (now - startTime) / duration)
    const nextTop = Math.round(startTop * (1 - easeOutCubic(progress)))
    setTop(nextTop)

    if (progress < 1) {
      window.requestAnimationFrame(frame)
      return
    }

    setTop(0)
    window.requestAnimationFrame(() => onComplete?.())
  }

  window.requestAnimationFrame(frame)
}
