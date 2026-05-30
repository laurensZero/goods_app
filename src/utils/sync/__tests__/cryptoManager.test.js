import { describe, it, expect } from 'vitest'
import {
  isWebCryptoAvailable,
  base64urlEncode,
  base64urlDecode,
  isEncrypted,
  deriveKey,
  encrypt,
  decrypt
} from '../cryptoManager'

describe('isWebCryptoAvailable', () => {
  it('returns boolean', () => {
    expect(typeof isWebCryptoAvailable()).toBe('boolean')
  })

  it('returns true in Node 18+ with happy-dom', () => {
    // happy-dom + Node 18+ provides crypto.subtle
    expect(isWebCryptoAvailable()).toBe(true)
  })
})

describe('base64urlEncode / base64urlDecode', () => {
  it('round-trips correctly', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5])
    const encoded = base64urlEncode(input)
    const decoded = base64urlDecode(encoded)
    expect(decoded).toEqual(input)
  })

  it('produces URL-safe characters only', () => {
    // Create bytes that would produce +/ in standard base64
    const input = new Uint8Array([251, 255, 254])
    const encoded = base64urlEncode(input)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')
  })

  it('returns empty string for empty bytes', () => {
    const input = new Uint8Array([])
    const encoded = base64urlEncode(input)
    expect(encoded).toBe('')
  })

  it('round-trips large data', () => {
    const input = new Uint8Array(1000)
    for (let i = 0; i < input.length; i++) input[i] = i % 256
    const encoded = base64urlEncode(input)
    const decoded = base64urlDecode(encoded)
    expect(decoded).toEqual(input)
  })

  it('throws for non-Uint8Array input to encode', () => {
    expect(() => base64urlEncode('not bytes')).toThrow()
  })

  it('throws for empty string to decode', () => {
    expect(() => base64urlDecode('')).toThrow()
  })

  it('throws for non-string input to decode', () => {
    expect(() => base64urlDecode(123)).toThrow()
  })

  it('throws for invalid length to decode', () => {
    // length % 4 === 1 is invalid
    expect(() => base64urlDecode('a')).toThrow()
  })
})

describe('isEncrypted', () => {
  it('returns true for valid encrypted package', () => {
    const pkg = JSON.stringify({ v: 1, alg: 'A256GCM', n: 'abc', c: 'def' })
    expect(isEncrypted(pkg)).toBe(true)
  })

  it('returns false for plain JSON', () => {
    expect(isEncrypted('{"key":"value"}')).toBe(false)
  })

  it('returns false for non-JSON string', () => {
    expect(isEncrypted('hello world')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isEncrypted('')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isEncrypted(null)).toBe(false)
  })

  it('returns false for wrong version', () => {
    const pkg = JSON.stringify({ v: 2, alg: 'A256GCM', n: 'abc', c: 'def' })
    expect(isEncrypted(pkg)).toBe(false)
  })

  it('returns false for wrong algorithm', () => {
    const pkg = JSON.stringify({ v: 1, alg: 'A128GCM', n: 'abc', c: 'def' })
    expect(isEncrypted(pkg)).toBe(false)
  })

  it('returns false for missing fields', () => {
    expect(isEncrypted('{"v":1,"alg":"A256GCM"}')).toBe(false)
  })
})

describe('encrypt / decrypt round-trip', () => {
  it('encrypts and decrypts data correctly', async () => {
    const key = await deriveKey('test-password', 'user-123')
    const plaintext = 'Hello, World!'
    const encrypted = await encrypt(plaintext, key)

    expect(typeof encrypted).toBe('string')
    expect(encrypted).not.toBe(plaintext)
    expect(isEncrypted(encrypted)).toBe(true)

    const decrypted = await decrypt(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it('encrypts and decrypts JSON data', async () => {
    const key = await deriveKey('test-password', 'user-456')
    const data = JSON.stringify({ name: 'test', value: 42 })
    const encrypted = await encrypt(data, key)
    const decrypted = await decrypt(encrypted, key)
    expect(JSON.parse(decrypted)).toEqual({ name: 'test', value: 42 })
  })

  it('produces different ciphertext for same plaintext (random nonce)', async () => {
    const key = await deriveKey('test-password', 'user-789')
    const encrypted1 = await encrypt('same data', key)
    const encrypted2 = await encrypt('same data', key)
    expect(encrypted1).not.toBe(encrypted2)
  })

  it('fails to decrypt with wrong key', async () => {
    const key1 = await deriveKey('password-1', 'user-1')
    const key2 = await deriveKey('password-2', 'user-2')
    const encrypted = await encrypt('secret', key1)
    await expect(decrypt(encrypted, key2)).rejects.toThrow()
  })

  it('throws for invalid encrypted payload', async () => {
    const key = await deriveKey('test', 'user')
    await expect(decrypt('not json', key)).rejects.toThrow()
  })

  it('throws for unsupported version', async () => {
    const key = await deriveKey('test', 'user')
    const pkg = JSON.stringify({ v: 99, alg: 'A256GCM', n: 'abc', c: 'def' })
    await expect(decrypt(pkg, key)).rejects.toThrow()
  })
})

describe('deriveKey', () => {
  it('derives a CryptoKey', async () => {
    const key = await deriveKey('password', 'userId')
    expect(key).toBeInstanceOf(CryptoKey)
  })

  it('throws for empty password', async () => {
    await expect(deriveKey('', 'userId')).rejects.toThrow()
  })

  it('throws for empty userId', async () => {
    await expect(deriveKey('password', '')).rejects.toThrow()
  })

  it('produces same key for same inputs', async () => {
    const key1 = await deriveKey('password', 'userId')
    const key2 = await deriveKey('password', 'userId')
    // Same key material should produce same encrypt/decrypt results
    const encrypted = await encrypt('test', key1)
    const decrypted = await decrypt(encrypted, key2)
    expect(decrypted).toBe('test')
  })
})
