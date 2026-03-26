import { usePageScrollRestore } from '@/composables/usePageScrollRestore'

const MANAGE_SCROLL_STORAGE_KEY = 'manage-scroll'
const MANAGE_SCROLL_RESTORE_PENDING_KEY = 'manage-scroll-restore-pending'

export function useManageScrollRestore(pageBodyRef) {
  return usePageScrollRestore(pageBodyRef, {
    storageKey: MANAGE_SCROLL_STORAGE_KEY,
    pendingKey: MANAGE_SCROLL_RESTORE_PENDING_KEY,
    selector: '.manage-page .page-body'
  })
}
