import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseBudgetAmount, readBudgetSettings, writeBudgetSettings } from '../budget'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'

const storage = vi.hoisted(() => ({
  readPersisted: vi.fn(async () => ''),
  writePersisted: vi.fn(async () => true)
}))

vi.mock('@/utils/platform/storage', () => storage)

beforeEach(() => {
  storage.readPersisted.mockReset()
  storage.writePersisted.mockReset()
  storage.readPersisted.mockResolvedValue('')
  storage.writePersisted.mockResolvedValue(true)
})

describe('parseBudgetAmount', () => {
  it('accepts positive numbers', () => {
    expect(parseBudgetAmount(100)).toBe(100)
    expect(parseBudgetAmount('88.5')).toBe(88.5)
  })

  it('trims string input', () => {
    expect(parseBudgetAmount('  200  ')).toBe(200)
  })

  it('returns 0 for empty / nullish', () => {
    expect(parseBudgetAmount('')).toBe(0)
    expect(parseBudgetAmount(null)).toBe(0)
    expect(parseBudgetAmount(undefined)).toBe(0)
  })

  it('returns 0 for non-positive or NaN', () => {
    expect(parseBudgetAmount(0)).toBe(0)
    expect(parseBudgetAmount(-10)).toBe(0)
    expect(parseBudgetAmount('abc')).toBe(0)
  })
})

describe('readBudgetSettings', () => {
  it('parses persisted strings', async () => {
    storage.readPersisted.mockImplementation(async (key) => {
      if (key === MONTHLY_BUDGET_STORAGE_KEY) return '500'
      if (key === YEARLY_BUDGET_STORAGE_KEY) return '6000'
      return ''
    })
    expect(await readBudgetSettings()).toEqual({ monthly: 500, yearly: 6000 })
  })

  it('defaults invalid values to 0', async () => {
    storage.readPersisted.mockResolvedValue('x')
    expect(await readBudgetSettings()).toEqual({ monthly: 0, yearly: 0 })
  })
})

describe('writeBudgetSettings', () => {
  it('only writes provided fields', async () => {
    storage.readPersisted.mockImplementation(async (key) => {
      if (key === YEARLY_BUDGET_STORAGE_KEY) return '6000'
      return ''
    })
    const result = await writeBudgetSettings({ monthly: 300 })
    expect(result).toEqual({ monthly: 300, yearly: 6000 })
    expect(storage.writePersisted).toHaveBeenCalledTimes(1)
    expect(storage.writePersisted).toHaveBeenCalledWith(MONTHLY_BUDGET_STORAGE_KEY, '300')
  })

  it('clears storage when value is non-positive', async () => {
    await writeBudgetSettings({ monthly: 0 })
    expect(storage.writePersisted).toHaveBeenCalledWith(MONTHLY_BUDGET_STORAGE_KEY, '')
  })

  it('does nothing when patch is empty', async () => {
    await writeBudgetSettings({})
    expect(storage.writePersisted).not.toHaveBeenCalled()
  })
})
