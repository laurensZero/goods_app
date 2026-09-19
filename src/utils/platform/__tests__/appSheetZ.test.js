import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  BASE_Z,
  Z_STEP,
  claimAppSheetZ,
  releaseAppSheetZ,
  getAppSheetTopZ,
  resetAppSheetZForTests
} from '../appSheetZ'

describe('appSheetZ', () => {
  beforeEach(() => {
    resetAppSheetZForTests()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    resetAppSheetZForTests()
    document.body.innerHTML = ''
  })

  it('首次打开分配 BASE_Z + STEP', () => {
    const { z } = claimAppSheetZ()
    expect(z).toBe(BASE_Z + Z_STEP)
  })

  it('后打开的嵌套层严格高于父层', () => {
    const parent = claimAppSheetZ()
    const child = claimAppSheetZ()
    expect(child.z).toBeGreaterThan(parent.z)
  })

  it('多层嵌套（组文件夹 → 编辑 → 封面选择）单调递增', () => {
    const folder = claimAppSheetZ()
    const edit = claimAppSheetZ()
    const cover = claimAppSheetZ()
    expect(edit.z).toBeGreaterThan(folder.z)
    expect(cover.z).toBeGreaterThan(edit.z)
  })

  it('显式 zIndex 父层打开后，水位子层仍高于父层', () => {
    const parent = claimAppSheetZ(2500)
    expect(parent.z).toBe(2500)
    const child = claimAppSheetZ()
    expect(child.z).toBeGreaterThan(parent.z)
    expect(getAppSheetTopZ()).toBeGreaterThanOrEqual(child.z)
  })

  it('显式 zIndex 也不会低于已打开的更高层', () => {
    const high = claimAppSheetZ(3000)
    const explicitLower = claimAppSheetZ(1200)
    expect(explicitLower.z).toBeGreaterThan(high.z)
  })

  it('父层关闭再开时，若子层仍打开则父层不会反压子层之下以外的情况——后开者在上', () => {
    const parent = claimAppSheetZ()
    const child = claimAppSheetZ()
    releaseAppSheetZ(parent.token)
    const parentReopen = claimAppSheetZ()
    // 后开的父层会抬高，这是「后开在上」语义；子层若需在上应保持打开且晚于父层 claim
    expect(parentReopen.z).toBeGreaterThan(child.z)
  })

  it('DOM 中仍可见的 overlay 会参与水位（注册表遗漏时的兜底）', () => {
    const shell = document.createElement('div')
    shell.className = 'app-sheet-overlay'
    shell.style.zIndex = '800'
    shell.style.visibility = 'visible'
    const panel = document.createElement('div')
    panel.className = 'app-sheet'
    shell.appendChild(panel)
    document.body.appendChild(shell)

    const next = claimAppSheetZ()
    expect(next.z).toBeGreaterThan(800)
  })

  it('已隐藏且无面板的 overlay 不参与水位', () => {
    const shell = document.createElement('div')
    shell.className = 'app-sheet-overlay'
    shell.style.zIndex = '5000'
    shell.style.visibility = 'hidden'
    document.body.appendChild(shell)

    const next = claimAppSheetZ()
    expect(next.z).toBe(BASE_Z + Z_STEP)
  })

  it('release 后不再占用注册表，但 topZ 保持单调', () => {
    const a = claimAppSheetZ()
    releaseAppSheetZ(a.token)
    const b = claimAppSheetZ()
    expect(b.z).toBeGreaterThan(a.z)
  })

  it('QQ 绑定场景：账号管理先开，QQ 绑定后开必在上', () => {
    const accountManage = claimAppSheetZ()
    const qqBinding = claimAppSheetZ()
    expect(qqBinding.z).toBeGreaterThan(accountManage.z)
  })
})
