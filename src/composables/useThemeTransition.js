import { useThemeStore } from '@/stores/theme'

/**
 * Composable that wraps appearance toggling with View Transitions API
 * to produce a circular-reveal animation radiating from the click origin.
 *
 * Falls back to an instant swap when:
 *  - View Transitions API is unavailable
 *  - User has `prefers-reduced-motion: reduce` enabled
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

let transitionOrigin = { x: '50%', y: '50%' }

function getReducedMotion() {
  if (typeof window === 'undefined') return true
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * Record the click/touch coordinates so the CSS animation can use them.
 * Call this from the triggering element's @pointerdown (fires before @click).
 */
export function captureTransitionOrigin(event) {
  const rect = event.currentTarget?.getBoundingClientRect?.()
  const x = event.clientX ?? (rect ? rect.left + rect.width / 2 : window.innerWidth / 2)
  const y = event.clientY ?? (rect ? rect.top + rect.height / 2 : window.innerHeight / 2)

  transitionOrigin = { x: `${x}px`, y: `${y}px` }

  // Push coordinates into CSS custom properties on <html> so the animation
  // keyframes can reference them via `var(--vt-x)` / `var(--vt-y)`.
  const root = document.documentElement
  root.style.setProperty('--vt-x', transitionOrigin.x)
  root.style.setProperty('--vt-y', transitionOrigin.y)
}

/**
 * Toggle the appearance (light ↔ dark) with the circular-reveal transition.
 * If the theme doesn't support appearance control, this is a no-op.
 *
 * @param {string} [nextAppearance] – 'light' | 'dark'. When omitted, toggles
 *   the opposite of the current resolved appearance.
 */
export function toggleAppearanceWithTransition(nextAppearance) {
  const themeStore = useThemeStore()

  if (!themeStore.canCustomizeAppearance) return

  const target = nextAppearance
    || (themeStore.appliedAppearance === 'dark' ? 'light' : 'dark')

  // Skip animation when reduced motion is preferred or API is missing
  if (getReducedMotion() || typeof document.startViewTransition !== 'function') {
    themeStore.setAppearancePreference(target)
    return
  }

  // Wrap the store mutation inside a View Transition.
  // The browser snapshots the current frame, we mutate the DOM, then the
  // browser composites old → new using our CSS animation.
  // Fire-and-forget: do NOT await transition.finished, otherwise the click
  // handler blocks for the full animation duration and the button feels stuck.
  document.startViewTransition(async () => {
    await themeStore.setAppearancePreference(target)
  })
}

/**
 * Convenience: check whether the current theme supports light/dark toggling.
 */
export function canToggleAppearance() {
  const themeStore = useThemeStore()
  return themeStore.canCustomizeAppearance
}
