import { describe, it, expect } from 'vitest'
import { parseApkSha256FromText } from '../updateHelpers'

const VALID_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('parseApkSha256FromText', () => {
  it('从多行 release body 中解析 apk_sha256 元数据行', () => {
    const body = [
      'update_level: prompt',
      `apk_sha256: ${VALID_HASH}`,
      '',
      '## 更新说明',
      '',
      '- feat: 某个功能'
    ].join('\n')
    expect(parseApkSha256FromText(body)).toBe(VALID_HASH)
  })

  it('支持 apk-sha256= 变体写法', () => {
    expect(parseApkSha256FromText(`apk-sha256=${VALID_HASH}`)).toBe(VALID_HASH)
  })

  it('支持 sha256: 前缀', () => {
    expect(parseApkSha256FromText(`apk_sha256: sha256:${VALID_HASH}`)).toBe(VALID_HASH)
  })

  it('大写十六进制归一化为小写', () => {
    expect(parseApkSha256FromText(`apk_sha256: ${VALID_HASH.toUpperCase()}`)).toBe(VALID_HASH)
  })

  it('拒绝 63 位十六进制（返回空串）', () => {
    expect(parseApkSha256FromText(`apk_sha256: ${VALID_HASH.slice(0, 63)}`)).toBe('')
  })

  it('拒绝 65 位十六进制（返回空串）', () => {
    expect(parseApkSha256FromText(`apk_sha256: ${VALID_HASH}a`)).toBe('')
  })

  it('缺少 apk_sha256 行时返回空串', () => {
    expect(parseApkSha256FromText('update_level: prompt\n\n## 更新说明\n\n- fix: 修复')).toBe('')
  })

  it('null / undefined 输入返回空串', () => {
    expect(parseApkSha256FromText(null)).toBe('')
    expect(parseApkSha256FromText(undefined)).toBe('')
    expect(parseApkSha256FromText('')).toBe('')
  })
})
