// src/services/payment/payService.js
// 支付域客户端服务：下单 / 查单 / 触发模拟网关动作。
//
// Provider 接缝：本文件是客户端唯一与「支付网关」交互的出口。
// 现在 channel = 'mock'（模拟网关）。阶段二接支付宝沙箱时，只需改这里：
//   - createPayOrder 改为拿支付宝返回的 payUrl / 支付参数
//   - openCashier 改为「跳转 payUrl」或「把支付参数交给原生 SDK」
//   - 回调（pay-notify）、查单、发货逻辑全都不用动
//
// 注意：金额只用于展示；真正下单金额由服务端目录（_shared/pay.ts）决定。
// 客户端绝不传价格 —— 否则改个数字就能 1 分钱买走权益。

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { createLogger } from '@/utils/logger'

const log = createLogger('payment')

/** 商品目录：key 必须与 supabase/functions/_shared/pay.ts 的 PAY_CATALOG 一致。 */
export const PAY_PRODUCTS = [
  {
    key: 'remove_bg',
    feature: 'remove_bg',
    amount: 600,
    titleKey: 'manage.paymentsProductRemoveBg',
    descKey: 'manage.paymentsProductRemoveBgDesc',
    featureKey: 'manage.paymentsFeatureRemoveBg'
  },
  {
    key: 'beta_channel',
    feature: 'beta',
    amount: 100,
    titleKey: 'manage.paymentsProductBeta',
    descKey: 'manage.paymentsProductBetaDesc',
    featureKey: 'manage.paymentsFeatureBeta'
  }
]

/** 权益名 → 展示文案 key（未知 feature 回退到通用占位） */
export const FEATURE_LABEL_KEYS = {
  remove_bg: 'manage.paymentsFeatureRemoveBg',
  beta: 'manage.paymentsFeatureBeta'
}

const STATUS_LABEL_KEYS = {
  pending: 'manage.paymentsStatusPending',
  paid: 'manage.paymentsStatusPaid',
  cancelled: 'manage.paymentsStatusCancelled',
  expired: 'manage.paymentsStatusExpired'
}

export function payStatusLabelKey(status) {
  return STATUS_LABEL_KEYS[status] || 'manage.paymentsStatusPending'
}

/** 分 → 显示字符串。 */
export function formatYuan(fen) {
  return (Number(fen || 0) / 100).toFixed(2)
}

/**
 * 调用 Edge Function 并归一化错误。
 * supabase.functions.invoke 对非 2xx 返回 error，且函数体的 error 字段读起来麻烦，
 * 这里统一成 throw Error(可读原因)。
 */
async function invoke(name, options = {}) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke(name, options)
  if (error) {
    let detail = ''
    try {
      const payload = await error.context?.json?.()
      detail = payload?.error || ''
    } catch {
      // 忽略：error.context 不一定是 JSON
    }
    const reason = detail || error.message || 'request_failed'
    log.error(`invoke-failed:${name}`, { reason })
    throw new Error(reason)
  }
  if (data?.error) {
    log.error(`invoke-error:${name}`, { error: data.error })
    throw new Error(data.error)
  }
  return data
}

/** 下单（幂等：重复调用复用未过期的 pending 单）。 */
export async function createPayOrder(product) {
  return invoke('pay-create-order', { body: { product } })
}

/** 查单：不传单号则返回最近 20 笔订单与权益列表。 */
export async function fetchPayOrders(outTradeNo) {
  const query = outTradeNo ? `?out_trade_no=${encodeURIComponent(outTradeNo)}` : ''
  return invoke(`pay-order-status${query}`, { method: 'GET' })
}

/** 查单笔订单。 */
export async function fetchPayOrder(outTradeNo) {
  const data = await fetchPayOrders(outTradeNo)
  return { order: data?.order ?? null, entitlements: data?.entitlements ?? [] }
}

/**
 * 模拟网关服务端动作（真实场景不存在这一步：用户是在支付宝收银台里操作）。
 * action: 'pay'（支付成功通知）| 'cancel'（关闭通知）| 'replay'（重放，验证幂等）
 */
export async function mockGatewayAction(outTradeNo, action) {
  return invoke('pay-mock-gateway', { body: { out_trade_no: outTradeNo, action } })
}

/** 收银台路由位置：真实场景这里是跳到支付宝/微信的 URL。 */
export function cashierLocation(outTradeNo) {
  return { name: 'pay-checkout', params: { outTradeNo } }
}
