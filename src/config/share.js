/**
 * Share landing page URL configuration.
 *
 * The landing page (public/share.html) ships with the web build and is
 * served on the production domain:
 *   https://goodsapp.de5.net/share.html
 * (Cloudflare Pages pretty-URL may present it as /share with the same
 * query string.) The page is ~2KB, auto-redirects to goodsapp://, and
 * has a fallback for when the app isn't installed.
 *
 * The legacy gh-pages copy (laurenszero.github.io/goods_app/share.html)
 * stays online for previously shared links; new links use the domain above.
 */

export const SHARE_LANDING_URL = 'https://goodsapp.de5.net/share.html'

/**
 * Build the full share URL for a given shareId.
 * This https:// URL is clickable in WeChat/QQ and redirects to the app.
 */
export function buildShareUrl(shareId) {
  if (!shareId) return ''
  const params = new URLSearchParams({ s: shareId })
  return `${SHARE_LANDING_URL}?${params.toString()}`
}
