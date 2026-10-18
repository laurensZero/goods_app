/**
 * 图片引用的唯一表示。
 *
 * 设计约束（见 docs/image-sync-refactor-plan.md 的 I1）：
 * - 可跨设备重建的图片只有一个标识 `ref`，取值 `cloud:<fileName>` / `remote:<url>` / `local:<path|data>`
 * - `local:*` 只在本机存在，**永不**进同步载荷
 * - `uri` / `storageMode` / `localPath` 不再持久化，展示地址由 resolver 现场推导
 *
 * ⚠️ 本文件的 `toRef` 与 `supabase/supabase-migration-image-refs.sql` 里的 `pg_temp.image_ref`
 * 必须逐条一致（含判定优先级）。两边共用同一份 fixture：
 * `src/utils/image/__fixtures__/imageRefFixtures.js`（由 ref.test.js 校验）。
 * 改规则时先改 fixture，再同时改本文件与 SQL。
 */
import { parseCloudImageUri, parseStoragePublicImageUrl } from '@/utils/goods/images'

export const CLOUD_REF_PREFIX = 'cloud:'
export const REMOTE_REF_PREFIX = 'remote:'
export const LOCAL_REF_PREFIX = 'local:'

/** @type {ReadonlyArray<'cloud'|'remote'|'local'>} */
export const REF_KINDS = Object.freeze(['cloud', 'remote', 'local'])

/**
 * 本机文件型 URI 判定。与服务端迁移规则的第 6 步一一对应，
 * 必须在 http(s) 判定**之前**用：`http://localhost/_capacitor_file_/...` 是 Capacitor 的
 * 本地文件地址（convertFileSrc 在部分平台会带自定义 host），不是远程图。
 * @param {string} value
 * @returns {boolean}
 */
function isLocalFileLikeUri(value) {
  return value.startsWith('file:')
    || value.startsWith('content:')
    || value.startsWith('capacitor:')
    || value.includes('/_capacitor_file_/')
    || value.startsWith('/storage/')
    || value.startsWith('/private/')
}

/**
 * 把单个 uri 归约为 ref。
 * cloud 类的反解复用 `parseCloudImageUri`（含 cloud-image:// 现役、gist-image:// 遗留、
 * cloud: 迁移后形态）与 `parseStoragePublicImageUrl`（Storage 公开 URL），不另写一份解析。
 * @param {string} uri
 * @returns {string} ref；空入参返回 ''
 */
export function refFromUri(uri) {
  const value = String(uri || '').trim()
  if (!value) return ''

  const cloudFileName = parseCloudImageUri(value) || parseStoragePublicImageUrl(value)
  if (cloudFileName) return `${CLOUD_REF_PREFIX}${cloudFileName}`

  if (isLocalFileLikeUri(value)) return `${LOCAL_REF_PREFIX}${value}`
  if (/^https?:\/\//i.test(value)) return `${REMOTE_REF_PREFIX}${value}`

  // 其余（data: / blob: / 裸相对路径 …）都只在本机有意义
  return `${LOCAL_REF_PREFIX}${value}`
}

/**
 * 把一个图片条目归约为 ref。判定优先级与 SQL 的 `pg_temp.image_ref` 完全一致：
 * 已有 ref → cloudFileName → uri。
 *
 * 注意：本函数只认 `ref` / `cloudFileName` / `uri` 三个键；实体自己的字段名
 * （events 的 coverImage、草稿的 imageUri …）由调用方映射成 `uri` 后传入，
 * 这样规则只有一份。
 * @param {any} entry
 * @returns {string}
 */
export function toRef(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string') return refFromUri(entry)

  const existing = String(entry.ref || '').trim()
  if (existing) return existing

  const cloudFileName = String(entry.cloudFileName || '').trim()
  if (cloudFileName) return `${CLOUD_REF_PREFIX}${cloudFileName}`

  return refFromUri(entry.uri)
}

/**
 * 拆解 ref。
 * @param {string} ref
 * @returns {{ kind: 'cloud'|'remote'|'local', value: string } | null}
 */
export function parseRef(ref) {
  const value = String(ref || '').trim()
  if (!value) return null
  for (const kind of REF_KINDS) {
    const prefix = `${kind}:`
    if (value.startsWith(prefix)) {
      const inner = value.slice(prefix.length)
      return inner ? { kind, value: inner } : null
    }
  }
  return null
}

/** 该 ref 是否允许进同步载荷（本机专属的 `local:` 不允许）。 */
export function isSyncableRef(ref) {
  const parsed = parseRef(ref)
  return parsed?.kind === 'cloud' || parsed?.kind === 'remote'
}

/** cloud ref → 裸文件名；其余返回 ''。 */
export function cloudFileNameFromRef(ref) {
  const parsed = parseRef(ref)
  return parsed?.kind === 'cloud' ? parsed.value : ''
}

/**
 * 把一个旧形态的图片条目迁移到 ref 形态：
 * 去掉 `uri` / `cloudFileName` / `storageMode` / `localPath` / `editSourceUri` /
 * `editSourceCloudFileName`，补上 `ref` / `editSourceRef`，其余字段原样保留。
 * 幂等：新形态入参原样返回。
 * @param {any} entry
 * @returns {any}
 */
export function migrateImageEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry

  const {
    uri,
    cloudFileName,
    storageMode: _storageMode,
    localPath: _localPath,
    editSourceUri,
    editSourceCloudFileName,
    ...rest
  } = entry

  const ref = toRef({ ref: rest.ref, cloudFileName, uri })
  // `rest.editSourceRef` 必须一起传：迁移是幂等的，重跑时 editSourceUri / editSourceCloudFileName
  // 已经不存在，只能从既有的 editSourceRef 取。
  const editSourceRef = toRef({
    ref: rest.editSourceRef,
    cloudFileName: editSourceCloudFileName,
    uri: editSourceUri
  })

  const next = { ...rest }
  delete next.ref
  delete next.editSourceRef
  if (ref) next.ref = ref
  if (editSourceRef) next.editSourceRef = editSourceRef
  return next
}

/**
 * @param {any} list
 * @returns {any[]}
 */
export function migrateImageList(list) {
  if (!Array.isArray(list)) return []
  return list.map((entry) => migrateImageEntry(entry)).filter(Boolean)
}
