import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

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
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 95
    })

    const uri = String(photo.webPath || photo.path || '').trim()
    if (!uri) return null

    return {
      uri,
      localPath: String(photo.path || '').trim(),
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

export async function readLocalImageAsDataUrl(uri) {
  if (!uri) return null
  if (uri.startsWith('data:')) return uri

  const appLocalPath = Capacitor.isNativePlatform() ? extractAppLocalPath(uri) : null
  if (appLocalPath) {
    try {
      const { data } = await Filesystem.readFile({ path: appLocalPath, directory: Directory.Data })
      const ext = appLocalPath.split('.').pop().toLowerCase()
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }
      const mime = mimeMap[ext] || 'image/jpeg'
      return `data:${mime};base64,${data}`
    } catch (error) {
      console.warn('[localImage] failed to read app image for export', appLocalPath, error)
    }
  }

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
