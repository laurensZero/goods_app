export function setWindowScrollTop(top) {
  try { document.documentElement.scrollTop = top } catch {}
  try { document.body.scrollTop = top } catch {}
  try { window.scrollTo(0, top) } catch {}
}