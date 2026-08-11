import { supabaseRequest, buildStorageUrl } from './supabase'

export const CHANNELS = ['stable', 'beta']
export const KEEP_BUNDLE_COUNT = 3

export async function fetchOtaBundles(channel) {
  // Query ota_releases table via Supabase REST API
  const select = 'version,storage_path,file_size,sha256,min_native_version,update_level,notes,published_at'
  const params = new URLSearchParams({
    select,
    channel: `eq.${channel}`,
    type: 'eq.web_bundle',
    order: 'published_at.desc',
    limit: String(KEEP_BUNDLE_COUNT + 1)
  })

  const res = await supabaseRequest(`/rest/v1/ota_releases?${params.toString()}`, {
    useServiceKey: false
  })

  if (!Array.isArray(res) || res.length === 0) {
    throw new Error(`${channel} 频道暂无可用资源包。`)
  }

  const latest = res[0]
  const versions = res.slice(1, KEEP_BUNDLE_COUNT + 1)

  return {
    data: {
      version: latest.version,
      url: latest.storage_path,
      hash: latest.sha256,
      minNativeVersion: latest.min_native_version,
      notes: latest.notes,
      updateLevel: latest.update_level,
      publishedAt: latest.published_at
    },
    storagePath: latest.storage_path,
    bundleUrl: buildStorageUrl(latest.storage_path),
    versions: versions.map(v => ({
      version: v.version,
      storage_path: v.storage_path,
      notes: v.notes,
      publishedAt: v.published_at
    })),
    needsPrune: res.length > KEEP_BUNDLE_COUNT
  }
}

export async function pruneOldBundles(channel) {
  const config = (await import('./supabase')).getSupabaseConfig()
  if (!config.url || !config.serviceKey) return

  const allBundles = await supabaseRequest(
    `/rest/v1/ota_releases?select=id,storage_path&channel=eq.${encodeURIComponent(channel)}&type=eq.web_bundle&order=published_at.desc`,
    { useServiceKey: true }
  )

  if (!Array.isArray(allBundles) || allBundles.length <= KEEP_BUNDLE_COUNT) return

  const toDelete = allBundles.slice(KEEP_BUNDLE_COUNT)

  for (const bundle of toDelete) {
    if (bundle.storage_path) {
      await fetch(`${config.url}/storage/v1/object/ota-releases/${encodeURIComponent(bundle.storage_path)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.serviceKey}` }
      }).catch(() => {})
    }
    await supabaseRequest(
      `/rest/v1/ota_releases?id=eq.${encodeURIComponent(bundle.id)}`,
      { method: 'DELETE', useServiceKey: true }
    ).catch(() => {})
  }
}

export async function fetchLatestApkVersion() {
  const rows = await supabaseRequest(
    '/rest/v1/ota_releases?select=version&type=eq.apk&order=published_at.desc&limit=1'
  )
  const record = Array.isArray(rows) ? rows[0] : null
  const version = String(record?.version || '').trim().replace(/^[vV]/, '')
  return version || ''
}