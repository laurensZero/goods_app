import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { FilePicker } from '@capawesome/capacitor-file-picker'

const IMAGE_FOLDER = 'user-images'

export async function saveLocalImage(file) {
  const dataUrl = await fileToDataUrl(file)

  if (!Capacitor.isNativePlatform()) {
    return { uri: dataUrl, localPath: '' }
  }

  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const filename = `${IMAGE_FOLDER}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl

  await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Data,
    recursive: true,
  })

  const { uri } = await Filesystem.getUri({
    path: filename,
    directory: Directory.Data,
  })

  return { uri: Capacitor.convertFileSrc(uri), localPath: filename }
}

export async function pickLinkedLocalImages(limit) {
  if (Capacitor.isNativePlatform()) {
    const files = await pickNativeGalleryImages(limit).catch((error) => {
      console.warn('[localImage] native multi-pick failed', error)
      return []
    })
    if (!files.length) return []
    const results = []
    for (const file of files) {
      const saved = await saveLocalImage(file)
      results.push({
        uri: saved.uri,
        localPath: saved.localPath,
        storageMode: 'linked-local',
        // 直接带上 File，避免调用方再 fetch 转换 URI（多选时更稳）
        file
      })
    }
    return results
  }

  const files = await pickBrowserImageFiles()
  if (!files.length) return []
  const results = []
  for (const file of files) {
    results.push({
      uri: await fileToDataUrl(file),
      localPath: '',
      storageMode: 'inline-local',
      file
    })
  }
  return results
}

export async function pickLinkedLocalImage() {
  const file = await pickLocalImageFile()
  if (!file) return null

  if (!Capacitor.isNativePlatform()) {
    return {
      uri: await fileToDataUrl(file),
      localPath: '',
      storageMode: 'inline-local'
    }
  }

  const saved = await saveLocalImage(file)

  return {
    uri: saved.uri,
    localPath: saved.localPath,
    storageMode: 'linked-local'
  }
}

/**
 * 选一张图，返回原始 File（不落盘、不转 data URL）。
 * 适合「需要先自己压缩 / 处理」的场景（如收藏馆背景图导入）：
 * 直接把 File 交给压缩管线，避免大图先转 data URL 的额外时间和内存。
 * @returns {Promise<File | null>}
 */
export async function pickImageFile() {
  return await pickLocalImageFile()
}

/**
 * 选一张图片并直接读成 data URL，**不写进 user-images**。
 * 用于「只要图内容、不需要把图存进谷子图片库」的场景（如拍照识别）——
 * 否则用户只是想识别一下，本地却留下一个没人引用的托管文件。
 * @returns {Promise<{ uri: string, localPath: string } | null>}
 */
export async function pickImageForRecognition() {
  const file = await pickLocalImageFile()
  if (!file) return null
  return { uri: await fileToDataUrl(file), localPath: '' }
}

/**
 * 选一张图（原生优先相册，失败退回文件选择器；Web 走文件选择器）。
 * 返回原始 File，落盘与转 data URL 由调用方决定。
 * @returns {Promise<File | null>}
 */
async function pickLocalImageFile() {
  if (Capacitor.isNativePlatform()) {
    return await pickNativeGalleryImage().catch(async (error) => {
      console.warn('[localImage] native gallery picker failed, fallback to file input', error)
      return await pickBrowserImageFile()
    })
  }
  return await pickBrowserImageFile()
}

async function pickNativeGalleryImages(limit) {
  // Android 上 pickImages 的 limit 文档仅保证 0/1；传 >1 时部分机型只能单选。
  // 多选用 0（不限制），再在上层按业务上限截断。
  const pickerLimit = Number(limit) > 1 ? 0 : Number(limit) || 0
  const result = await FilePicker.pickImages({
    limit: pickerLimit,
    readData: false
  })
  const files = result?.files || []
  const max = Number(limit) > 0 ? Number(limit) : files.length
  const out = []
  for (const picked of files) {
    if (!picked) continue
    if (out.length >= max) break
    const fileName = String(picked.name || `image_${Date.now()}`)
    const mimeType = String(picked.mimeType || inferImageMimeFromPath(fileName) || 'image/png')
    if (picked.path) {
      try {
        const convertedPath = Capacitor.convertFileSrc(picked.path)
        const response = await fetch(convertedPath)
        if (!response.ok) throw new Error('读取相册原图失败')
        const blob = await response.blob()
        out.push(new File([blob], fileName, {
          type: blob.type || mimeType,
          lastModified: Number(picked.modifiedAt) || Date.now()
        }))
      } catch (e) {
        console.warn('[localImage] failed to read picked path', picked.path, e)
      }
    } else if (picked.blob instanceof Blob) {
      out.push(new File([picked.blob], fileName, {
        type: mimeType,
        lastModified: Number(picked.modifiedAt) || Date.now()
      }))
    } else if (picked.data) {
      out.push(dataUrlToFile(`data:${mimeType};base64,${picked.data}`, fileName))
    }
  }
  return out
}

async function pickNativeGalleryImage() {
  // readData: false —— 不把原图 base64 读进 JS 桥（15MB 大图会明显卡顿）。
  // 下方优先走 blob / path → fetch 成 File，只有插件两个都没给时才回退 data。
  const result = await FilePicker.pickImages({
    limit: 1,
    readData: true
  })
  const picked = result?.files?.[0]
  if (!picked) return null

  const fileName = String(picked.name || `image_${Date.now()}`)
  const mimeType = String(picked.mimeType || inferImageMimeFromPath(fileName) || 'image/png')

  if (picked.blob instanceof Blob) {
    return new File([picked.blob], fileName, {
      type: mimeType,
      lastModified: Number(picked.modifiedAt) || Date.now()
    })
  }

  if (picked.path) {
    try {
      const response = await fetch(picked.path)
      if (!response.ok) {
        throw new Error('读取相册原图失败')
      }
      const blob = await response.blob()
      return new File([blob], fileName, {
        type: blob.type || mimeType,
        lastModified: Number(picked.modifiedAt) || Date.now()
      })
    } catch (error) {
      console.warn('[localImage] failed to fetch picked image path', picked.path, error)
    }
  }

  if (picked.data) {
    return dataUrlToFile(`data:${mimeType};base64,${picked.data}`, fileName)
  }

  throw new Error('未读取到相册图片数据')
}

export function isLocalImageUri(uri) {
  if (!uri || typeof uri !== 'string') return false
  // convertFileSrc 在 Android 上可能带自定义 host（https://app.example/_capacitor_file_/...），
  // 不能只认 localhost，否则会被 inferGoodsImageStorageMode 误判成 remote 并把本地路径推上云。
  return uri.startsWith('capacitor://')
    || uri.startsWith('file://')
    || uri.includes('/_capacitor_file_/')
    || uri.startsWith('data:image/')
}

function extractAppLocalPath(uri) {
  const text = String(uri || '')
  // 仅识别应用本地来源（裸相对路径 / capacitor 文件协议 / convertFileSrc 转换地址），
  // 避免远程 URL 中的 user-images/ 片段被误判为托管文件
  const isAppLocal = text.startsWith(`${IMAGE_FOLDER}/`)
    || text.startsWith('capacitor://')
    || text.startsWith('file://')
    || text.includes('/_capacitor_file_/')
  if (!isAppLocal) return null
  const match = text.match(/user-images\/[\w.\-]+/)
  return match ? match[0] : null
}

export function extractManagedLocalImagePath(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return extractAppLocalPath(text) || ''
}

/**
 * 托管本地文件是否还在。用于「有配方但底图丢了」的判定：
 * 丢了就别显示二次编辑入口，否则一点就是框上加框。
 *
 * Web 端的图片就是 data URL（没有文件系统），URL 在即算在。
 * @param {string} uri
 * @param {string} [localPath]
 * @returns {Promise<boolean>}
 */
export async function localImageFileExists(uri, localPath = '') {
  const text = String(uri || '').trim()
  if (!text) return false
  if (text.startsWith('data:image/')) return true
  if (!Capacitor.isNativePlatform()) return false

  const path = extractAppLocalPath(text) || extractManagedLocalImagePath(localPath)
  if (!path) return false
  try {
    await Filesystem.stat({ path, directory: Directory.Data })
    return true
  } catch {
    return false
  }
}

export function collectManagedLocalImagePathsFromImageList(images) {
  // 「去框底图」刻意不在这里登记：它不挂在 images[i] 上（同步会整行覆盖，本地字段会被抹掉），
  // 而是由 image_edits.sourcePath 单独记账。删图/删商品/离开编辑页时走
  // utils/image/imageEdit.js 的 forget* 系列回收，见 docs/frame-reedit-plan.md。
  const refs = new Set()
  if (!Array.isArray(images)) return refs

  for (const image of images) {
    if (!image) continue

    if (typeof image === 'string') {
      const path = extractManagedLocalImagePath(image)
      if (path) refs.add(path)
      continue
    }

    const uriPath = extractManagedLocalImagePath(image.uri)
    if (uriPath) refs.add(uriPath)

    const localPath = extractManagedLocalImagePath(image.localPath)
    if (localPath) refs.add(localPath)
  }

  return refs
}

export function collectManagedLocalImagePathsFromGoodsItem(item) {
  const refs = new Set()
  if (!item) return refs

  const imagePath = extractManagedLocalImagePath(item.image)
  if (imagePath) refs.add(imagePath)

  const coverPath = extractManagedLocalImagePath(item.coverImage)
  if (coverPath) refs.add(coverPath)

  for (const path of collectManagedLocalImagePathsFromImageList(item.images)) {
    refs.add(path)
  }

  return refs
}

export function collectManagedLocalImagePathsFromEvent(event) {
  const refs = new Set()
  if (!event) return refs

  const coverPath = extractManagedLocalImagePath(event.coverImage)
  if (coverPath) refs.add(coverPath)

  for (const path of collectManagedLocalImagePathsFromImageList(event.photos)) {
    refs.add(path)
  }

  return refs
}

export async function deleteManagedLocalImages(paths) {
  if (!Capacitor.isNativePlatform()) return 0

  const targetPaths = [...new Set(Array.from(paths || []).map((path) => extractManagedLocalImagePath(path)).filter(Boolean))]
  if (targetPaths.length === 0) return 0

  let removed = 0
  await Promise.all(targetPaths.map(async (path) => {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Data
      })
      removed += 1
    } catch {
      // ignore missing files and unsupported platforms
    }
  }))

  return removed
}

function inferImageMimeFromPath(path) {
  const ext = String(path || '').split('.').pop()?.toLowerCase()
  const mimeMap = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif'
  }
  return mimeMap[ext] || 'image/jpeg'
}

async function readNativePathAsDataUrl(path) {
  const resolvedPath = String(path || '').trim()
  if (!resolvedPath || !Capacitor.isNativePlatform()) return null

  try {
    const { data } = await Filesystem.readFile({ path: resolvedPath })
    return `data:${inferImageMimeFromPath(resolvedPath)};base64,${data}`
  } catch (error) {
    console.warn('[localImage] failed to read native path for export', resolvedPath, error)
    return null
  }
}

export async function readLocalImageAsDataUrl(uri, localPath = '', onWarn) {
  const warn = typeof onWarn === 'function' ? onWarn : () => {}
  if (!uri) return null
  if (uri.startsWith('data:')) return uri

  const isNative = Capacitor.isNativePlatform()
  const appLocalPath = isNative ? extractAppLocalPath(uri) : null

  if (isNative && appLocalPath) {
    try {
      const { data } = await Filesystem.readFile({ path: appLocalPath, directory: Directory.Data })
      return `data:${inferImageMimeFromPath(appLocalPath)};base64,${data}`
    } catch (_) {}
  }

  const nativePathDataUrl = await readNativePathAsDataUrl(localPath)
  if (nativePathDataUrl) return nativePathDataUrl

  if (isNative && localPath && localPath !== appLocalPath) {
    try {
      const { data } = await Filesystem.readFile({ path: localPath, directory: Directory.Data })
      return `data:${inferImageMimeFromPath(localPath)};base64,${data}`
    } catch (_) {}
  }

  try {
    const response = await fetch(uri)
    if (!response.ok) return null
    const blob = await response.blob()
    return await blobToDataUrl(blob)
  } catch (_) {}

  if (isNative) {
    warn('图片文件已丢失，请重新添加图片')
  }
  return null
}

/**
 * 把 data URL 写入受管本地图片目录（原生端），Web 端原样返回 data URL。
 * 用于「生成固定尺寸变体后落盘」这类需要自己决定文件名的场景。
 * @param {string} dataUrl
 * @returns {Promise<{ uri: string, localPath: string }>}
 */
export async function saveManagedLocalImageDataUrl(dataUrl) {
  const text = String(dataUrl || '')
  if (!text.startsWith('data:image/')) return { uri: text, localPath: '' }

  if (!Capacitor.isNativePlatform()) {
    return { uri: text, localPath: '' }
  }

  const match = text.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!match) return { uri: text, localPath: '' }

  const rawExt = match[1]
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt
  const base64Data = match[2]
  const filename = `${IMAGE_FOLDER}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`

  try {
    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Data,
      recursive: true,
    })

    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Data })
    return { uri: Capacitor.convertFileSrc(uri), localPath: filename }
  } catch (error) {
    console.warn('[localImage] failed to save image data url', error)
    return { uri: text, localPath: '' }
  }
}

export async function restoreLocalImageFromDataUrl(dataUrl) {
  const saved = await saveManagedLocalImageDataUrl(dataUrl)
  return saved.uri
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(/** @type {string} */ (event.target.result))
    reader.onerror = () => reject(new Error('Image read failed'))
    reader.readAsDataURL(file)
  })
}

function dataUrlToFile(dataUrl, fileName = 'image.png') {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('图片数据格式无效')
  }

  const mime = match[1]
  const base64 = match[2]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new File([bytes], fileName, {
    type: mime,
    lastModified: Date.now()
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(/** @type {string} */ (event.target.result))
    reader.onerror = () => reject(new Error('Image read failed'))
    reader.readAsDataURL(blob)
  })
}

function pickBrowserImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.display = 'none'
    input.addEventListener('change', () => {
      const file = input.files?.[0] || null
      input.remove()
      resolve(file)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

function pickBrowserImageFiles() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.style.display = 'none'
    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : []
      input.remove()
      resolve(files)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}
