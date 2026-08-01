// src/services/qqService.js
// QQ 机器人推送通知 —— 服务层
//
// 职责：QQ 绑定/解绑/推送开关，读写 user_qq_bindings 表。
// 推送本身完全在服务端（scan-sale-reminders + notify-dispatch cron）完成，
// app 不运行也能收到，这里只负责账号侧状态。
//
// 表结构见 supabase-migration-qq-notify.sql，RLS 只允许用户读写自己的行。

import { getSupabaseClient } from '@/utils/sync/supabaseClient'

const BINDINGS_TABLE = 'user_qq_bindings'

// 机器人 QQ 号：绑定页展示给用户去加好友
export const BOT_QQ = '4014470069'

/**
 * 生成 6 位随机绑定码（服务端只认消息里的 6 位数字串）
 */
export function generateBindCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/**
 * 用户本地时区相对 UTC 的分钟数（东八区 = 480）。
 * 服务端用它把无时区的 sale_at 解析成正确时刻，绑定后固定下来。
 */
export function getLocalTzOffsetMinutes() {
  try {
    return -new Date().getTimezoneOffset()
  } catch {
    return 480
  }
}

/**
 * 发起绑定：写入（或重置）一条 pending 绑定记录，返回绑定码。
 * 用户随后把该码发给机器人私聊，webhook 会把它置为 active。
 */
export async function requestBindCode() {
  const db = getSupabaseClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) throw new Error('not_logged_in')

  const bindCode = generateBindCode()
  const { data, error } = await db
    .from(BINDINGS_TABLE)
    .upsert({
      user_id: user.id,
      bind_code: bindCode,
      tz_offset_minutes: getLocalTzOffsetMinutes(),
      status: 'pending',
      enabled: true,
    }, { onConflict: 'user_id' })
    .select('bind_code')
    .single()

  if (error) throw new Error(error.message)
  return data.bind_code
}

/**
 * 查询当前用户绑定状态；未绑定返回 null。
 */
export async function getQQBinding() {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from(BINDINGS_TABLE)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
}

/**
 * 更新 QQ 推送开关（服务端据此判断是否发送）
 */
export async function setQQEnabled(enabled) {
  const db = getSupabaseClient()
  const { error } = await db
    .from(BINDINGS_TABLE)
    .update({ enabled: !!enabled })
    .eq('user_id', (await db.auth.getUser()).data.user?.id ?? '')

  if (error) throw new Error(error.message)
}

/**
 * 更新「米游铺上新」推送开关（服务端据此判断是否发送，默认关闭）
 */
export async function setMihoyoEnabled(enabled) {
  const db = getSupabaseClient()
  const { error } = await db
    .from(BINDINGS_TABLE)
    .update({ mihoyo_enabled: !!enabled })
    .eq('user_id', (await db.auth.getUser()).data.user?.id ?? '')

  if (error) throw new Error(error.message)
}

/**
 * 更新「米游铺上新」监听的店铺集合（空数组 = 全不选，需至少选一个才生效）
 * @param {string[]} shops - 店铺码数组，如 ['ys', 'xqtd']
 */
export async function setMihoyoShops(shops) {
  const db = getSupabaseClient()
  const { error } = await db
    .from(BINDINGS_TABLE)
    .update({ mihoyo_shops: Array.isArray(shops) ? shops : [] })
    .eq('user_id', (await db.auth.getUser()).data.user?.id ?? '')

  if (error) throw new Error(error.message)
}

/**
 * 解绑：状态置 unbound，服务端不再推送
 */
export async function unbindQQ() {
  const db = getSupabaseClient()
  const { error } = await db
    .from(BINDINGS_TABLE)
    .update({ status: 'unbound', unbound_at: new Date().toISOString(), enabled: false })
    .eq('user_id', (await db.auth.getUser()).data.user?.id ?? '')

  if (error) throw new Error(error.message)
}
