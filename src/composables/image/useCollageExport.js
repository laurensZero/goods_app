import { COLLAGE_EXPORT_EDGES } from '@/utils/image/collageLayout'

function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('collage export failed'))
        return
      }
      resolve(blob)
    }, format, quality)
  })
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('collage export image load failed'))
    image.src = url
  })
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export function resolveCollageExportEdge(value) {
  const edge = Number(value)
  if (Number.isFinite(edge) && edge > 0) {
    return Math.min(Math.round(edge), 4096)
  }
  return COLLAGE_EXPORT_EDGES[1]
}

export async function exportCollageDataUrlToBlob(source, { format = 'image/png', quality = 0.92, maxEdge } = {}) {
  let image
  let objectUrl = ''
  if (typeof source === 'string') {
    image = await loadImageFromUrl(source)
  } else if (typeof Blob !== 'undefined' && source instanceof Blob) {
    objectUrl = URL.createObjectURL(source)
    image = await loadImageFromUrl(objectUrl)
  } else {
    image = source
  }

  try {
    const sourceW = image.naturalWidth || image.width
    const sourceH = image.naturalHeight || image.height
    if (!sourceW || !sourceH) {
      throw new Error('collage export empty image')
    }

    const limit = resolveCollageExportEdge(maxEdge)
    const longest = Math.max(sourceW, sourceH)
    const scale = longest > limit ? limit / longest : 1
    const outW = Math.max(1, Math.round(sourceW * scale))
    const outH = Math.max(1, Math.round(sourceH * scale))

    const canvas = createCanvas(outW, outH)
    const ctx = canvas.getContext('2d')
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, outW, outH)
    }
    ctx.drawImage(image, 0, 0, outW, outH)

    const blob = await canvasToBlob(canvas, format, quality)
    return {
      blob,
      width: outW,
      height: outH,
      bytes: blob.size,
      format
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export { canvasToBlob as collageCanvasToBlob }

export function collageFileName(ext = 'png') {
  const stamp = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stampText = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`
  return `collage_${stampText}.${ext}`
}
