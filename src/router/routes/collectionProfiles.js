const ProfileView = () => import('@/views/profile/ProfileView.vue')

// 收藏馆：按 IP / 按角色的独立落地页（可自定义背景）。
// 中文名走 encodeURIComponent 进入 params，vue-router 会自动解码。
export default [
  {
    path: '/ip/:ipName',
    name: 'ip-profile',
    component: ProfileView,
    meta: { titleKey: 'profile.title' }
  },
  {
    path: '/character/:charName',
    name: 'character-profile',
    component: ProfileView,
    meta: { titleKey: 'profile.title' }
  }
]
