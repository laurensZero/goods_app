/** AppSheet 全局 z 水位：后开的面板必须严格压住所有仍打开的面板 */
export const BASE_Z = 90
export const Z_STEP = 10

let topZ = BASE_Z
/** @type {Map<number, number>} claim token → z */
const openZ = new Map()
let seq = 0

function readOpenOverlayMax() {
  if (typeof document === 'undefined') return BASE_Z
  let maxOpen = BASE_Z
  const nodes = document.querySelectorAll('.app-sheet-overlay')
  for (const el of nodes) {
    const z = Number.parseInt(el.style.zIndex, 10)
    if (!Number.isFinite(z)) continue
    const hidden = el.style.visibility === 'hidden' && !el.querySelector('.app-sheet')
    if (hidden) continue
    if (z > maxOpen) maxOpen = z
  }
  return maxOpen
}

function currentOpenMax() {
  let maxOpen = readOpenOverlayMax()
  for (const z of openZ.values()) {
    if (z > maxOpen) maxOpen = z
  }
  return maxOpen
}

/**
 * 为一次打开分配 z。后开者严格高于所有仍打开的层（含显式 zIndex 父层）。
 * @param {number | null | undefined} explicitZ 调用方指定的 z；仍会抬高全局水位
 * @returns {{ token: number, z: number }}
 */
export function claimAppSheetZ(explicitZ) {
  const token = ++seq
  const maxOpen = currentOpenMax()
  let next
  if (explicitZ != null && Number.isFinite(explicitZ)) {
    // 显式 z 作为绝对下限，但不能低于已打开层，否则嵌套会盖不住/被盖住
    next = Math.max(explicitZ, maxOpen + Z_STEP)
  } else {
    next = Math.max(topZ, maxOpen, BASE_Z) + Z_STEP
  }
  topZ = next
  openZ.set(token, next)
  return { token, z: next }
}

/** @param {number | null | undefined} token */
export function releaseAppSheetZ(token) {
  if (token == null) return
  openZ.delete(token)
}

export function getAppSheetTopZ() {
  return topZ
}

/** 测试专用：清空水位与打开注册表 */
export function resetAppSheetZForTests() {
  topZ = BASE_Z
  openZ.clear()
  seq = 0
}
