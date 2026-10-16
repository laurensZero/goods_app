/**
 * 支付模块「仅自己可见」开关。
 *
 * 为什么需要：`pay-mock-gateway` 握着服务端签名密钥，任何登录用户调用它
 * 都能免费给自己发放付费权益（remove_bg / beta）。所以后端用
 * PAY_MOCK_ADMIN_IDS 把该函数锁成「只对白名单账号开放」（默认拒绝），
 * 前端这里再把入口和路由一并藏掉，避免普通用户误触和困惑。
 *
 * 开启方式（任选其一）：
 *   - 本地开发：`npm run dev`，import.meta.env.DEV 自动为 true；
 *   - 真机 / 生产构建：在 .env 里设 `VITE_SHOW_PAYMENTS=true`。
 *     （Capacitor 打包是生产构建，DEV 为 false，调试支付必须用这个开关。）
 *
 * 注意：这里只管「可见性」，是体验层面的门。真正的权限判定在后端
 * PAY_MOCK_ADMIN_IDS —— 前端藏起来不等于安全，两处都得有。
 */
export function isPaymentsVisible() {
  return import.meta.env.DEV || import.meta.env.VITE_SHOW_PAYMENTS === 'true'
}
