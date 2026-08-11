// 管理台共享常量：把散落在各 section 的枚举收敛到一处。
// 注意：展示模式 / CTA action 等字段值与 App 端消费逻辑保持一致。

export const SHOW_MODES = [
  { value: 'once', label: 'once（仅一次）' },
  { value: 'daily', label: 'daily（每天一次）' },
  { value: 'per_version', label: 'per_version（每版本一次）' },
  { value: 'every_enter', label: 'every_enter（每次进入都弹）' }
]

export function showModeLabel(mode) {
  return SHOW_MODES.find((m) => m.value === mode)?.label || mode || '--'
}

// 与 app 端 stores/announcement.js handlePrimaryAction 对齐：
//   open_url → window.open(url, '_blank')
//   navigate → router.push(url)
//   dismiss  → 直接关闭
export const CTA_ACTIONS = [
  { value: 'dismiss', label: 'dismiss（直接关闭）' },
  { value: 'open_url', label: 'open_url（新窗口打开链接）' },
  { value: 'navigate', label: 'navigate（应用内跳转）' }
]

export const FEEDBACK_STATUS = [
  { value: 'pending', label: '待处理' },
  { value: 'reviewing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' }
]

export const FEEDBACK_STATUS_LABEL = Object.fromEntries(FEEDBACK_STATUS.map((s) => [s.value, s.label]))

export const FEEDBACK_TYPE = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: '建议' },
  { value: 'other', label: '其他' }
]

export const FEEDBACK_TYPE_LABEL = Object.fromEntries(FEEDBACK_TYPE.map((t) => [t.value, t.label]))

export const SURVEY_QUESTION_TYPES = [
  { value: 'single_choice', label: '单选' },
  { value: 'multiple_choice', label: '多选' },
  { value: 'text', label: '文本' },
  { value: 'rating', label: '评分' },
  { value: 'matrix', label: '矩阵' }
]

export const SURVEY_QUESTION_TYPE_LABEL = Object.fromEntries(
  SURVEY_QUESTION_TYPES.map((t) => [t.value, t.label])
)

export const CHANNEL_OPTIONS = [
  { value: 'stable', label: 'stable（正式）' },
  { value: 'beta', label: 'beta（预览）' }
]

export const MAINTENANCE_BLOCKS = [
  { key: 'sync_all', label: '停用全部数据同步' },
  { key: 'goods_data', label: '停用商品数据同步' },
  { key: 'goods_image', label: '停用商品图片同步' },
  { key: 'event_photo', label: '停用活动照片同步' },
  { key: 'feedback_attachment', label: '停用反馈附件同步' }
]

export const UPDATE_LEVELS = [
  { value: 'prompt', label: 'prompt — 提示后更新' },
  { value: 'silent', label: 'silent — 静默更新' },
  { value: 'force', label: 'force — 强制更新' }
]

export const APK_BUILD_TYPES = [
  { value: 'release', label: 'release（发布版，需 tag）' },
  { value: 'debug', label: 'debug（调试版）' }
]
