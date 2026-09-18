import { describe, it, expect, beforeEach } from 'vitest'
import {
  lockBodyScroll,
  unlockBodyScroll,
  resetBodyScrollLock,
  getBodyScrollLockDepth
} from '../bodyScrollLock'

describe('bodyScrollLock', () => {
  beforeEach(() => {
    resetBodyScrollLock()
    document.body.style.overflow = ''
  })

  it('嵌套锁：后锁的 previous 不得读到已 hidden 的值，解锁顺序错乱也能恢复', () => {
    // 模拟：sheetA 打开 → sheetB 打开（同帧）→ sheetA 关闭 → sheetB 关闭
    lockBodyScroll() // A open
    expect(document.body.style.overflow).toBe('hidden')
    lockBodyScroll() // B open，共享 depth
    expect(getBodyScrollLockDepth()).toBe(2)
    unlockBodyScroll() // A close
    expect(getBodyScrollLockDepth()).toBe(1)
    expect(document.body.style.overflow).toBe('hidden')
    unlockBodyScroll() // B close
    expect(getBodyScrollLockDepth()).toBe(0)
    expect(document.body.style.overflow).toBe('')
  })
})
