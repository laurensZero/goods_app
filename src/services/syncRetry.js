import { SyncError, CAUSE_NETWORK, CAUSE_RATE_LIMIT, CAUSE_SERVER } from './syncError'

/**
 * Check if an error is retryable.
 * SyncError uses its own retryable flag; plain errors are inferred by type/message.
 */
function isRetryable(error) {
  if (error instanceof SyncError) return error.retryable

  const msg = String(error?.message || '').toLowerCase()

  // Network / timeout errors
  if (error?.name === 'AbortError' || error?.name === 'TypeError') return true
  if (msg.includes('timeout') || msg.includes('超时')) return true
  if (msg.includes('network') || msg.includes('网络')) return true
  if (msg.includes('fetch') || msg.includes('连接')) return true
  if (msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound')) return true
  if (msg.includes('failed to fetch')) return true

  // 429 rate limit
  if (msg.includes('429') || msg.includes('rate limit')) return true

  // 5xx server errors
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true

  return false
}

/**
 * Extract Retry-After seconds from an error, if available.
 */
function getRetryAfterMs(error) {
  const retryAfter = error?.retryAfter || error?.headers?.['retry-after']
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10)
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000
  }
  return null
}

/**
 * Wait for a specified duration. Respects an optional signal for cancellation.
 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason || new Error('Aborted')); return }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason || new Error('Aborted')) }, { once: true })
  })
}

/**
 * Execute an async function with automatic retry on retryable errors.
 *
 * @param {Function} fn - Async function to execute
 * @param {object} [options]
 * @param {number} [options.maxRetries=2] - Maximum retry attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms (doubles each retry)
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<*>} Result of fn()
 */
export async function withRetry(fn, { maxRetries = 2, baseDelay = 1000, signal } = {}) {
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Not retryable or last attempt → throw immediately
      if (!isRetryable(error) || attempt >= maxRetries) throw error

      // Calculate delay: use Retry-After if available, otherwise exponential backoff with jitter
      const retryAfterMs = getRetryAfterMs(error)
      const backoffMs = baseDelay * Math.pow(2, attempt)
      const jitter = backoffMs * (0.7 + Math.random() * 0.6) // ±30%
      const waitMs = retryAfterMs || jitter

      console.warn(`[sync] 重试 ${attempt + 1}/${maxRetries}，等待 ${Math.round(waitMs)}ms:`, error.message)
      await delay(waitMs, signal)
    }
  }

  throw lastError
}
