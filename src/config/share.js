/**
 * Share landing page URL configuration.
 *
 * The landing page (share.html) is deployed to gh-pages at:
 *   https://laurenszero.github.io/goods_app/share.html
 *
 * The page is ~2KB, auto-redirects to goodsapp://, and has a fallback
 * for when the app isn't installed.
 */

export const SHARE_LANDING_URL = 'https://laurenszero.github.io/goods_app/share.html'

/**
 * Build the full share URL for a given shareId.
 * This https:// URL is clickable in WeChat/QQ and redirects to the app.
 */
export function buildShareUrl(shareId) {
  if (!shareId) return ''
  const params = new URLSearchParams({ s: shareId })
  return `${SHARE_LANDING_URL}?${params.toString()}`
}
