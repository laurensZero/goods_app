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

  it('extracts shareId from production landing URL with .html extension', () => {
    expect(extractIdsFromInput('https://goodsapp.de5.net/share.html?s=abc123')).toEqual({
      shareId: 'abc123'
    })
  })

  it('extracts shareId from production landing URL after pretty-URL redirect', () => {
    expect(extractIdsFromInput('https://goodsapp.de5.net/share?s=abc123')).toEqual({
      shareId: 'abc123'
    })
  })

  it('extracts shareId from production path-style share URL', () => {
    expect(extractIdsFromInput('https://goodsapp.de5.net/share/abc123')).toEqual({
      shareId: 'abc123'
    })
  })

  it('ignores production URLs outside the share path', () => {
    expect(extractIdsFromInput('https://goodsapp.de5.net/home?s=abc123')).toEqual({ shareId: '' })
    expect(extractIdsFromInput('https://goodsapp.de5.net/shared/abc123')).toEqual({ shareId: '' })
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
