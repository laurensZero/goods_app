import { sortedStringify } from './shared'

const YIELD_BATCH_SIZE = 20
function yieldToMain() { return new Promise(resolve => setTimeout(resolve, 0)) }

/**
 * Build a Map<id, fingerprint> for each item using the given strategy.
 */
function buildFingerprintMap(items, strategy) {
  const map = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, strategy === 'content' ? sortedStringify(item) : (Number(item?.updatedAt) || 0))
  }
  return map
}

/**
 * Async version — yields to main thread every YIELD_BATCH_SIZE items.
 * Only needed for 'content' strategy; 'timestamp' is synchronous.
 */
async function buildFingerprintMapAsync(items, strategy) {
  if (strategy !== 'content') return buildFingerprintMap(items, strategy)
  const map = new Map()
  let count = 0
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, sortedStringify(item))
    if (++count % YIELD_BATCH_SIZE === 0) await yieldToMain()
  }
  return map
}

/**
 * Compare two fingerprint maps and return diff counts.
 */
function diffMaps(localMap, remoteMap, incremental) {
  let remoteOnly = 0
  let updated = 0

  for (const [id, remoteValue] of remoteMap.entries()) {
    if (!localMap.has(id)) {
      remoteOnly += 1
      continue
    }
    if (localMap.get(id) !== remoteValue) {
      updated += 1
    }
  }

  let localOnly = 0
  if (!incremental) {
    for (const id of localMap.keys()) {
      if (!remoteMap.has(id)) {
        localOnly += 1
      }
    }
  }

  return { remoteTotal: remoteMap.size, remoteOnly, localOnly, updated }
}

/**
 * Unified state comparison.
 *
 * @param {Array} localItems - Local records (each must have .id; 'timestamp' strategy needs .updatedAt)
 * @param {Array} remoteItems - Remote records
 * @param {Object} options
 * @param {'timestamp'|'content'} [options.strategy='timestamp'] - Comparison strategy
 *   - 'timestamp': compares Number(item.updatedAt). Fast, O(n) with small constant.
 *   - 'content': compares sortedStringify(item). Slow but exact — catches same-timestamp content changes.
 * @param {boolean} [options.incremental=false] - If true, skips localOnly counting (for incremental pull where remote is a subset)
 * @returns {Promise<{remoteTotal, remoteOnly, localOnly, updated, hasChanges}>}
 */
export async function compareState(localItems = [], remoteItems = [], { strategy = 'timestamp', incremental = false } = {}) {
  const [localMap, remoteMap] = await Promise.all([
    buildFingerprintMapAsync(localItems, strategy),
    buildFingerprintMapAsync(remoteItems, strategy)
  ])
  const result = diffMaps(localMap, remoteMap, incremental)
  return { ...result, hasChanges: result.remoteOnly > 0 || result.localOnly > 0 || result.updated > 0 }
}

/**
 * Synchronous version for 'timestamp' strategy only.
 * Use when you don't need async (no content-hash, no large datasets).
 */
export function compareStateSync(localItems = [], remoteItems = [], { incremental = false } = {}) {
  const localMap = buildFingerprintMap(localItems, 'timestamp')
  const remoteMap = buildFingerprintMap(remoteItems, 'timestamp')
  const result = diffMaps(localMap, remoteMap, incremental)
  return { ...result, hasChanges: result.remoteOnly > 0 || result.localOnly > 0 || result.updated > 0 }
}
