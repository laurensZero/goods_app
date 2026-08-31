import { describe, it, expect, vi } from 'vitest'

vi.mock('@/config/supabase', () => ({
  SUPABASE_URL: 'https://zvqzicimowfqshgjsrri.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key'
}))

import { getThumbFetchHeaders } from '../thumbFetch'

describe('getThumbFetchHeaders', () => {
  it('attaches apikey header only for resize-image function URLs', () => {
    const thumbUrl = 'https://zvqzicimowfqshgjsrri.supabase.co/functions/v1/resize-image?url=https%3A%2F%2Fx&w=800'
    expect(getThumbFetchHeaders(thumbUrl)).toEqual({ apikey: 'test-anon-key' })
  })

  it('returns null for plain storage / external image URLs', () => {
    expect(getThumbFetchHeaders('https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/event-photos/uid/a.jpg')).toBeNull()
    expect(getThumbFetchHeaders('https://example.com/a.jpg')).toBeNull()
    expect(getThumbFetchHeaders('')).toBeNull()
    expect(getThumbFetchHeaders(null)).toBeNull()
  })
})
