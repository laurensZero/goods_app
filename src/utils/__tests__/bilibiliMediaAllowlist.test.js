import { afterEach, describe, expect, it } from 'vitest'
import {
  clearDynamicBilibiliMediaHosts,
  isAllowedBilibiliMediaHost,
  isPrivateMediaHost,
  listDynamicBilibiliMediaHosts,
  rememberBilibiliMediaHostsFromPlayurl
} from '../../../scripts/bilibili-media-allowlist.mjs'

describe('bilibili media allowlist', () => {
  afterEach(() => {
    clearDynamicBilibiliMediaHosts()
  })

  it('allows static bilibili CDN suffixes without dynamic learning', () => {
    expect(isAllowedBilibiliMediaHost('upos-sz-mirrorcos.bilivideo.com')).toBe(true)
    expect(isAllowedBilibiliMediaHost('xy.mcdn.bilivideo.cn')).toBe(true)
    expect(isAllowedBilibiliMediaHost('edge.a.mountaintoys.cn')).toBe(true)
  })

  it('rejects private hosts even if they look like media URLs', () => {
    expect(isPrivateMediaHost('127.0.0.1')).toBe(true)
    expect(isPrivateMediaHost('localhost')).toBe(true)
    expect(isAllowedBilibiliMediaHost('127.0.0.1')).toBe(false)
    expect(isAllowedBilibiliMediaHost('localhost')).toBe(false)
  })

  it('learns dynamic hosts from playurl durl and dash payloads', () => {
    expect(isAllowedBilibiliMediaHost('edge-new.cdn.example')).toBe(false)
    rememberBilibiliMediaHostsFromPlayurl({
      code: 0,
      data: {
        durl: [{
          url: 'https://edge-new.cdn.example/video.mp4',
          backup_url: ['https://backup-edge.cdn.example/video.mp4']
        }],
        dash: {
          audio: [{
            baseUrl: 'https://audio-edge.cdn.example/a.m4s',
            backupUrl: ['https://audio-back.cdn.example/a.m4s']
          }]
        }
      }
    })
    expect(isAllowedBilibiliMediaHost('edge-new.cdn.example')).toBe(true)
    expect(isAllowedBilibiliMediaHost('backup-edge.cdn.example')).toBe(true)
    expect(isAllowedBilibiliMediaHost('audio-edge.cdn.example')).toBe(true)
    expect(isAllowedBilibiliMediaHost('audio-back.cdn.example')).toBe(true)
    expect(listDynamicBilibiliMediaHosts().length).toBeGreaterThan(0)
  })

  it('ignores invalid playurl payloads without throwing', () => {
    expect(() => rememberBilibiliMediaHostsFromPlayurl(null)).not.toThrow()
    expect(() => rememberBilibiliMediaHostsFromPlayurl({ code: 0, data: null })).not.toThrow()
    expect(isAllowedBilibiliMediaHost('edge-new.cdn.example')).toBe(false)
  })
})
