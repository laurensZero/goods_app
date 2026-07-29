// src/services/feedbackService.js
// Supabase-based feedback CRUD
// Follow-ups stored as JSONB array, appended atomically via RPC

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { Capacitor } from '@capacitor/core'
import { getDeviceId } from '@/utils/feedbackDevice'

const FEEDBACKS_TABLE = 'feedbacks'

function db() {
  return getSupabaseClient()
}

/**
 * Submit feedback to Supabase.
 */
export async function submitFeedback({ userId, type, title, content, contact, appVersion, bundleVersion, attachments }) {
  const platform = Capacitor.isNativePlatform() ? 'android' : 'web'
  const userAgent = navigator.userAgent || ''
  const deviceId = getDeviceId()

  const row = {
    type,
    title,
    content: content || '',
    contact: contact || '',
    app_version: appVersion || '',
    bundle_version: bundleVersion || '',
    platform,
    user_agent: userAgent,
    device_id: deviceId,
    attachments: attachments || []
  }
  if (userId) row.user_id = userId

  const { data, error } = await db()
    .from(FEEDBACKS_TABLE)
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * List feedbacks for the current user (login required).
 */
export async function listMyFeedbacks(userId) {
  if (!userId) return []

  const { data, error } = await db()
    .from(FEEDBACKS_TABLE)
    .select('id, type, title, status, followups, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Get a single feedback by ID.
 */
export async function getFeedback(feedbackId) {
  const { data, error } = await db()
    .from(FEEDBACKS_TABLE)
    .select('*')
    .eq('id', feedbackId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Add a follow-up atomically via RPC.
 * role: 'user' | 'admin'
 * attachments: optional array of attachment metadata
 * 注：服务端对 anon/authenticated 调用会忽略 p_user_id/p_role（身份取自
 * auth.uid() 或 x-device-id 头，role 强制为 user）并校验反馈归属
 */
export async function addFollowup({ feedbackId, userId, content, role = 'user', attachments }) {
  const { data, error } = await db().rpc('append_feedback_followup', {
    p_feedback_id: feedbackId,
    p_user_id: userId,
    p_content: content || '',
    p_role: role,
    p_attachments: attachments || null
  })

  if (error) throw new Error(error.message)
  return data
}

/**
 * Check for unread updates: admin replies OR status changes since a given timestamp.
 * Returns count of feedbacks with new activity.
 */
export async function checkUnreadUpdates(userId, since) {
  if (!userId) return 0
  const sinceTime = since || '1970-01-01T00:00:00Z'

  const { data, error } = await db()
    .from(FEEDBACKS_TABLE)
    .select('id, admin_reply, status, updated_at')
    .eq('user_id', userId)
    .gt('updated_at', sinceTime)

  if (error) throw new Error(error.message)
  if (!data) return 0

  // Count feedbacks that have admin reply OR status changed from pending
  return data.filter(fb =>
    (fb.admin_reply && fb.admin_reply.trim()) ||
    (fb.status && fb.status !== 'pending')
  ).length
}
