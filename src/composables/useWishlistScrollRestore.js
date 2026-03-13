import { usePageScrollRestore } from '@/composables/usePageScrollRestore'

const WISHLIST_SCROLL_STORAGE_KEY = 'wishlist-scroll'
const WISHLIST_SCROLL_RESTORE_PENDING_KEY = 'wishlist-scroll-restore-pending'

export function useWishlistScrollRestore(pageBodyRef) {
  return usePageScrollRestore(pageBodyRef, {
    storageKey: WISHLIST_SCROLL_STORAGE_KEY,
    pendingKey: WISHLIST_SCROLL_RESTORE_PENDING_KEY,
    selector: '.wishlist-page .page-body'
  })
}
