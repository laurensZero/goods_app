import { defineAsyncComponent } from 'vue'

/**
 * 管理台区块注册表：按功能域拆分视图，懒加载。
 * 每个 section 是一个独立的 Vue 组件，卡片布局统一由 SectionCard 提供。
 * group 对应 SECTION_GROUPS 中的分组 id，决定侧栏/顶部导航的归类与排序。
 */
export const SECTION_GROUPS = [
  { id: 'overview', label: '总览' },
  { id: 'account', label: '用户与权限' },
  { id: 'data', label: '业务数据' },
  { id: 'content', label: '运营内容' },
  { id: 'ops', label: '发布与运维' }
]

export const SECTIONS = [
  // ── 总览 ──
  {
    id: 'dashboard',
    group: 'overview',
    label: '概览',
    short: '概览',
    icon: 'gauge',
    description: '整体数据概览（用户/商品/同步/存储占用）',
    component: defineAsyncComponent(() => import('../sections/DashboardSection.vue'))
  },

  // ── 用户与权限 ──
  {
    id: 'auth',
    group: 'account',
    label: '账号信息',
    short: '账号',
    icon: 'lock',
    description: '管理员账号与会话凭据',
    component: defineAsyncComponent(() => import('../sections/AuthSection.vue'))
  },
  {
    id: 'whitelist',
    group: 'account',
    label: '功能白名单',
    short: '白名单',
    icon: 'shield',
    description: '按功能授权用户（feature_whitelist）',
    component: defineAsyncComponent(() => import('../sections/FeatureWhitelistSection.vue'))
  },
  {
    id: 'users',
    group: 'account',
    label: '用户管理',
    short: '用户',
    icon: 'users',
    description: '用户列表、数据概览与 QQ 绑定管理',
    component: defineAsyncComponent(() => import('../sections/UserSection.vue'))
  },
  {
    id: 'device',
    group: 'account',
    label: '设备管理',
    short: '设备',
    icon: 'smartphone',
    description: '设备心跳清单与按设备强制重同步',
    component: defineAsyncComponent(() => import('../sections/DeviceSection.vue'))
  },

  // ── 业务数据 ──
  {
    id: 'goodsdata',
    group: 'data',
    label: '谷子数据',
    short: '谷子',
    icon: 'package',
    description: '谷子 / 活动 / 充值记录直查直改（goods/events/recharge）',
    component: defineAsyncComponent(() => import('../sections/GoodsDataSection.vue'))
  },
  {
    id: 'shares',
    group: 'data',
    label: '分享链接',
    short: '分享',
    icon: 'share',
    description: '用户分享链接（Supabase shares）',
    component: defineAsyncComponent(() => import('../sections/ShareSection.vue'))
  },
  {
    id: 'storage',
    group: 'data',
    label: '图片存储',
    short: '存储',
    icon: 'image',
    description: '存储占用与孤儿图回收（Supabase Storage）',
    component: defineAsyncComponent(() => import('../sections/ImageStorageSection.vue'))
  },
  {
    id: 'mihoyo',
    group: 'data',
    label: '米游铺监控',
    short: '米游铺',
    icon: 'activity',
    description: '库存有货监控总览（mihoyo_monitor_goods）',
    component: defineAsyncComponent(() => import('../sections/MihoyoMonitorSection.vue'))
  },

  // ── 运营内容 ──
  {
    id: 'announcement',
    group: 'content',
    label: '公告管理',
    short: '公告',
    icon: 'megaphone',
    description: '应用内公告（Supabase）',
    component: defineAsyncComponent(() => import('../sections/AnnouncementSection.vue'))
  },
  {
    id: 'survey',
    group: 'content',
    label: '问卷管理',
    short: '问卷',
    icon: 'clipboard',
    description: '应用内问卷与回复（Supabase）',
    component: defineAsyncComponent(() => import('../sections/SurveySection.vue'))
  },
  {
    id: 'feedback',
    group: 'content',
    label: '反馈管理',
    short: '反馈',
    icon: 'chat',
    description: '用户反馈与回复（Supabase）',
    component: defineAsyncComponent(() => import('../sections/FeedbackSection.vue'))
  },
  {
    id: 'birthday',
    group: 'content',
    label: '角色生日',
    short: '生日',
    icon: 'cake',
    description: '角色生日彩蛋数据（character_birthdays）',
    component: defineAsyncComponent(() => import('../sections/BirthdaySection.vue'))
  },
  {
    id: 'exchange',
    group: 'content',
    label: '汇率覆盖',
    short: '汇率',
    icon: 'coins',
    description: '权威汇率快照查看与手动覆盖（exchange_rates）',
    component: defineAsyncComponent(() => import('../sections/ExchangeRateSection.vue'))
  },

  // ── 发布与运维 ──
  {
    id: 'channels',
    group: 'ops',
    label: '发布通道',
    short: '通道',
    icon: 'package',
    description: 'stable / beta 通道当前 Bundle 状态',
    component: defineAsyncComponent(() => import('../sections/ChannelSection.vue'))
  },
  {
    id: 'publish',
    group: 'ops',
    label: '发布操作',
    short: '发布',
    icon: 'rocket',
    description: '触发 OTA Bundle 与 APK 构建工作流',
    component: defineAsyncComponent(() => import('../sections/PublishSection.vue'))
  },
  {
    id: 'maintenance',
    group: 'ops',
    label: '维护模式',
    short: '维护',
    icon: 'wrench',
    description: '同步功能维护与放行',
    component: defineAsyncComponent(() => import('../sections/MaintenanceSection.vue'))
  },
  {
    id: 'backup',
    group: 'ops',
    label: '备份管理',
    short: '备份',
    icon: 'database',
    description: 'VPS 备份触发、归档下载与回档',
    component: defineAsyncComponent(() => import('../sections/BackupSection.vue'))
  },
  {
    id: 'audit',
    group: 'ops',
    label: '审计日志',
    short: '审计',
    icon: 'history',
    description: '后台高危操作留痕（发布/回档/删除等）',
    component: defineAsyncComponent(() => import('../sections/AuditLogSection.vue'))
  }
]

export const DEFAULT_SUPABASE_URL = 'https://zvqzicimowfqshgjsrri.supabase.co'
export const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cXppY2ltb3dmcXNoZ2pzcnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjE3NzEsImV4cCI6MjA5Mzk5Nzc3MX0.AZQhPIv79WKtF1bhreMhM89CvOJ8p-1wizNiRgmnRzI'
