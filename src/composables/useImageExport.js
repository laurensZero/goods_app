import Pica from 'pica'

const DEFAULT_TARGET_MAX_BYTES = 1024 * 1024
const DEFAULT_EDGE_STEPS = [1600, 1440, 1280, 1152, 1024]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('图片导出失败'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function fileNameWithExt(fileName = '', format = 'image/jpeg') {
  const ext = format === 'image/webp' ? 'webp' : 'jpg'
  const safeName = String(fileName || '').trim().replace(/\.[^.]+$/, '') || `image_${Date.now()}`
  return `${safeName}.${ext}`
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function decodeBlobToCanvas(inputBlob) {
  const bitmap = await createImageBitmap(inputBlob)
  const canvas = createCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return canvas
}

async function resizeCanvasByMaxEdge(sourceCanvas, maxEdge, picaInstance) {
  const maxSide = Math.max(sourceCanvas.width, sourceCanvas.height)
  if (maxSide <= maxEdge) return sourceCanvas

  const scale = maxEdge / maxSide
  const targetWidth = Math.max(1, Math.round(sourceCanvas.width * scale))
  const targetHeight = Math.max(1, Math.round(sourceCanvas.height * scale))
  const targetCanvas = createCanvas(targetWidth, targetHeight)

  try {
    await picaInstance.resize(sourceCanvas, targetCanvas)
  } catch {
    const ctx = targetCanvas.getContext('2d')
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)
  }

  return targetCanvas
}

function applyBrightnessContrastToCanvas(canvas, brightness = 0, contrast = 0) {
  const b = clamp(Number(brightness) || 0, -100, 100)
  const c = clamp(Number(contrast) || 0, -100, 100)
  if (b === 0 && c === 0) return canvas

  const outputCanvas = createCanvas(canvas.width, canvas.height)
  const ctx = outputCanvas.getContext('2d')
  ctx.filter = `brightness(${100 + b}%) contrast(${100 + c}%)`
  ctx.drawImage(canvas, 0, 0)
  ctx.filter = 'none'
  return outputCanvas
}

async function binarySearchQuality({ canvas, format, targetMaxBytes, qLow, qHigh, iterations }) {
  let low = qLow
  let high = qHigh
  let best = null

  for (let i = 0; i < iterations; i += 1) {
    const q = (low + high) / 2
    const blob = await canvasToBlob(canvas, format, q)
    if (blob.size <= targetMaxBytes) {
      best = { blob, bytes: blob.size, finalQuality: q, format }
      low = q
    } else {
      high = q
    }
  }

  if (best) return best

  const fallbackBlob = await canvasToBlob(canvas, format, qLow)
  return {
    blob: fallbackBlob,
    bytes: fallbackBlob.size,
    finalQuality: qLow,
    format
  }
}

export function useImageExport() {
  const picaInstance = Pica()

  async function composeWhiteBackground(inputBlob, options = {}) {
    const bgColor = options.bgColor || '#ffffff'
    const canvas = await decodeBlobToCanvas(inputBlob)
    const outputWidth = Math.max(1, Number(options.outputWidth) || 1200)
    const outputHeight = Math.max(1, Number(options.outputHeight) || 1200)
    const fitRatio = clamp(Number(options.fitRatio) || 0.88, 0.5, 1)

    const outputCanvas = createCanvas(outputWidth, outputHeight)
    const ctx = outputCanvas.getContext('2d')
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)

    const scale = Math.min(
      (outputCanvas.width * fitRatio) / canvas.width,
      (outputCanvas.height * fitRatio) / canvas.height,
      1
    )

    const drawWidth = Math.max(1, Math.round(canvas.width * scale))
    const drawHeight = Math.max(1, Math.round(canvas.height * scale))
    const drawX = Math.round((outputCanvas.width - drawWidth) / 2)
    const drawY = Math.round((outputCanvas.height - drawHeight) / 2)

    ctx.drawImage(canvas, drawX, drawY, drawWidth, drawHeight)
    return canvasToBlob(outputCanvas, 'image/jpeg', 0.96)
  }

  async function compressUnderTarget(inputBlob, options = {}) {
    const targetMaxBytes = Number(options.targetMaxBytes) > 0 ? Number(options.targetMaxBytes) : DEFAULT_TARGET_MAX_BYTES
    const preferredFormat = options.preferredFormat || 'image/jpeg'
    const qualityMax = clamp(Number(options.qualityMax) || 0.92, 0.5, 1)
    const qualityMin = clamp(Number(options.qualityMin) || 0.6, 0.3, qualityMax)
    const qualityIterations = Math.max(3, Number(options.qualityIterations) || 6)

    const initialEdge = Number(options.initialMaxEdge) || DEFAULT_EDGE_STEPS[0]
    const minMaxEdge = Number(options.minMaxEdge) || DEFAULT_EDGE_STEPS[DEFAULT_EDGE_STEPS.length - 1]

    const canvas = await decodeBlobToCanvas(inputBlob)
    const edgeSteps = DEFAULT_EDGE_STEPS
      .filter((edge) => edge <= initialEdge && edge >= minMaxEdge)
    if (!edgeSteps.includes(initialEdge)) edgeSteps.unshift(initialEdge)
    if (!edgeSteps.includes(minMaxEdge)) edgeSteps.push(minMaxEdge)

    const normalizedSteps = [...new Set(edgeSteps)].sort((a, b) => b - a)

    let lastResult = null
    let lastCanvas = canvas

    for (const maxEdge of normalizedSteps) {
      const resizedCanvas = await resizeCanvasByMaxEdge(canvas, maxEdge, picaInstance)
      lastCanvas = resizedCanvas

      const result = await binarySearchQuality({
        canvas: resizedCanvas,
        format: preferredFormat,
        targetMaxBytes,
        qLow: qualityMin,
        qHigh: qualityMax,
        iterations: qualityIterations
      })

      if (result.bytes <= targetMaxBytes) {
        return {
          ...result,
          width: resizedCanvas.width,
          height: resizedCanvas.height,
          underTarget: true,
          finalMaxEdge: maxEdge
        }
      }

      lastResult = result
    }

    return {
      ...lastResult,
      width: lastCanvas.width,
      height: lastCanvas.height,
      underTarget: false,
      finalMaxEdge: Math.max(lastCanvas.width, lastCanvas.height)
    }
  }

  async function exportForUpload(inputBlob, options = {}) {
    let workingBlob = inputBlob
    const reportProgress = typeof options.onProgress === 'function'
      ? options.onProgress
      : null

    const emitProgress = (percent, text, stage = 'export') => {
      if (!reportProgress) return
      reportProgress({
        stage,
        percent: clamp(Math.round(Number(percent) || 0), 0, 100),
        text: text || '保存处理中...'
      })
    }

    emitProgress(5, '准备导出...')

    if ((Number(options.brightness) || 0) !== 0 || (Number(options.contrast) || 0) !== 0) {
      emitProgress(16, '应用亮度/对比度...')
      const adjustmentCanvas = await decodeBlobToCanvas(workingBlob)
      const adjustedCanvas = applyBrightnessContrastToCanvas(
        adjustmentCanvas,
        Number(options.brightness) || 0,
        Number(options.contrast) || 0
      )
      workingBlob = await canvasToBlob(adjustedCanvas, 'image/png', 1)
    }

    if (options.applyWhiteBg) {
      emitProgress(30, '合成白底中...')
      workingBlob = await composeWhiteBackground(workingBlob, {
        bgColor: options.bgColor || '#ffffff',
        outputWidth: options.whiteBgWidth || 1200,
        outputHeight: options.whiteBgHeight || 1200,
        fitRatio: options.whiteBgFitRatio || 0.88
      })
    }

    emitProgress(60, '压缩中...')
    const result = await compressUnderTarget(workingBlob, {
      targetMaxBytes: options.targetMaxBytes || DEFAULT_TARGET_MAX_BYTES,
      preferredFormat: options.preferredFormat || 'image/jpeg',
      initialMaxEdge: options.initialMaxEdge || 1600,
      minMaxEdge: options.minMaxEdge || 1024,
      qualityMax: options.qualityMax || 0.92,
      qualityMin: options.qualityMin || 0.6,
      qualityIterations: options.qualityIterations || 6
    })

    const file = new File([result.blob], fileNameWithExt(options.fileName, result.format), {
      type: result.format,
      lastModified: Date.now()
    })

    emitProgress(100, '保存完成')

    return {
      ...result,
      file
    }
  }

  return {
    composeWhiteBackground,
    compressUnderTarget,
    exportForUpload
  }
}
