import { usePageScrollRestore } from '@/composables/scroll/usePageScrollRestore'

const RECHARGE_SCROLL_STORAGE_KEY = 'recharge-scroll'
const RECHARGE_SCROLL_RESTORE_PENDING_KEY = 'recharge-scroll-restore-pending'

export function useRechargeScrollRestore(pageBodyRef) {
  return usePageScrollRestore(pageBodyRef, {
    storageKey: RECHARGE_SCROLL_STORAGE_KEY,
    pendingKey: RECHARGE_SCROLL_RESTORE_PENDING_KEY,
    selector: '.recharge-view-page .page-body'
  })
}
