import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import jsQR from 'jsqr'
import { extractIdsFromInput } from '@/utils/share/goods'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { useI18n } from 'vue-i18n'

export function useQrScanner() {
  const { t } = useI18n()
  const router = useRouter()

  const scanning = ref(false)
  const scanError = ref('')
  const showScanner = ref(false)
  const scannerReady = ref(false)
  const scannerVideoRef = ref(null)
  const scannerCanvasRef = ref(null)
  const scannerHint = ref('')
  let scannerStream = null
  let scannerTimer = 0
  let scannerResolved = false
  let scannerBusy = false

  function onScannerVideoReady() {
    scannerReady.value = true
    startScannerLoop()
  }

  function loadImageFromSrc(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.decoding = 'async'
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(t('my.qrLoadFailed')))
      img.src = src
    })
  }

  async function decodeQrFromImageElement(image) {
    const maxEdge = 1600
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
    const width = Math.max(1, Math.floor(image.width * scale))
    const height = Math.max(1, Math.floor(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''

    ctx.drawImage(image, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    })

    return String(result?.data || '').trim()
  }

  async function decodeQrFromVideoFrame() {
    if (scannerBusy) return ''
    const video = scannerVideoRef.value
    const canvas = scannerCanvasRef.value
    if (!video || !canvas || video.readyState < 2) return ''

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return ''

    scannerBusy = true

    try {
      const size = Math.min(vw, vh)
      const sx = Math.floor((vw - size) / 2)
      const sy = Math.floor((vh - size) / 2)

      const outSize = 320
      canvas.width = outSize
      canvas.height = outSize

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return ''

      ctx.drawImage(video, sx, sy, size, size, 0, 0, outSize, outSize)
      const imageData = ctx.getImageData(0, 0, outSize, outSize)

      const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      })

      return String(result?.data || '').trim()
    } finally {
      scannerBusy = false
    }
  }

  async function onScannerQRFound(text) {
    if (scannerResolved) return
    scannerResolved = true

    const { gistId, shareId } = extractIdsFromInput(text)
    stopScanner()

    if (!gistId) {
      scannerHint.value = t('my.scanInvalidShareCode')
      setTimeout(() => {
        scannerResolved = false
        scannerHint.value = t('my.scannerHint')
        startScannerLoop()
      }, 1500)
      return
    }

    const query = shareId ? { s: shareId } : {}
    showScanner.value = false
    scanError.value = ''
    runWithRouteTransition(
      () => router.push({ name: 'share-import', params: { gistId }, query }),
      { direction: 'forward' }
    )
  }

  function startScannerLoop() {
    stopScannerLoop()
    scannerTimer = window.setInterval(async () => {
      if (scannerResolved) return
      try {
        const text = await decodeQrFromVideoFrame()
        if (text) {
          await onScannerQRFound(text)
        }
      } catch {
        // skip frame errors
      }
    }, 300)
  }

  function stopScannerLoop() {
    if (scannerTimer) {
      clearInterval(scannerTimer)
      scannerTimer = 0
    }
  }

  function stopScanner() {
    stopScannerLoop()
    if (scannerStream) {
      scannerStream.getTracks().forEach((track) => track.stop())
      scannerStream = null
    }
  }

  function closeScanner() {
    stopScanner()
    scannerReady.value = false
    showScanner.value = false
    scanning.value = false
  }

  async function openScanner() {
    scanning.value = true
    scanError.value = ''
    scannerResolved = false
    showScanner.value = true

    await new Promise((resolve) => setTimeout(resolve, 100))

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      })
      scannerStream = stream
      if (scannerVideoRef.value) {
        scannerVideoRef.value.srcObject = stream
      }
      scannerHint.value = t('my.scannerHint')
    } catch {
      closeScanner()
      try {
        const photo = await Camera.getPhoto({
          source: CameraSource.Prompt,
          resultType: CameraResultType.Uri,
          quality: 92,
          promptLabelHeader: t('my.promptScanImport'),
          promptLabelPhoto: t('my.promptFromGallery'),
          promptLabelPicture: t('my.promptTakePhoto')
        })

        const src = String(photo?.webPath || photo?.path || '').trim()
        if (!src) { scanning.value = false; return }

        const image = await loadImageFromSrc(src)
        const text = await decodeQrFromImageElement(image)

        if (!text) {
          scanError.value = t('my.scanNoQR')
          scanning.value = false
          return
        }

        const { gistId, shareId } = extractIdsFromInput(text)
        if (!gistId) {
          scanError.value = t('my.scanInvalidContent')
          scanning.value = false
          return
        }

        const query = shareId ? { s: shareId } : {}
        scanning.value = false
        runWithRouteTransition(
          () => router.push({ name: 'share-import', params: { gistId }, query }),
          { direction: 'forward' }
        )
      } catch (e2) {
        const message = String(e2?.message || '')
        if (!message || !/cancel|canceled|cancelled/i.test(message)) {
          scanError.value = e2?.message || t('my.scanFailed')
        }
        scanning.value = false
      }
    }
  }

  async function handleScannerGallery() {
    if (scannerResolved) return
    stopScannerLoop()

    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Photos,
        resultType: CameraResultType.Uri,
        quality: 92,
        promptLabelHeader: t('my.scanFromGallery')
      })

      const src = String(photo?.webPath || photo?.path || '').trim()
      if (!src) { startScannerLoop(); return }

      const image = await loadImageFromSrc(src)
      const text = await decodeQrFromImageElement(image)

      if (text) {
        await onScannerQRFound(text)
      } else {
        scannerHint.value = t('my.scanNoQRRetry')
        setTimeout(() => {
          scannerResolved = false
          scannerHint.value = t('my.scannerHint')
          startScannerLoop()
        }, 1500)
      }
    } catch (e) {
      const message = String(e?.message || '')
      if (!message || !/cancel|canceled|cancelled/i.test(message)) {
        scanError.value = e?.message || t('my.galleryReadFailed')
      }
      startScannerLoop()
    }
  }

  function resetScannerState() {
    scanning.value = false
    scanError.value = ''
  }

  return {
    scanning,
    scanError,
    showScanner,
    scannerReady,
    scannerVideoRef,
    scannerCanvasRef,
    scannerHint,
    openScanner,
    closeScanner,
    handleScannerGallery,
    onScannerVideoReady,
    resetScannerState
  }
}
