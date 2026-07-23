const REQUIRED_METHODS = [
  'ensureImageCloud',
  'getExistingImageCloud',
  'readImage',
  'writeImages',
  'getImagePublicUrl',
  'pushAll',
  'pullAll',
  'getDb'
]

/**
 * Validates and returns a backend adapter implementation.
 * All sync services depend on this interface.
 *
 * Supabase adapter implements these methods.
 */
export function createSyncBackendAdapter(impl) {
  for (const key of REQUIRED_METHODS) {
    if (typeof impl[key] !== 'function') {
      throw new Error(`SyncBackendAdapter missing required method: ${key}`)
    }
  }
  return impl
}
