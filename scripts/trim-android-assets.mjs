import { access, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Android 使用 @capacitor-community/sqlite；sql.js 仅供浏览器/PWA 使用。
// 将 Web 专用 WASM 从 Android assets 中移除，避免它随 APK 一起分发。
const assetsDir = fileURLToPath(new URL('../android/app/src/main/assets/public/assets/', import.meta.url))
const removableAssetPattern = /^(sql-wasm\.wasm|ort-wasm-.*\.wasm|ort\.(bundle|webgpu\.bundle).*)$/

await access(assetsDir)
const assetNames = await readdir(assetsDir)
const removableAssets = assetNames.filter((name) => removableAssetPattern.test(name))

for (const assetName of removableAssets) {
  await unlink(join(assetsDir, assetName))
  console.log(`[android-assets] removed web-only ${assetName}`)
}

if (removableAssets.length === 0) console.log('[android-assets] no web-only runtime assets found')
