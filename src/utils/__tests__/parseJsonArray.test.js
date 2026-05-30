import { describe, it, expect } from 'vitest'
import { parseJsonArray } from '../parseJsonArray'

describe('parseJsonArray', () => {
  it('returns [] for null', () => {
    expect(parseJsonArray(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(parseJsonArray(undefined)).toEqual([])
  })

  it('returns [] for empty string', () => {
    expect(parseJsonArray('')).toEqual([])
  })

  it('returns [] for 0', () => {
    expect(parseJsonArray(0)).toEqual([])
  })

  it('returns [] for false', () => {
    expect(parseJsonArray(false)).toEqual([])
  })

  it('parses valid array', () => {
    expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('parses array of strings', () => {
    expect(parseJsonArray('["a","b"]')).toEqual(['a', 'b'])
  })

  it('parses empty array', () => {
    expect(parseJsonArray('[]')).toEqual([])
  })

  it('returns [] for non-array JSON object', () => {
    expect(parseJsonArray('{"key":"value"}')).toEqual([])
  })

  it('returns [] for invalid JSON', () => {
    expect(parseJsonArray('invalid json')).toEqual([])
  })

  it('returns [] for number string', () => {
    expect(parseJsonArray('42')).toEqual([])
  })

  it('returns [] for boolean string', () => {
    expect(parseJsonArray('true')).toEqual([])
  })
})
