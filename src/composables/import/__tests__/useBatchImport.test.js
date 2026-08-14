import { describe, it, expect } from 'vitest'
import { parseBatchUrlEntries } from '../useBatchImport'

describe('parseBatchUrlEntries（链接解析，xN 展开为独立项）', () => {
  it('每行一个链接', () => {
    const urls = parseBatchUrlEntries('https://www.mihoyogift.com/goods/111\nhttps://www.mihoyogift.com/goods/222')
    expect(urls).toEqual([
      'https://www.mihoyogift.com/goods/111',
      'https://www.mihoyogift.com/goods/222',
    ])
  })

  it('链接 x2 → 展开为 2 个独立项', () => {
    const urls = parseBatchUrlEntries('https://www.mihoyogift.com/goods/111 x2')
    expect(urls).toEqual([
      'https://www.mihoyogift.com/goods/111',
      'https://www.mihoyogift.com/goods/111',
    ])
  })

  it('链接x2（无空格紧贴）同样展开为 2 个独立项', () => {
    const urls = parseBatchUrlEntries('https://www.mihoyogift.com/goods/111x2')
    expect(urls).toEqual([
      'https://www.mihoyogift.com/goods/111',
      'https://www.mihoyogift.com/goods/111',
    ])
  })

  it('链接 2个 → 展开为 2 个独立项', () => {
    const urls = parseBatchUrlEntries('https://www.mihoyogift.com/goods/111 2个')
    expect(urls).toEqual([
      'https://www.mihoyogift.com/goods/111',
      'https://www.mihoyogift.com/goods/111',
    ])
  })

  it('链接后紧贴单位字（无空格）按 1 个处理，且商品 ID 不被吃掉', () => {
    const urls = parseBatchUrlEntries('https://www.mihoyogift.com/goods/123个')
    expect(urls).toEqual(['https://www.mihoyogift.com/goods/123'])
  })

  it('一行多个链接全部解析', () => {
    const urls = parseBatchUrlEntries('https://www.mihoyogift.com/goods/111 https://www.mihoyogift.com/goods/222')
    expect(urls).toHaveLength(2)
  })

  it('过滤非米游铺链接与空行', () => {
    const urls = parseBatchUrlEntries('https://example.com/x\n\nhttps://www.mihoyogift.com/goods/333')
    expect(urls).toEqual(['https://www.mihoyogift.com/goods/333'])
  })

  it('行内无关数字（如「第3弹」）不会被误判为数量', () => {
    const urls = parseBatchUrlEntries('https://www.mihoyogift.com/goods/111 第3弹')
    expect(urls).toEqual(['https://www.mihoyogift.com/goods/111'])
  })
})
