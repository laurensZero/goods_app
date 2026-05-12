/**
 * 编译时平台常量
 * 由 vite.config.js 的 define 注入，构建时替换为字面量
 *   - `vite build`            → 'web'
 *   - `vite build --mode native` → 'native'
 */
export const IS_NATIVE = __PLATFORM__ === 'native'
