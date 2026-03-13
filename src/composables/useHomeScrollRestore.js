import { usePageScrollRestore } from '@/composables/usePageScrollRestore'

const HOME_SCROLL_STORAGE_KEY = 'home-scroll'
const HOME_SCROLL_RESTORE_PENDING_KEY = 'home-scroll-restore-pending'

export function useHomeScrollRestore(pageBodyRef) {
  return usePageScrollRestore(pageBodyRef, {
    storageKey: HOME_SCROLL_STORAGE_KEY,
    pendingKey: HOME_SCROLL_RESTORE_PENDING_KEY,
    selector: '.home-page .page-body'
  })
}
