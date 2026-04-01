import { usePageScrollRestore } from '@/composables/scroll/usePageScrollRestore'

const EVENTS_SCROLL_STORAGE_KEY = 'events-scroll'
const EVENTS_SCROLL_RESTORE_PENDING_KEY = 'events-scroll-restore-pending'

export function useEventsScrollRestore(pageBodyRef) {
  return usePageScrollRestore(pageBodyRef, {
    storageKey: EVENTS_SCROLL_STORAGE_KEY,
    pendingKey: EVENTS_SCROLL_RESTORE_PENDING_KEY,
    selector: '.events-page .page-body'
  })
}
