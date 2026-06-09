import { describe, expect, it } from 'vitest'
import { extractIdsFromInput } from '../goods'

describe('extractIdsFromInput', () => {
  it('extracts ids from HTTPS landing URLs regardless of query order', () => {
    expect(extractIdsFromInput('https://laurenszero.github.io/goods_app/share.html?s=abc123&g=1234567890abcdef')).toEqual({
      gistId: '1234567890abcdef',
      shareId: 'abc123'
    })
  })
})
