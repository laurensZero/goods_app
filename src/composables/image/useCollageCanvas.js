import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { Canvas, FabricImage } from 'fabric'
import {
  COLLAGE_MAX_IMAGES,
  COLLAGE_SOURCE_MAX_EDGE,
  clampCollageImageCount,
  fitBoxInto,
  resolveCollageRatio,
  resolveExportPixelSize,
  scaleToFitObject
} from '@/utils/image/collageLayout'
import { computeAlignDelta } from '@/utils/image/collageSnap'
import { createCollageAlignGuidelines } from '@/composables/image/createCollageAlignGuidelines'
import { collageFileName, exportCanvasToBlob, resolveCollageExportEdge } from '@/composables/image/useCollageExport'

function configureControls(object) {
  object.set({
    transparentCorners: false,
    cornerColor: 'rgba(255,255,255,0.92)',
    cornerStrokeColor: 'rgba(20,20,22,0.55)',
    borderColor: 'rgba(255,255,255,0.92)',
    cornerSize: 14,
    touchCornerSize: 28,
    padding: 4,
    cornerStyle: 'circle'
  })
}

async function downscaleBlobIfNeeded(blob, maxEdge = COLLAGE_SOURCE_MAX_EDGE) {
  const bitmap = await createImageBitmap(blob)
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest <= maxEdge) {
    bitmap.close?.()
    return blob
  }

  const scale = maxEdge / longest
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  return await new Promise((resolve, reject) => {
    canvas.toBlob((out) => {
      if (!out) {
        reject(new Error('collage downscale failed'))
        return
      }
      resolve(out)
    }, 'image/png', 0.96)
  })
}

function elementToDataUrl(element) {
  try {
    const width = Number(element.naturalWidth || element.width || 0)
    const height = Number(element.naturalHeight || element.height || 0)
    if (!width || !height) return ''
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(element, 0, 0, width, height)
    return canvas.toDataURL('image/png', 1)
  } catch {
    return ''
  }
}

export function useCollageCanvas() {
  const hostRef = ref(null)
  const canvasElRef = ref(null)
  const fabricRef = shallowRef(null)
  const ready = ref(false)
  const objectCount = ref(0)
  const hasSelection = ref(false)
  const ratioKey = ref('1:1')
  const backgroundColor = ref('#ffffff')
  const transparentBackground = ref(false)
  const exportEdge = ref(2048)
  const busy = ref(false)
  const errorText = ref('')
  const snapEnabled = ref(true)

  const aspectRatio = computed(() => resolveCollageRatio(ratioKey.value))
  const canAddMore = computed(() => objectCount.value < COLLAGE_MAX_IMAGES)

  let displaySize = { width: 0, height: 0 }
  let resizeObserver = null
  const sessionObjectUrls = new Set()
  let guidelines = null
  let guideFlashTimer = 0
  let flashV = null
  let flashH = null

  function getCanvas() {
    return fabricRef.value
  }

  function syncUiState() {
    const canvas = getCanvas()
    if (!canvas) {
      objectCount.value = 0
      hasSelection.value = false
      return
    }
    objectCount.value = canvas.getObjects().filter((obj) => obj.type === 'image' && !obj.excludeFromExport).length
    hasSelection.value = Boolean(canvas.getActiveObject() && canvas.getActiveObject().type === 'image')
  }

  function applyBackdrop() {
    const canvas = getCanvas()
    if (!canvas) return
    canvas.backgroundColor = transparentBackground.value ? '' : backgroundColor.value
    canvas.requestRenderAll()
  }

  function layoutDisplaySize() {
    const host = hostRef.value
    if (!host) return { width: 0, height: 0 }
    const rect = host.getBoundingClientRect()
    const padding = 8
    return fitBoxInto(
      Math.max(0, rect.width - padding * 2),
      Math.max(0, rect.height - padding * 2),
      aspectRatio.value || undefined
    )
  }

  function applyCanvasSize() {
    const canvas = getCanvas()
    if (!canvas) return

    const size = layoutDisplaySize()
    if (!size.width || !size.height) return

    const prevW = canvas.getWidth() || 0
    const prevH = canvas.getHeight() || 0
    const nextW = size.width
    const nextH = size.height
    displaySize = size

    if (prevW > 1 && prevH > 1 && (Math.abs(prevW - nextW) > 0.5 || Math.abs(prevH - nextH) > 0.5)) {
      const sx = nextW / prevW
      const sy = nextH / prevH
      const uniform = Math.min(sx, sy)
      canvas.getObjects().forEach((obj) => {
        if (!obj || obj.type !== 'image' || obj.excludeFromExport) return
        obj.set({
          left: (Number(obj.left) || 0) * sx,
          top: (Number(obj.top) || 0) * sy,
          scaleX: (Number(obj.scaleX) || 1) * uniform,
          scaleY: (Number(obj.scaleY) || 1) * uniform
        })
        obj.setCoords()
      })
    }

    canvas.setZoom(1)
    canvas.setDimensions({ width: nextW, height: nextH })
    canvas.calcOffset()
    canvas.requestRenderAll()
  }

  function bindCanvasEvents(canvas) {
    canvas.on('selection:created', syncUiState)
    canvas.on('selection:updated', syncUiState)
    canvas.on('selection:cleared', syncUiState)
    canvas.on('object:modified', syncUiState)
    canvas.on('object:added', (event) => {
      if (event?.target?.excludeFromExport) return
      syncUiState()
    })
    canvas.on('object:removed', (event) => {
      if (event?.target?.excludeFromExport) return
      syncUiState()
    })
    canvas.on('mouse:up', syncUiState)
  }

  async function init() {
    await nextTick()
    const host = hostRef.value
    const canvasEl = canvasElRef.value
    if (!host || !canvasEl || fabricRef.value) return

    await new Promise((resolve) => requestAnimationFrame(() => resolve()))

    const size = layoutDisplaySize()
    const fabricCanvas = new Canvas(canvasEl, {
      width: Math.max(1, size.width || 320),
      height: Math.max(1, size.height || 320),
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: false,
      backgroundColor: transparentBackground.value ? '' : backgroundColor.value
    })

    fabricCanvas.setZoom(1)
    bindCanvasEvents(fabricCanvas)

    guidelines = createCollageAlignGuidelines(fabricCanvas, {
      isEnabled: () => Boolean(snapEnabled.value)
    })
    guidelines.init()

    fabricRef.value = fabricCanvas
    ready.value = true
    displaySize = size

    resizeObserver = new ResizeObserver(() => {
      applyCanvasSize()
    })
    resizeObserver.observe(host)
  }

  function setRatio(key) {
    ratioKey.value = key
    applyCanvasSize()
  }

  function setSolidColor(color) {
    backgroundColor.value = color
    transparentBackground.value = false
    applyBackdrop()
  }

  function setTransparent(enabled) {
    transparentBackground.value = Boolean(enabled)
    applyBackdrop()
  }

  function setSnapEnabled(enabled) {
    snapEnabled.value = Boolean(enabled)
  }

  function getActiveImage() {
    const active = getCanvas()?.getActiveObject()
    return active && active.type === 'image' && !active.excludeFromExport ? active : null
  }

  function flashAlignGuide(mode) {
    const canvas = getCanvas()
    if (!canvas) return
    const w = canvas.getWidth()
    const h = canvas.getHeight()
    flashV = mode === 'centerH' || mode === 'center' ? w / 2
      : mode === 'left' ? 0
        : mode === 'right' ? w : null
    flashH = mode === 'centerV' || mode === 'center' ? h / 2
      : mode === 'top' ? 0
        : mode === 'bottom' ? h : null

    const onAfter = () => {
      const ctx = canvas.getSelectionContext()
      try {
        canvas.clearContext(ctx)
      } catch {
        // ignore
      }
      const draw = (x1, y1, x2, y2) => {
        ctx.save()
        ctx.lineWidth = 1
        ctx.strokeStyle = '#4f6ef7'
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.restore()
      }
      if (flashV != null) draw(flashV, 0, flashV, h)
      if (flashH != null) draw(0, flashH, w, flashH)
    }

    const cleanup = () => {
      canvas.off('after:render', onAfter)
      try {
        canvas.clearContext(canvas.getSelectionContext())
      } catch {
        // ignore
      }
      flashV = null
      flashH = null
    }

    canvas.on('after:render', onAfter)
    canvas.requestRenderAll()
    if (guideFlashTimer) clearTimeout(guideFlashTimer)
    guideFlashTimer = setTimeout(() => {
      cleanup()
      guideFlashTimer = 0
    }, 450)
  }

  function alignActive(mode) {
    const canvas = getCanvas()
    const active = getActiveImage()
    if (!canvas || !active || !mode) return

    const rect = active.getBoundingRect(true, true)
    const { dx, dy } = computeAlignDelta(rect, canvas.getWidth(), canvas.getHeight(), mode)
    if (!dx && !dy) return

    active.set({
      left: (Number(active.left) || 0) + dx,
      top: (Number(active.top) || 0) + dy
    })
    active.setCoords()
    canvas.requestRenderAll()
    flashAlignGuide(mode)
  }

  function fitActiveToCanvas() {
    const canvas = getCanvas()
    const active = getActiveImage()
    if (!canvas || !active) return
    const w = canvas.getWidth()
    const h = canvas.getHeight()
    const scale = Math.min(w / (Number(active.width) || 1), h / (Number(active.height) || 1))
    active.set({
      left: w / 2,
      top: h / 2,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
      angle: 0
    })
    active.setCoords()
    canvas.requestRenderAll()
    alignActive('center')
  }

  async function addImageFromFile(file) {
    const canvas = getCanvas()
    if (!canvas || !file) return false

    const allowed = clampCollageImageCount(objectCount.value, 1)
    if (allowed <= 0) return false

    const prepared = await downscaleBlobIfNeeded(file)
    const url = URL.createObjectURL(prepared)
    sessionObjectUrls.add(url)
    try {
      const image = await FabricImage.fromURL(url)
      const element = image.getElement?.() || image._element
      if (element) {
        const baked = elementToDataUrl(element)
        if (baked) {
          await image.setSrc(baked)
        }
      }
      const scale = scaleToFitObject(
        image.width,
        image.height,
        displaySize.width || canvas.getWidth(),
        displaySize.height || canvas.getHeight()
      )
      image.set({
        left: (displaySize.width || canvas.getWidth()) / 2,
        top: (displaySize.height || canvas.getHeight()) / 2,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale
      })
      configureControls(image)
      canvas.add(image)
      canvas.setActiveObject(image)
      canvas.requestRenderAll()
      syncUiState()
      return true
    } catch (error) {
      URL.revokeObjectURL(url)
      sessionObjectUrls.delete(url)
      throw error
    }
  }

  async function addImagesFromFiles(files) {
    const list = Array.from(files || []).filter((file) => file && String(file.type || '').startsWith('image/'))
    if (!list.length) return 0

    const allowed = clampCollageImageCount(objectCount.value, list.length)
    let added = 0
    busy.value = true
    errorText.value = ''
    try {
      for (const file of list.slice(0, allowed)) {
        const ok = await addImageFromFile(file)
        if (ok) added += 1
      }
    } catch (error) {
      errorText.value = error?.message || String(error)
    } finally {
      busy.value = false
    }
    return added
  }

  function removeActive() {
    const canvas = getCanvas()
    const active = getActiveImage()
    if (!canvas || !active) return
    canvas.remove(active)
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    syncUiState()
  }

  function duplicateActive() {
    const canvas = getCanvas()
    const active = getActiveImage()
    if (!canvas || !active) return false
    active.clone().then((cloned) => {
      configureControls(cloned)
      cloned.set({
        left: (Number(active.left) || 0) + 24,
        top: (Number(active.top) || 0) + 24
      })
      canvas.add(cloned)
      canvas.setActiveObject(cloned)
      canvas.requestRenderAll()
      syncUiState()
    }).catch(() => {})
  }

  function moveActive(direction) {
    const canvas = getCanvas()
    const active = getActiveImage()
    if (!canvas || !active) return
    const bringForward = canvas.bringObjectForward?.bind(canvas) || canvas.bringForward?.bind(canvas)
    const sendBackwards = canvas.sendObjectBackwards?.bind(canvas) || canvas.sendBackwards?.bind(canvas)
    const bringToFront = canvas.bringObjectToFront?.bind(canvas) || canvas.bringToFront?.bind(canvas)
    const sendToBack = canvas.sendObjectToBack?.bind(canvas) || canvas.sendToBack?.bind(canvas)
    switch (direction) {
      case 'front':
        bringToFront?.(active)
        break
      case 'back':
        sendToBack?.(active)
        break
      case 'up':
        bringForward?.(active)
        break
      case 'down':
        sendBackwards?.(active)
        break
      default:
        break
    }
    canvas.requestRenderAll()
  }

  function clearAll() {
    const canvas = getCanvas()
    if (!canvas) return
    canvas.getObjects().forEach((obj) => {
      if (obj.type === 'image' && !obj.excludeFromExport) {
        canvas.remove(obj)
      }
    })
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    syncUiState()
  }

  function deselect() {
    const canvas = getCanvas()
    if (!canvas) return
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    syncUiState()
  }

  function handleHostPointerDown(event) {
    if (event.target === hostRef.value) {
      deselect()
    }
  }

  async function exportCollage({ format = 'image/png', maxEdge } = {}) {
    const canvas = getCanvas()
    if (!canvas) throw new Error('collage canvas not ready')

    busy.value = true
    errorText.value = ''
    try {
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      // 给一帧让 selection overlay 清掉，避免画进导出
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))

      const edge = resolveCollageExportEdge(maxEdge || exportEdge.value)
      const fabricW = canvas.getWidth() || 1
      const fabricH = canvas.getHeight() || 1
      const { scale: k } = resolveExportPixelSize(fabricW, fabricH, edge)

      let out = null
      try {
        out = canvas.toCanvasElement(k)
      } catch {
        out = null
      }

      if (!out || out.width < 1 || out.height < 1) {
        const { width: outW, height: outH } = resolveExportPixelSize(fabricW, fabricH, edge)
        out = document.createElement('canvas')
        out.width = outW
        out.height = outH
        const ctx = out.getContext('2d')
        if (format === 'image/jpeg' || !transparentBackground.value) {
          ctx.fillStyle = transparentBackground.value ? '#ffffff' : backgroundColor.value
          ctx.fillRect(0, 0, out.width, out.height)
        }
        const objects = canvas.getObjects().filter((obj) => obj && obj.type === 'image' && obj.visible !== false && !obj.excludeFromExport)
        for (const obj of objects) {
          const el = obj.getElement?.() || obj._element
          if (!el || !(el.naturalWidth || el.width)) continue
          const m = obj.calcTransformMatrix?.()
          if (!m) continue
          ctx.save()
          ctx.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k)
          const w = Number(obj.width) || el.naturalWidth || el.width
          const h = Number(obj.height) || el.naturalHeight || el.height
          ctx.drawImage(el, -w / 2, -h / 2, w, h)
          ctx.restore()
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }

      // 单次编码：JPEG 直接出；PNG 默认一次，过大再低成本转 JPEG（不再 Image 二次解码）
      const wantJpeg = format === 'image/jpeg'
      const jpegQuality = edge >= 2048 ? 0.86 : 0.92
      let encoded = await exportCanvasToBlob(out, {
        format: wantJpeg ? 'image/jpeg' : 'image/png',
        quality: jpegQuality,
        fillColor: backgroundColor.value || '#ffffff'
      })
      let finalBlob = encoded.blob
      let finalWidth = encoded.width
      let finalHeight = encoded.height

      if (!wantJpeg && finalBlob.size > 1.5 * 1024 * 1024) {
        const jpeg = await exportCanvasToBlob(out, {
          format: 'image/jpeg',
          quality: jpegQuality,
          fillColor: backgroundColor.value || '#ffffff'
        })
        if (jpeg.blob.size < finalBlob.size * 0.6) {
          finalBlob = jpeg.blob
          finalWidth = jpeg.width
          finalHeight = jpeg.height
        }
      }

      const isJpeg = finalBlob.type.includes('jpeg')
      const ext = isJpeg ? 'jpg' : 'png'
      const file = new File([finalBlob], collageFileName(ext), {
        type: finalBlob.type || 'image/png',
        lastModified: Date.now()
      })
      return {
        blob: finalBlob,
        width: finalWidth,
        height: finalHeight,
        bytes: finalBlob.size,
        format: isJpeg ? 'image/jpeg' : 'image/png',
        file
      }
    } catch (error) {
      errorText.value = error?.message || String(error)
      throw error
    } finally {
      busy.value = false
    }
  }

  function dispose() {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (guideFlashTimer) {
      clearTimeout(guideFlashTimer)
      guideFlashTimer = 0
    }
    guidelines?.destroy()
    guidelines = null
    sessionObjectUrls.forEach((url) => URL.revokeObjectURL(url))
    sessionObjectUrls.clear()
    try {
      fabricRef.value?.clear()
    } catch {
      // ignore
    }
    fabricRef.value?.dispose()
    fabricRef.value = null
    ready.value = false
    objectCount.value = 0
    hasSelection.value = false
  }

  onBeforeUnmount(() => {
    dispose()
  })

  return {
    hostRef,
    canvasElRef,
    ready,
    objectCount,
    hasSelection,
    ratioKey,
    backgroundColor,
    transparentBackground,
    exportEdge,
    busy,
    errorText,
    snapEnabled,
    aspectRatio,
    canAddMore,
    init,
    dispose,
    setRatio,
    setSolidColor,
    setTransparent,
    setSnapEnabled,
    alignActive,
    fitActiveToCanvas,
    addImagesFromFiles,
    removeActive,
    duplicateActive,
    moveActive,
    clearAll,
    deselect,
    handleHostPointerDown,
    exportCollage,
    applyCanvasSize
  }
}
