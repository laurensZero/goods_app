/**
 * 纯 JS MD5（输入按 UTF-8 编码）。
 *
 * 提取自 utils/music/bilibiliMusic.js 的 WBI 签名实现，并把「按 UTF-16 码元低字节
 * 喂入」修正为先编码成 UTF-8 字节——ASCII 输入结果不变（两处既有测试向量保持），
 * 含中文的输入（如淘宝 mtop 签名的搜索关键词）才能与服务端 hashlib.md5(utf8) 对上。
 */

function utf8Bytes(input) {
  const str = String(input)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str)
  const bytes = []
  for (let index = 0; index < str.length; index += 1) {
    let code = str.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < str.length) {
      const next = str.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000
        index += 1
      }
    }
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  return bytes
}

export function md5(input) {
  const bytes = utf8Bytes(input)
  const byteLen = bytes.length
  const rotate = (value, bits) => (value << bits) | (value >>> (32 - bits))
  const add = (x, y) => {
    const x4 = x & 0x40000000
    const y4 = y & 0x40000000
    const x8 = x & 0x80000000
    const y8 = y & 0x80000000
    const low = (x & 0x3fffffff) + (y & 0x3fffffff)
    if (x4 & y4) return low ^ 0x80000000 ^ x8 ^ y8
    if (x4 | y4) return (low & 0x40000000) ? low ^ 0xc0000000 ^ x8 ^ y8 : low ^ 0x40000000 ^ x8 ^ y8
    return low ^ x8 ^ y8
  }
  const f = (x, y, z) => (x & y) | (~x & z)
  const g = (x, y, z) => (x & z) | (y & ~z)
  const h = (x, y, z) => x ^ y ^ z
  const i = (x, y, z) => y ^ (x | ~z)
  const op = (fn, a, b, c, d, x, s, t) => add(rotate(add(a, add(add(fn(b, c, d), x), t)), s), b)
  const words = new Array((((byteLen + 8 - ((byteLen + 8) % 64)) / 64) + 1) * 16).fill(0)
  for (let index = 0; index < byteLen; index += 1) {
    words[index >> 2] |= bytes[index] << ((index % 4) * 8)
  }
  words[byteLen >> 2] |= 0x80 << ((byteLen % 4) * 8)
  words[words.length - 2] = byteLen << 3
  words[words.length - 1] = byteLen >>> 29

  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476
  for (let offset = 0; offset < words.length; offset += 16) {
    const aa = a; const bb = b; const cc = c; const dd = d
    a = op(f, a, b, c, d, words[offset], 7, 0xd76aa478); d = op(f, d, a, b, c, words[offset + 1], 12, 0xe8c7b756); c = op(f, c, d, a, b, words[offset + 2], 17, 0x242070db); b = op(f, b, c, d, a, words[offset + 3], 22, 0xc1bdceee)
    a = op(f, a, b, c, d, words[offset + 4], 7, 0xf57c0faf); d = op(f, d, a, b, c, words[offset + 5], 12, 0x4787c62a); c = op(f, c, d, a, b, words[offset + 6], 17, 0xa8304613); b = op(f, b, c, d, a, words[offset + 7], 22, 0xfd469501)
    a = op(f, a, b, c, d, words[offset + 8], 7, 0x698098d8); d = op(f, d, a, b, c, words[offset + 9], 12, 0x8b44f7af); c = op(f, c, d, a, b, words[offset + 10], 17, 0xffff5bb1); b = op(f, b, c, d, a, words[offset + 11], 22, 0x895cd7be)
    a = op(f, a, b, c, d, words[offset + 12], 7, 0x6b901122); d = op(f, d, a, b, c, words[offset + 13], 12, 0xfd987193); c = op(f, c, d, a, b, words[offset + 14], 17, 0xa679438e); b = op(f, b, c, d, a, words[offset + 15], 22, 0x49b40821)
    a = op(g, a, b, c, d, words[offset + 1], 5, 0xf61e2562); d = op(g, d, a, b, c, words[offset + 6], 9, 0xc040b340); c = op(g, c, d, a, b, words[offset + 11], 14, 0x265e5a51); b = op(g, b, c, d, a, words[offset], 20, 0xe9b6c7aa)
    a = op(g, a, b, c, d, words[offset + 5], 5, 0xd62f105d); d = op(g, d, a, b, c, words[offset + 10], 9, 0x02441453); c = op(g, c, d, a, b, words[offset + 15], 14, 0xd8a1e681); b = op(g, b, c, d, a, words[offset + 4], 20, 0xe7d3fbc8)
    a = op(g, a, b, c, d, words[offset + 9], 5, 0x21e1cde6); d = op(g, d, a, b, c, words[offset + 14], 9, 0xc33707d6); c = op(g, c, d, a, b, words[offset + 3], 14, 0xf4d50d87); b = op(g, b, c, d, a, words[offset + 8], 20, 0x455a14ed)
    a = op(g, a, b, c, d, words[offset + 13], 5, 0xa9e3e905); d = op(g, d, a, b, c, words[offset + 2], 9, 0xfcefa3f8); c = op(g, c, d, a, b, words[offset + 7], 14, 0x676f02d9); b = op(g, b, c, d, a, words[offset + 12], 20, 0x8d2a4c8a)
    a = op(h, a, b, c, d, words[offset + 5], 4, 0xfffa3942); d = op(h, d, a, b, c, words[offset + 8], 11, 0x8771f681); c = op(h, c, d, a, b, words[offset + 11], 16, 0x6d9d6122); b = op(h, b, c, d, a, words[offset + 14], 23, 0xfde5380c)
    a = op(h, a, b, c, d, words[offset + 1], 4, 0xa4beea44); d = op(h, d, a, b, c, words[offset + 4], 11, 0x4bdecfa9); c = op(h, c, d, a, b, words[offset + 7], 16, 0xf6bb4b60); b = op(h, b, c, d, a, words[offset + 10], 23, 0xbebfbc70)
    a = op(h, a, b, c, d, words[offset + 13], 4, 0x289b7ec6); d = op(h, d, a, b, c, words[offset], 11, 0xeaa127fa); c = op(h, c, d, a, b, words[offset + 3], 16, 0xd4ef3085); b = op(h, b, c, d, a, words[offset + 6], 23, 0x04881d05)
    a = op(h, a, b, c, d, words[offset + 9], 4, 0xd9d4d039); d = op(h, d, a, b, c, words[offset + 12], 11, 0xe6db99e5); c = op(h, c, d, a, b, words[offset + 15], 16, 0x1fa27cf8); b = op(h, b, c, d, a, words[offset + 2], 23, 0xc4ac5665)
    a = op(i, a, b, c, d, words[offset], 6, 0xf4292244); d = op(i, d, a, b, c, words[offset + 7], 10, 0x432aff97); c = op(i, c, d, a, b, words[offset + 14], 15, 0xab9423a7); b = op(i, b, c, d, a, words[offset + 5], 21, 0xfc93a039)
    a = op(i, a, b, c, d, words[offset + 12], 6, 0x655b59c3); d = op(i, d, a, b, c, words[offset + 3], 10, 0x8f0ccc92); c = op(i, c, d, a, b, words[offset + 10], 15, 0xffeff47d); b = op(i, b, c, d, a, words[offset + 1], 21, 0x85845dd1)
    a = op(i, a, b, c, d, words[offset + 8], 6, 0x6fa87e4f); d = op(i, d, a, b, c, words[offset + 15], 10, 0xfe2ce6e0); c = op(i, c, d, a, b, words[offset + 6], 15, 0xa3014314); b = op(i, b, c, d, a, words[offset + 13], 21, 0x4e0811a1)
    a = op(i, a, b, c, d, words[offset + 4], 6, 0xf7537e82); d = op(i, d, a, b, c, words[offset + 11], 10, 0xbd3af235); c = op(i, c, d, a, b, words[offset + 2], 15, 0x2ad7d2bb); b = op(i, b, c, d, a, words[offset + 9], 21, 0xeb86d391)
    a = add(a, aa); b = add(b, bb); c = add(c, cc); d = add(d, dd)
  }
  const hex = (value) => Array.from({ length: 4 }, (_, index) => ((value >>> (index * 8)) & 255).toString(16).padStart(2, '0')).join('')
  return `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`
}
