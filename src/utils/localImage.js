import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { FilePicker } from '@capawesome/capacitor-file-picker'

const IMAGE_FOLDER = 'user-images'

export async function saveLocalImage(file) {
  const dataUrl = await fileToDataUrl(file)

  if (!Capacitor.isNativePlatform()) {
    return dataUrl
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

  return Capacitor.convertFileSrc(uri)
}

export async function pickLinkedLocalImage() {
  if (Capacitor.isNativePlatform()) {
    const file = await pickNativeGalleryImage().catch(async (error) => {
      console.warn('[localImage] native gallery picker failed, fallback to file input', error)
      return await pickBrowserImageFile()
    })
    if (!file) return null

    const uri = await saveLocalImage(file)

    return {
      uri,
      localPath: '',
      storageMode: 'linked-local'
    }
  }

  const file = await pickBrowserImageFile()
  if (!file) return null

  return {
    uri: await fileToDataUrl(file),
    localPath: '',
    storageMode: 'inline-local'
  }
}

async function pickNativeGalleryImage() {
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
  return uri.startsWith('capacitor://')
    || uri.startsWith('http://localhost/_capacitor_file_/')
    || uri.startsWith('https://localhost/_capacitor_file_/')
    || uri.startsWith('data:image/')
}

function extractAppLocalPath(uri) {
  const match = uri.match(/user-images\/[\w.\-]+/)
  return match ? match[0] : null
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

export async function readLocalImageAsDataUrl(uri, localPath = '') {
  if (!uri) return null
  if (uri.startsWith('data:')) return uri

  const appLocalPath = Capacitor.isNativePlatform() ? extractAppLocalPath(uri) : null
  if (appLocalPath) {
    try {
      const { data } = await Filesystem.readFile({ path: appLocalPath, directory: Directory.Data })
      return `data:${inferImageMimeFromPath(appLocalPath)};base64,${data}`
    } catch (error) {
      console.warn('[localImage] failed to read app image for export', appLocalPath, error)
    }
  }

  const nativePathDataUrl = await readNativePathAsDataUrl(localPath)
  if (nativePathDataUrl) return nativePathDataUrl

  try {
    const response = await fetch(uri)
    if (!response.ok) return null
    const blob = await response.blob()
    return await blobToDataUrl(blob)
  } catch (error) {
    console.warn('[localImage] failed to read image uri for export', uri, error)
    return null
  }
}

export async function restoreLocalImageFromDataUrl(dataUrl) {
  if (!dataUrl?.startsWith('data:image/')) return dataUrl

  if (!Capacitor.isNativePlatform()) {
    return dataUrl
  }

  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!match) return dataUrl

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
    return Capacitor.convertFileSrc(uri)
  } catch (error) {
    console.warn('[localImage] failed to restore image from backup', error)
    return dataUrl
  }
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
