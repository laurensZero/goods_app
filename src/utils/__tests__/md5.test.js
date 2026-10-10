import { describe, expect, it } from 'vitest'
import { md5 } from '@/utils/md5'

describe('md5', () => {
  it('matches RFC-style ASCII vectors (bilibili WBI 既有向量)', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('encodes input as UTF-8 before hashing（与 Python hashlib.md5(utf8) 一致）', () => {
    // 向量由 python hashlib.md5('测试'.encode('utf-8')) 生成
    expect(md5('测试')).toBe('db06c78d1e24cf708a14ce81c9b617ec')
    expect(md5('hello中文')).toBe('2858b657af3bae8c9d60b4bba3ae4044')
  })

  it('produces the taobao mtop sign for a mixed Chinese payload', () => {
    const token = '09ae51fd5718db17e1ae759ee69bcb32'
    const t = '1700000000000'
    const appKey = '12574478'
    const data = '{"appId":"34385","params":"{\\"q\\":\\"测试\\"}"}'
    expect(md5(`${token}&${t}&${appKey}&${data}`)).toBe('b32477958e382332ff4a628aa9b4b548')
  })
})
