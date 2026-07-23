import { describe, expect, it } from 'vitest'
import { extractIdsFromInput } from '../goods'

describe('extractIdsFromInput', () => {
  it('extracts shareId from deep link', () => {
    expect(extractIdsFromInput('goodsapp://share/abc123')).toEqual({
      shareId: 'abc123'
    })
  })

  it('extracts shareId from landing page URL', () => {
    expect(extractIdsFromInput('https://laurenszero.github.io/goods_app/share.html?s=abc123')).toEqual({
      shareId: 'abc123'
    })
  })

  it('extracts shareId from plain 6-char code', () => {
    expect(extractIdsFromInput('abc123')).toEqual({
      shareId: 'abc123'
    })
  })

  it('returns empty shareId for invalid input', () => {
    expect(extractIdsFromInput('')).toEqual({ shareId: '' })
    expect(extractIdsFromInput('hello')).toEqual({ shareId: '' })
    expect(extractIdsFromInput('goodsapp://storage/shelf')).toEqual({ shareId: '' })
  })
})
