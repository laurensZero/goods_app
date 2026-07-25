import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import jsQR from 'jsqr'
import { extractIdsFromInput } from '@/utils/share/goods'
import { parseStorageQrUrl, persistStorageQrFilter } from '@/utils/storageQr'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { useI18n } from 'vue-i18n'

const CAMERA_CONSTRAINTS = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 960 },
    height: { ideal: 720 },
    frameRate: { ideal: 24 }
  },
  audio: false
}

const NATIVE_SCAN_DELAY_MS = 220
const CANVAS_SCAN_DELAY_MS = 420
const VIDEO_CANVAS_SCAN_SIZE = 256
const VIDEO_CROP_RATIO = 0.9
const GALLERY_SCAN_MAX_EDGE = 1400

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
  let scannerLoopToken = 0
  let scannerResolved = false
  let scannerBusy = false
  let scannerCanvasContext = null
  let barcodeDetector = null
  let barcodeDetectorUnavailable = false
  let nativeVideoDetectorDisabled = false
  let nativeVideoMissCount = 0

  function onScannerVideoReady() {
    scannerReady.value = true
    startScannerLoop()
  }

  function getCanvasContext(canvas) {
    if (!canvas) return null
    if (!scannerCanvasContext) {
      scannerCanvasContext = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: true
      })
    }
    return scannerCanvasContext
  }

  function setCanvasSize(canvas, size) {
    if (!canvas) return
    if (canvas.width === size && canvas.height === size) return
    canvas.width = size
    canvas.height = size
    scannerCanvasContext = null
  }

  async function getBarcodeDetector() {
    if (barcodeDetectorUnavailable) return null
    if (barcodeDetector) return barcodeDetector

    const Detector = globalThis.BarcodeDetector
    if (!Detector) {
      barcodeDetectorUnavailable = true
      return null
    }

    try {
      if (typeof Detector.getSupportedFormats === 'function') {
        const formats = await Detector.getSupportedFormats()
        if (Array.isArray(formats) && !formats.includes('qr_code')) {
          barcodeDetectorUnavailable = true
          return null
        }
      }
      barcodeDetector = new Detector({ formats: ['qr_code'] })
      return barcodeDetector
    } catch {
      barcodeDetectorUnavailable = true
      return null
    }
  }

  async function decodeQrWithNativeDetector(source) {
    const detector = await getBarcodeDetector()
    if (!detector) return { available: false, text: '' }

    try {
      const results = await detector.detect(source)
      const match = Array.isArray(results)
        ? results.find((item) => String(item?.rawValue || '').trim())
        : null
      return {
        available: true,
        text: String(match?.rawValue || '').trim()
      }
    } catch {
      return { available: false, text: '' }
    }
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
    const nativeResult = await decodeQrWithNativeDetector(image)
    if (nativeResult.text) return nativeResult.text

    const scale = Math.min(1, GALLERY_SCAN_MAX_EDGE / Math.max(image.width, image.height))
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

  function decodeQrFromVideoFrameByCanvas(video, canvas) {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return ''

    const sourceSize = Math.floor(Math.min(vw, vh) * VIDEO_CROP_RATIO)
    const sx = Math.max(0, Math.floor((vw - sourceSize) / 2))
    const sy = Math.max(0, Math.floor((vh - sourceSize) / 2))

    setCanvasSize(canvas, VIDEO_CANVAS_SCAN_SIZE)
    const ctx = getCanvasContext(canvas)
    if (!ctx) return ''

    ctx.drawImage(video, sx, sy, sourceSize, sourceSize, 0, 0, VIDEO_CANVAS_SCAN_SIZE, VIDEO_CANVAS_SCAN_SIZE)
    const imageData = ctx.getImageData(0, 0, VIDEO_CANVAS_SCAN_SIZE, VIDEO_CANVAS_SCAN_SIZE)

    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    })

    return String(result?.data || '').trim()
  }

  async function decodeQrFromVideoFrame() {
    if (scannerBusy || scannerResolved) return ''
    const video = scannerVideoRef.value
    const canvas = scannerCanvasRef.value
    if (!video || !canvas || video.readyState < 2) return ''

    scannerBusy = true

    try {
      if (!nativeVideoDetectorDisabled) {
        const nativeResult = await decodeQrWithNativeDetector(video)
        if (nativeResult.text) {
          nativeVideoMissCount = 0
          return nativeResult.text
        }

        if (nativeResult.available) {
          nativeVideoMissCount += 1
          // Native detection is cheap enough for regular polling. Run the
          // jsQR fallback occasionally in case the WebView detector misses.
          if (nativeVideoMissCount % 6 !== 0) return ''
        } else {
          nativeVideoDetectorDisabled = true
        }
      }

      return decodeQrFromVideoFrameByCanvas(video, canvas)
    } finally {
      scannerBusy = false
    }
  }

  function getNextScanDelay(durationMs) {
    const base = nativeVideoDetectorDisabled ? CANVAS_SCAN_DELAY_MS : NATIVE_SCAN_DELAY_MS
    if (!Number.isFinite(durationMs) || durationMs <= 0) return base
    return Math.max(base, Math.min(720, Math.round(durationMs * 2.5)))
  }

  function scheduleScannerTick(delayMs, token = scannerLoopToken) {
    if (scannerTimer || scannerResolved || !showScanner.value) return
    scannerTimer = window.setTimeout(() => {
      scannerTimer = 0
      void runScannerTick(token)
    }, delayMs)
  }

  async function runScannerTick(token) {
    if (token !== scannerLoopToken || scannerResolved || !showScanner.value) return

    if (document.visibilityState === 'hidden') {
      scheduleScannerTick(700, token)
      return
    }

    const startedAt = performance.now()
    try {
      const text = await decodeQrFromVideoFrame()
      if (text) {
        await onScannerQRFound(text)
        return
      }
    } catch {
      // skip frame errors
    }

    scheduleScannerTick(getNextScanDelay(performance.now() - startedAt), token)
  }

  async function onScannerQRFound(text) {
    if (scannerResolved) return
    scannerResolved = true

    const storagePath = parseStorageQrUrl(text)
    if (storagePath) {
      stopScanner()
      persistStorageQrFilter(storagePath)
      showScanner.value = false
      scanError.value = ''
      runWithRouteTransition(
        () => router.push('/home'),
        { direction: 'forward' }
      )
      return
    }

    const { shareId } = extractIdsFromInput(text)

    if (!shareId) {
      stopScannerLoop()
      scannerHint.value = t('my.scanInvalidQrCode')
      setTimeout(() => {
        scannerResolved = false
        scannerHint.value = t('my.scannerHint')
        startScannerLoop()
      }, 1500)
      return
    }

    stopScanner()
    showScanner.value = false
    scanError.value = ''
    runWithRouteTransition(
      () => router.push({ name: 'share-import', params: { shareId } }),
      { direction: 'forward' }
    )
  }

  function startScannerLoop() {
    stopScannerLoop()
    scannerLoopToken += 1
    scheduleScannerTick(120, scannerLoopToken)
  }

  function stopScannerLoop() {
    scannerLoopToken += 1
    if (scannerTimer) {
      clearTimeout(scannerTimer)
      scannerTimer = 0
    }
  }

  function stopScanner() {
    stopScannerLoop()
    if (scannerStream) {
      scannerStream.getTracks().forEach((track) => track.stop())
      scannerStream = null
    }
    if (scannerVideoRef.value) {
      scannerVideoRef.value.srcObject = null
    }
    scannerCanvasContext = null
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
    nativeVideoDetectorDisabled = false
    nativeVideoMissCount = 0
    showScanner.value = true

    await nextTick()

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia unavailable')
      }

      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
      scannerStream = stream
      if (scannerVideoRef.value) {
        scannerVideoRef.value.srcObject = stream
        await scannerVideoRef.value.play?.().catch(() => {})
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

        const storagePath = parseStorageQrUrl(text)
        if (storagePath) {
          persistStorageQrFilter(storagePath)
          scanning.value = false
          runWithRouteTransition(
            () => router.push('/home'),
            { direction: 'forward' }
          )
          return
        }

        const { shareId } = extractIdsFromInput(text)
        if (!shareId) {
          scanError.value = t('my.scanInvalidQrContent')
          scanning.value = false
          return
        }

        scanning.value = false
        runWithRouteTransition(
          () => router.push({ name: 'share-import', params: { shareId } }),
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

  // 组件销毁时清理摄像头流，防止泄漏
  onBeforeUnmount(() => {
    closeScanner()
  })

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
