/**
 * Share landing page URL configuration.
 *
 * The landing page (share.html) is deployed to gh-pages at:
 *   https://laurenszero.github.io/goods_app/share.html
 *
 * The page is ~2KB, auto-redirects to goodsapp://, and has a fallback
 * for when the app isn't installed.
 *
 * To use a custom domain or different hosting, change SHARE_BASE below.
 */

const SHARE_BASE = 'https://laurenszero.github.io/goods_app/share.html'

/**
 * Build the full share URL for a given gistId and shareId.
 * This https:// URL is clickable in WeChat/QQ and redirects to the app.
 */
export function buildShareUrl(gistId, shareId) {
  if (!gistId) return ''
  const params = new URLSearchParams({ g: gistId })
  if (shareId) {
    params.set('s', shareId)
  }
  return `${SHARE_BASE}?${params.toString()}`
}
