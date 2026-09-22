import { describe, it, expect, vi, beforeEach } from 'vitest'

const PRIMARY = 'https://zvqzicimowfqshgjsrri.supabase.co'
const BACKUP = 'https://api.goodsapp.de5.net'

const getFileDownloadBaseUrlsMock = vi.fn(() => [PRIMARY, BACKUP])

vi.mock('@/utils/sync/supabaseClient', () => ({
  getFileDownloadBaseUrls: (...a) => getFileDownloadBaseUrlsMock(...a)
}))

import { parseApkSha256FromText, toDirectStorageUrl, toDirectStorageUrls } from '../updateHelpers'

const VALID_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

beforeEach(() => {
  getFileDownloadBaseUrlsMock.mockReset()
  getFileDownloadBaseUrlsMock.mockReturnValue([PRIMARY, BACKUP])
})

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

describe('toDirectStorageUrls', () => {
  it('按数据面候选顺序生成 OTA 下载直链', () => {
    expect(toDirectStorageUrls('stable/app.zip')).toEqual([
      `${PRIMARY}/storage/v1/object/public/ota-releases/stable/app.zip`,
      `${BACKUP}/storage/v1/object/public/ota-releases/stable/app.zip`
    ])
  })

  it('已切到备用时备用在前、主域名兜底', () => {
    getFileDownloadBaseUrlsMock.mockReturnValue([BACKUP, PRIMARY])
    expect(toDirectStorageUrls('stable/app.zip')).toEqual([
      `${BACKUP}/storage/v1/object/public/ota-releases/stable/app.zip`,
      `${PRIMARY}/storage/v1/object/public/ota-releases/stable/app.zip`
    ])
  })

  it('toDirectStorageUrl 返回首选直链', () => {
    expect(toDirectStorageUrl('apk/app.apk')).toBe(
      `${PRIMARY}/storage/v1/object/public/ota-releases/apk/app.apk`
    )
  })

  it('路径为空或含 .. 时返回空列表 / 空串', () => {
    expect(toDirectStorageUrls('')).toEqual([])
    expect(toDirectStorageUrls('../secret')).toEqual([])
    expect(toDirectStorageUrl('')).toBe('')
    expect(toDirectStorageUrl('../secret')).toBe('')
  })
})
