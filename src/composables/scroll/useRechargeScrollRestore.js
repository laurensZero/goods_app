import { createPageScrollRestore } from '@/composables/scroll/usePageScrollRestore'

export const useRechargeScrollRestore = createPageScrollRestore('recharge', '.recharge-view-page .page-body')
