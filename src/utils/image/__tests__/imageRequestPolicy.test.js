import { describe, expect, it } from 'vitest'
import { resolveImageRequestReferrerPolicy } from '@/utils/image/imageRequestPolicy'

describe('utils/image/imageRequestPolicy', () => {
  it('B 站图片域返回 no-referrer（外站 Referer 会被 CDN 403）', () => {
    expect(resolveImageRequestReferrerPolicy('https://i0.hdslb.com/bfs/archive/a.jpg')).toBe('no-referrer')
    expect(resolveImageRequestReferrerPolicy('https://i1.hdslb.com/bfs/archive/a.jpg@672w_378h_1c.webp')).toBe('no-referrer')
    expect(resolveImageRequestReferrerPolicy('http://i2.hdslb.com/bfs/archive/a.jpg')).toBe('no-referrer')
    expect(resolveImageRequestReferrerPolicy('//i2.hdslb.com/bfs/face/a.jpg')).toBe('no-referrer')
    expect(resolveImageRequestReferrerPolicy('https://album.biliimg.com/bfs/album/a.jpg')).toBe('no-referrer')
  })

  it('不受 Referer 影响的图床保持默认策略', () => {
    expect(resolveImageRequestReferrerPolicy('https://p1.music.126.net/a==/b.jpg?param=720y720')).toBe('')
    expect(resolveImageRequestReferrerPolicy('https://y.gtimg.cn/music/photo_new/a.jpg')).toBe('')
    expect(resolveImageRequestReferrerPolicy('https://sdk-webstatic.mihoyo.com/a.png')).toBe('')
    expect(resolveImageRequestReferrerPolicy('https://example.supabase.co/storage/v1/object/public/a.jpg')).toBe('')
  })

  it('伪装的域名后缀不会误命中', () => {
    expect(resolveImageRequestReferrerPolicy('https://hdslb.com.evil.example/a.jpg')).toBe('')
    expect(resolveImageRequestReferrerPolicy('https://nothdslb.com/a.jpg')).toBe('')
  })

  it('本地 URI / 空值 / 非法 URL 不参与', () => {
    expect(resolveImageRequestReferrerPolicy('')).toBe('')
    expect(resolveImageRequestReferrerPolicy(undefined)).toBe('')
    expect(resolveImageRequestReferrerPolicy('blob:https://localhost/abcd')).toBe('')
    expect(resolveImageRequestReferrerPolicy('data:image/jpeg;base64,AAAA')).toBe('')
    expect(resolveImageRequestReferrerPolicy('not a url')).toBe('')
  })
})
