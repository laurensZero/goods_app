const REQUIRED_METHODS = [
  'ensureDataGist',
  'ensureImageGist',
  'ensureRechargeGist',
  'ensureEventGist',
  'getExistingImageGist',
  'getExistingRechargeGist',
  'getExistingEventGist',
  'readJson',
  'readImage',
  'writeData',
  'writeImages',
  'getManifest'
]

/**
 * Validates and returns a backend adapter implementation.
 * All sync services depend on this interface instead of directly on GitHub Gist APIs.
 *
 * To add a new backend (WebDAV, S3, etc.), implement these methods:
 *   ensureDataGist(deviceId)      → gist-like object
 *   ensureImageGist(deviceId)     → gist-like object
 *   ensureRechargeGist(deviceId)  → gist-like object
 *   ensureEventGist(deviceId)     → gist-like object
 *   getExistingImageGist(manifest)     → gist-like object | null
 *   getExistingRechargeGist()          → gist-like object | null
 *   getExistingEventGist()             → gist-like object | null
 *   readJson({ gist, fileName, ... })  → parsed object | null
 *   readImage(gist, fileName)          → data URL string
 *   writeData(gistId, files)           → void
 *   writeImages(gistId, files)         → void
 *   getManifest(gist)                  → manifest object | null
 */
export function createSyncBackendAdapter(impl) {
  for (const key of REQUIRED_METHODS) {
    if (typeof impl[key] !== 'function') {
      throw new Error(`SyncBackendAdapter missing required method: ${key}`)
    }
  }
  return impl
}
