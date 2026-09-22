import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  buildReleaseSignMessage,
  computeContentPayloadHash,
  createBundleAuthObject,
  signReleaseAuth,
  verifyBundleAuthObject,
  verifyBundleZipAuth,
  verifyReleaseAuth
} from '../bundleAuth'

function makeFiles() {
  return {
    'index.html': strToU8('<!doctype html><html></html>'),
    'assets/app.js': strToU8('console.log(1)')
  }
}

describe('bundleAuth content inventory', () => {
  it('相同内容与路径得到稳定 payloadHash', async () => {
    const a = await computeContentPayloadHash(makeFiles())
    const b = await computeContentPayloadHash({
      'assets/app.js': makeFiles()['assets/app.js'],
      'index.html': makeFiles()['index.html']
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('内容变化会导致 payloadHash 变化', async () => {
    const base = await computeContentPayloadHash(makeFiles())
    const changed = await computeContentPayloadHash({
      'index.html': strToU8('<!doctype html><html>x</html>'),
      'assets/app.js': makeFiles()['assets/app.js']
    })
    expect(changed).not.toBe(base)
  })

  it('忽略认证文件本身', async () => {
    const files = makeFiles()
    const withAuth = {
      ...files,
      'goods-bundle.auth.json': strToU8('{"ignored":true}')
    }
    expect(await computeContentPayloadHash(withAuth)).toBe(await computeContentPayloadHash(files))
  })
})

describe('bundleAuth object', () => {
  it('创建后可通过校验，并返回版本号', async () => {
    const files = makeFiles()
    const auth = await createBundleAuthObject(files, '1.6.0.1', '2026-04-10T00:00:00.000Z')
    const meta = await verifyBundleAuthObject(auth, files)
    expect(meta.version).toBe('1.6.0.1')
    expect(auth.sig).toBeTruthy()
  })

  it('篡改文件内容后校验失败', async () => {
    const files = makeFiles()
    const auth = await createBundleAuthObject(files, '1.6.0.1', '2026-04-10T00:00:00.000Z')
    const tampered = {
      ...files,
      'index.html': strToU8('<!doctype html><html>evil</html>')
    }
    await expect(verifyBundleAuthObject(auth, tampered)).rejects.toThrow(/不一致|失败/)
  })

  it('伪造签名后校验失败', async () => {
    const files = makeFiles()
    const auth = await createBundleAuthObject(files, '1.6.0.1', '2026-04-10T00:00:00.000Z')
    auth.sig = 'AAAA'
    await expect(verifyBundleAuthObject(auth, files)).rejects.toThrow(/失败/)
  })

  it('缺少认证字段时拒绝', async () => {
    await expect(verifyBundleAuthObject(null, makeFiles())).rejects.toThrow(/缺少认证/)
    await expect(verifyBundleAuthObject({}, makeFiles())).rejects.toThrow()
  })
})

describe('bundleAuth zip', () => {
  it('内嵌认证的 zip 可通过校验', async () => {
    const files = makeFiles()
    const auth = await createBundleAuthObject(files, '1.2.3', '2026-04-10T00:00:00.000Z')
    const zipBytes = zipSync({
      ...files,
      'goods-bundle.auth.json': strToU8(JSON.stringify(auth))
    })
    const result = await verifyBundleZipAuth(zipBytes)
    expect(result.version).toBe('1.2.3')
  })

  it('无认证文件的 zip 被拒绝', async () => {
    const zipBytes = zipSync(makeFiles())
    await expect(verifyBundleZipAuth(zipBytes)).rejects.toThrow(/缺少认证/)
  })

  it('非 zip 数据被拒绝', async () => {
    await expect(verifyBundleZipAuth(strToU8('not-a-zip'))).rejects.toThrow(/zip|无效/)
  })
})

describe('bundleAuth release signature', () => {
  it('发布签名可校验', async () => {
    const version = '1.6.0.2'
    const sha256 = 'a'.repeat(64)
    const authSig = await signReleaseAuth({ version, sha256 })
    await expect(verifyReleaseAuth({ version, sha256, authSig })).resolves.toBe(true)
  })

  it('缺签时拒绝', async () => {
    await expect(verifyReleaseAuth({ version: '1', sha256: 'a'.repeat(64), authSig: '' }))
      .rejects.toThrow(/未签名/)
  })

  it('版本或哈希不一致时拒绝', async () => {
    const authSig = await signReleaseAuth({ version: '1.0.0', sha256: 'a'.repeat(64) })
    await expect(verifyReleaseAuth({ version: '1.0.1', sha256: 'a'.repeat(64), authSig }))
      .rejects.toThrow(/失败/)
    await expect(verifyReleaseAuth({ version: '1.0.0', sha256: 'b'.repeat(64), authSig }))
      .rejects.toThrow(/失败/)
  })

  it('发布签名消息格式稳定', () => {
    expect(buildReleaseSignMessage({ version: '1.0.0', sha256: 'AB' }))
      .toBe('v1|goods-bundle-v1|release|1.0.0|ab')
  })
})
