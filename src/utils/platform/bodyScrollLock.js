// @ts-check
// 多层 AppSheet 共用的 body 滚动锁；必须模块级共享 depth，否则嵌套开合会把 overflow 卡在 hidden
let depth = 0
let previousOverflow = ''

export function lockBodyScroll() {
  depth += 1
  if (depth === 1) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}

export function unlockBodyScroll() {
  depth = Math.max(0, depth - 1)
  if (depth === 0) {
    document.body.style.overflow = previousOverflow
    previousOverflow = ''
  }
}

/** 调试/异常恢复：强制解锁 */
export function resetBodyScrollLock() {
  depth = 0
  previousOverflow = ''
  document.body.style.overflow = ''
}

export function getBodyScrollLockDepth() {
  return depth
}
