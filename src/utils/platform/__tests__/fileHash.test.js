import { describe, it, expect } from 'vitest'
import { sha256Hex, base64ToArrayBuffer } from '../fileHash'

// 已知 SHA-256 测试向量
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

describe('sha256Hex', () => {
  it('对 "abc" 产生标准测试向量', async () => {
    const hex = await sha256Hex(new TextEncoder().encode('abc'))
    expect(hex).toBe(SHA256_ABC)
  })

  it('对空输入产生空串哈希向量', async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(SHA256_EMPTY)
    expect(await sha256Hex(new ArrayBuffer(0))).toBe(SHA256_EMPTY)
  })

  it('返回 64 位小写十六进制', async () => {
    const hex = await sha256Hex(new TextEncoder().encode('goods_app'))
    expect(hex).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('base64ToArrayBuffer', () => {
  it('btoa 已知字节的往返一致', () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 255])
    const base64 = btoa(String.fromCharCode(...original))
    const decoded = new Uint8Array(base64ToArrayBuffer(base64))
    expect(decoded).toEqual(original)
  })

  it('文本内容往返一致', () => {
    const base64 = btoa('abc')
    const decoded = new Uint8Array(base64ToArrayBuffer(base64))
    expect(new TextDecoder().decode(decoded)).toBe('abc')
  })

  it('空串返回空 ArrayBuffer', () => {
    expect(base64ToArrayBuffer('').byteLength).toBe(0)
  })

  it('与 sha256Hex 组合可复现文件哈希', async () => {
    const base64 = btoa('abc')
    expect(await sha256Hex(base64ToArrayBuffer(base64))).toBe(SHA256_ABC)
  })
})
