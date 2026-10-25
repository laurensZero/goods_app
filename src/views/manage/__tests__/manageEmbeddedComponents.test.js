// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

// 支付模块默认是「仅自己可见」（受 DEV / VITE_SHOW_PAYMENTS 控制）。
// 这里强制打开，保证它也落在校验范围内 —— 历史上正是「支付」漏登记组件，
// 导致平板/桌面分屏右面板白屏（手机端走路由跳转，看不出来）。
vi.stubEnv('VITE_SHOW_PAYMENTS', 'true')

let manageRoutes
let goodsRoutes
let useManageEntries

// 动态 import：必须在 stubEnv 之后才加载，否则路由表里的支付路由不会被注册
beforeAll(async () => {
  manageRoutes = (await import('@/router/routes/manage')).default
  goodsRoutes = (await import('@/router/routes/goods')).default
  useManageEntries = (await import('@/config/manageEntries')).useManageEntries
})

function resolveLoader(router, path) {
  const matched = router.resolve(String(path || '')).matched
  return matched[matched.length - 1]?.components?.default
}

/**
 * 设置页在平板/桌面（宽度 ≥1200）走左右分屏，右面板的组件是由
 * entry.path 到路由表里解析出来的（见 ManageView.vue 的 manageComponentMap）。
 *
 * 这个测试就是那条不变量的守门员：任何设置项只要路径解析不出组件，
 * 分屏右面板就会是白屏。手机端因为走 runManageEntryPrimary → 路由跳转，
 * 完全正常，所以这个 bug 只在平板上出现、极容易漏。
 */
describe('设置页分屏：右面板组件自动解析', () => {
  it('每个设置项都能从路由表解析出可嵌入组件（action 项由专属面板处理）', () => {
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [...manageRoutes, ...goodsRoutes]
    })
    const { manageEntries } = useManageEntries()

    const unresolved = manageEntries.value
      // export / import 没有独立页面，由 ManageView 里的专属面板渲染
      .filter((entry) => !entry.action)
      .filter((entry) => typeof resolveLoader(router, entry.path) !== 'function')
      .map((entry) => `${entry.key} → ${entry.path || '(缺少 path)'}`)

    expect(unresolved).toEqual([])
  })

  it('「支付」设置项已纳入校验（防止再次漏登记）', () => {
    setActivePinia(createPinia())
    const { manageEntries } = useManageEntries()
    const payments = manageEntries.value.find((entry) => entry.key === 'payments')

    expect(payments, '支付设置项应出现在设置列表里').toBeTruthy()
    expect(payments.path).toBe('/manage/payments')
  })
})
