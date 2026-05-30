import { describe, it, expect } from 'vitest'
import {
  splitStorageLocationPath,
  buildStorageLocationPath,
  normalizeStorageLocationValue,
  replaceStorageLocationPrefix,
  isStorageLocationUnderPrefix,
  STORAGE_LOCATION_SEPARATOR
} from '../storageLocations'

describe('splitStorageLocationPath', () => {
  it('splits by /', () => {
    expect(splitStorageLocationPath('A / B')).toEqual(['A', 'B'])
  })

  it('splits by >', () => {
    expect(splitStorageLocationPath('A > B')).toEqual(['A', 'B'])
  })

  it('splits by ->', () => {
    expect(splitStorageLocationPath('A -> B')).toEqual(['A', 'B'])
  })

  it('splits by →', () => {
    expect(splitStorageLocationPath('A → B')).toEqual(['A', 'B'])
  })

  it('splits by ＞', () => {
    expect(splitStorageLocationPath('A ＞ B')).toEqual(['A', 'B'])
  })

  it('splits by ›', () => {
    expect(splitStorageLocationPath('A › B')).toEqual(['A', 'B'])
  })

  it('splits by »', () => {
    expect(splitStorageLocationPath('A » B')).toEqual(['A', 'B'])
  })

  it('trims whitespace', () => {
    expect(splitStorageLocationPath('  A  /  B  ')).toEqual(['A', 'B'])
  })

  it('returns [] for empty string', () => {
    expect(splitStorageLocationPath('')).toEqual([])
  })

  it('returns [] for null', () => {
    expect(splitStorageLocationPath(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(splitStorageLocationPath(undefined)).toEqual([])
  })

  it('handles single segment', () => {
    expect(splitStorageLocationPath('A')).toEqual(['A'])
  })

  it('handles multiple segments', () => {
    expect(splitStorageLocationPath('A / B / C')).toEqual(['A', 'B', 'C'])
  })
})

describe('buildStorageLocationPath', () => {
  it('joins with separator', () => {
    expect(buildStorageLocationPath(['A', 'B'])).toBe('A / B')
  })

  it('joins multiple parts', () => {
    expect(buildStorageLocationPath(['A', 'B', 'C'])).toBe('A / B / C')
  })

  it('filters empty parts', () => {
    expect(buildStorageLocationPath(['A', '', 'B'])).toBe('A / B')
  })

  it('trims parts', () => {
    expect(buildStorageLocationPath([' A ', ' B '])).toBe('A / B')
  })

  it('returns empty for empty array', () => {
    expect(buildStorageLocationPath([])).toBe('')
  })

  it('handles single part', () => {
    expect(buildStorageLocationPath(['A'])).toBe('A')
  })
})

describe('normalizeStorageLocationValue', () => {
  it('normalizes mixed separators', () => {
    expect(normalizeStorageLocationValue('A>B')).toBe('A / B')
  })

  it('round-trips correctly', () => {
    const value = 'A / B / C'
    expect(normalizeStorageLocationValue(value)).toBe(value)
  })

  it('normalizes with extra whitespace', () => {
    expect(normalizeStorageLocationValue('  A  >  B  ')).toBe('A / B')
  })

  it('returns empty for empty input', () => {
    expect(normalizeStorageLocationValue('')).toBe('')
  })
})

describe('replaceStorageLocationPrefix', () => {
  it('replaces matching prefix', () => {
    expect(replaceStorageLocationPrefix('A / B / C', 'A', 'X')).toBe('X / B / C')
  })

  it('returns value when prefix does not match', () => {
    expect(replaceStorageLocationPrefix('A / B / C', 'X', 'Y')).toBe('A / B / C')
  })

  it('replaces entire value when it equals the prefix', () => {
    expect(replaceStorageLocationPrefix('A / B', 'A / B', 'X')).toBe('X')
  })

  it('removes prefix when newPrefix is empty', () => {
    expect(replaceStorageLocationPrefix('A / B / C', 'A')).toBe('B / C')
  })

  it('returns value when oldPrefix is empty', () => {
    expect(replaceStorageLocationPrefix('A / B', '', 'X')).toBe('A / B')
  })
})

describe('isStorageLocationUnderPrefix', () => {
  it('returns true when value starts with prefix', () => {
    expect(isStorageLocationUnderPrefix('A / B / C', 'A / B')).toBe(true)
  })

  it('returns true when value equals prefix', () => {
    expect(isStorageLocationUnderPrefix('A / B', 'A / B')).toBe(true)
  })

  it('returns false when value does not match prefix', () => {
    expect(isStorageLocationUnderPrefix('A / B / C', 'X / Y')).toBe(false)
  })

  it('returns false for empty value', () => {
    expect(isStorageLocationUnderPrefix('', 'A')).toBe(false)
  })

  it('returns false for empty prefix', () => {
    expect(isStorageLocationUnderPrefix('A / B', '')).toBe(false)
  })

  it('returns false when prefix is longer than value', () => {
    expect(isStorageLocationUnderPrefix('A', 'A / B')).toBe(false)
  })
})
