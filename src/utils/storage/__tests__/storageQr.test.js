import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  STORAGE_FILTER_EVENT,
  STORAGE_FILTER_STORAGE_KEY,
  buildStorageDeepLink,
  buildStorageQrUrl,
  parseStorageQrUrl,
  persistStorageQrFilter
} from '../storageQr'

describe('storageQr', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('builds and parses storage deep link content', () => {
    const url = buildStorageDeepLink('柜子 A / 抽屉 1')

    expect(url).toBe('goodsapp://storage/%E6%9F%9C%E5%AD%90%20A%20%2F%20%E6%8A%BD%E5%B1%89%201')
    expect(parseStorageQrUrl(url)).toBe('柜子 A / 抽屉 1')
  })

  it('builds and parses external-scanner friendly storage QR URLs', () => {
    const url = buildStorageQrUrl('柜子 A / 抽屉 1')

    expect(url).toBe('https://laurenszero.github.io/goods_app/share.html?storage=goodsapp%3A%2F%2Fstorage%2F%25E6%259F%259C%25E5%25AD%2590%2520A%2520%252F%2520%25E6%258A%25BD%25E5%25B1%2589%25201')
    expect(parseStorageQrUrl(url)).toBe('柜子 A / 抽屉 1')
  })

  it('parses storagePath fallback landing URLs', () => {
    expect(parseStorageQrUrl('https://laurenszero.github.io/goods_app/share.html?storagePath=%E6%9F%9C%E5%AD%90%20A')).toBe('柜子 A')
  })

  it('returns empty for empty storage paths', () => {
    expect(buildStorageDeepLink('')).toBe('')
    expect(buildStorageQrUrl('')).toBe('')
  })

  it('returns empty for non-storage QR content', () => {
    expect(parseStorageQrUrl('goodsapp://share/abc123')).toBe('')
    expect(parseStorageQrUrl('plain text')).toBe('')
  })

  it('persists filter state and dispatches the shared event', () => {
    const listener = vi.fn()
    window.addEventListener(STORAGE_FILTER_EVENT, listener)

    expect(persistStorageQrFilter('柜子 A / 抽屉 1')).toBe(true)

    const raw = localStorage.getItem(STORAGE_FILTER_STORAGE_KEY)
    expect(JSON.parse(raw)).toMatchObject({
      storageLocations: ['柜子 A / 抽屉 1']
    })
    expect(listener).toHaveBeenCalledTimes(1)

    window.removeEventListener(STORAGE_FILTER_EVENT, listener)
  })
})
