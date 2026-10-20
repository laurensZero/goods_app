/**
 * ref 的前缀与拆解（无依赖）。
 *
 * 单独成文件是为了避开循环引用：
 *   - `utils/goods/images.js`（显示 / 归一化 / 同步序列化）需要认 ref
 *   - `utils/image/ref.js`（迁移规则）又要用 images.js 里的 uri 解析
 * 两边都引用这个文件即可，本文件不 import 任何东西。
 *
 * 规则本身（哪个 uri 归约成哪类 ref）仍只在 ref.js 里定义一次。
 */

export const CLOUD_REF_PREFIX = 'cloud:'
export const REMOTE_REF_PREFIX = 'remote:'
export const LOCAL_REF_PREFIX = 'local:'

/** @type {ReadonlyArray<'cloud'|'remote'|'local'>} */
export const REF_KINDS = Object.freeze(['cloud', 'remote', 'local'])

/**
 * 拆解 ref。
 * @param {string} ref
 * @returns {{ kind: 'cloud'|'remote'|'local', value: string } | null}
 */
export function parseRef(ref) {
  const value = String(ref || '').trim()
  if (!value) return null
  for (const kind of REF_KINDS) {
    const prefix = `${kind}:`
    if (value.startsWith(prefix)) {
      const inner = value.slice(prefix.length)
      return inner ? { kind, value: inner } : null
    }
  }
  return null
}

/**
 * ref 指向的云端文件名（只有 cloud 类有）；其余返回 ''。
 * 孤儿回收登记引用时用它兜底，避免"新格式读不出文件名 → 文件被当孤儿删掉"。
 * @param {unknown} ref
 * @returns {string}
 */
export function cloudNameFromRef(ref) {
  const parsed = parseRef(typeof ref === 'string' ? ref : '')
  return parsed?.kind === 'cloud' ? parsed.value : ''
}
