import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import jsQR from 'jsqr'
import { extractIdsFromInput } from '@/utils/share/goods'
import { parseStorageQrUrl, persistStorageQrFilter } from '@/utils/storage/storageQr'
import { parseWebLoginQrContent, approveWebLoginChallenge } from '@/utils/auth/webLogin'
import { showGlobalToast } from '@/utils/globalToast'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

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
// 关闭时等弹层淡出后再拆流：过早 pause/srcObject=null 会在 WebView 闪原生播放按钮。
const STREAM_TEARDOWN_DELAY_MS = 360
const NATIVE_SCANNER_BODY_CLASS = 'barcode-scanner-active'

export function useQrScanner() {
  const { t } = useI18n()
  const router = useRouter()
  const authStore = useAuthStore()

  const scanning = ref(false)
  const scanError = ref('')
  const showScanner = ref(false)
  const scannerReady = ref(false)
  // Android WebView 会给空 <video> 画原生播放按钮占位；仅在有相机流时才挂载视频。
  const cameraActive = ref(false)
  // 原生 ML Kit 模式：相机在 WebView 后面，本组件只负责 UI 与结果处理。
  const nativeMode = ref(false)
  const scannerVideoRef = ref(null)
  const scannerCanvasRef = ref(null)
  const scannerHint = ref('')
  const showWebLoginConfirm = ref(false)
  const pendingWebLoginId = ref('')
  const pendingWebLoginType = ref('web')
  const pendingWebLoginName = ref('')
  const isApprovingWebLogin = ref(false)
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
  let pendingStream = null
  let pendingVideo = null
  let streamTeardownTimer = 0
  let mlkitListener = null
  let mlkitScanRunning = false

  function isNativeScannerPlatform() {
    return Capacitor.isNativePlatform()
  }

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
    if (isNativeScannerPlatform()) {
      try {
        const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
          path: image.src,
          formats: [BarcodeFormat.QrCode]
        })
        const nativeText = String(barcodes?.[0]?.rawValue || '').trim()
        if (nativeText) return nativeText
      } catch {
        // fall through to web decode
      }
    }

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

  /** 扫到网页/平板登录码：停摄像头，弹确认（不自动 approve） */
  function beginWebLoginConfirm(challengeId, deviceType = 'web', deviceName = '') {
    stopScanner()
    showScanner.value = false
    scanning.value = false
    scanError.value = ''
    pendingWebLoginId.value = challengeId
    pendingWebLoginType.value = deviceType === 'tablet' ? 'tablet' : 'web'
    pendingWebLoginName.value = String(deviceName || '').slice(0, 64)
    showWebLoginConfirm.value = true
  }

  function cancelWebLoginConfirm() {
    showWebLoginConfirm.value = false
    pendingWebLoginId.value = ''
    pendingWebLoginType.value = 'web'
    pendingWebLoginName.value = ''
    isApprovingWebLogin.value = false
  }

  async function confirmWebLogin() {
    const challengeId = pendingWebLoginId.value
    if (!challengeId || isApprovingWebLogin.value) return

    if (!authStore.isLoggedIn || !authStore.session?.access_token) {
      cancelWebLoginConfirm()
      showGlobalToast(t('my.authQrNeedLogin'))
      return
    }

    isApprovingWebLogin.value = true
    try {
      await approveWebLoginChallenge(challengeId, authStore.session.access_token)
      showGlobalToast(t('my.authQrApproved'))
      cancelWebLoginConfirm()
    } catch (e) {
      const msg = String(e?.message || '')
      if (msg.includes('unauthorized') || msg.includes('missing_token')) {
        showGlobalToast(t('my.authQrNeedLogin'))
      } else if (msg.includes('invalid_status') || msg.includes('not_found')) {
        showGlobalToast(t('my.authQrExpired'))
      } else if (msg.includes('session_issue')) {
        showGlobalToast(t('my.authQrSessionIssue'))
      } else {
        showGlobalToast(t('my.authQrError'))
      }
      cancelWebLoginConfirm()
    } finally {
      isApprovingWebLogin.value = false
    }
  }

  function resumeAfterInvalidQr(messageKey) {
    scannerHint.value = t(messageKey)
    setTimeout(() => {
      if (!showScanner.value) return
      scannerResolved = false
      scannerHint.value = t('my.scannerHint')
      if (nativeMode.value) {
        void startMlkitScan()
        return
      }
      startScannerLoop()
    }, 1500)
  }

  async function handleScannedText(text) {
    const webLogin = parseWebLoginQrContent(text)
    if (webLogin.challengeId) {
      beginWebLoginConfirm(webLogin.challengeId, webLogin.deviceType, webLogin.deviceName)
      return true
    }

    const storagePath = parseStorageQrUrl(text)
    if (storagePath) {
      stopScanner()
      persistStorageQrFilter(storagePath)
      showScanner.value = false
      scanError.value = ''
      scanning.value = false
      runWithRouteTransition(
        () => router.push('/home'),
        { direction: 'forward' }
      )
      return true
    }

    const { shareId } = extractIdsFromInput(text)

    if (!shareId) {
      scannerResolved = true
      resumeAfterInvalidQr('my.scanInvalidQrCode')
      return false
    }

    stopScanner()
    showScanner.value = false
    scanError.value = ''
    scanning.value = false
    runWithRouteTransition(
      () => router.push({ name: 'share-import', params: { shareId } }),
      { direction: 'forward' }
    )
    return true
  }

  async function onScannerQRFound(text) {
    if (scannerResolved) return
    scannerResolved = true
    await handleScannedText(text)
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

  function flushPendingStreamTeardown() {
    if (streamTeardownTimer) {
      clearTimeout(streamTeardownTimer)
      streamTeardownTimer = 0
    }

    const stream = pendingStream
    const video = pendingVideo
    pendingStream = null
    pendingVideo = null

    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    if (video) {
      try {
        video.srcObject = null
      } catch {
        // ignore detach errors
      }
    }
  }

  function hideScannerVideoEl(video) {
    if (!video || !video.style) return
    // 同步掐掉原生合成层，避免淡出期间闪播放按钮占位。
    video.style.setProperty('opacity', '0', 'important')
    video.style.setProperty('visibility', 'hidden', 'important')
    video.style.setProperty('display', 'none', 'important')
  }

  function setNativeScannerChrome(active) {
    if (active) {
      document.body.classList.add(NATIVE_SCANNER_BODY_CLASS)
    } else {
      document.body.classList.remove(NATIVE_SCANNER_BODY_CLASS)
    }
  }

  async function stopMlkitScan(options = {}) {
    const { keepChrome = false } = options
    if (mlkitListener) {
      try {
        await mlkitListener.remove()
      } catch {
        // ignore
      }
      mlkitListener = null
    }
    if (mlkitScanRunning) {
      mlkitScanRunning = false
      try {
        await BarcodeScanner.stopScan()
      } catch {
        // ignore
      }
    }
    if (!keepChrome) {
      setNativeScannerChrome(false)
    }
  }

  function stopScanner() {
    stopScannerLoop()
    scannerReady.value = false
    void stopMlkitScan()

    const video = scannerVideoRef.value
    hideScannerVideoEl(video)
    cameraActive.value = false
    nativeMode.value = false

    const stream = scannerStream
    scannerStream = null

    flushPendingStreamTeardown()
    pendingStream = stream
    pendingVideo = video

    if (stream || video) {
      streamTeardownTimer = window.setTimeout(() => {
        streamTeardownTimer = 0
        flushPendingStreamTeardown()
      }, STREAM_TEARDOWN_DELAY_MS)
    }

    scannerCanvasContext = null
  }

  function closeScanner() {
    stopScanner()
    showScanner.value = false
    scanning.value = false
  }

  async function startMlkitScan() {
    if (!showScanner.value || !nativeMode.value) return
    if (mlkitScanRunning) return

    try {
      // 相册/权限页回来后可能丢掉透明层，重启前先恢复。
      setNativeScannerChrome(true)

      mlkitListener = await BarcodeScanner.addListener('barcodesScanned', async (event) => {
        if (scannerResolved || !showScanner.value) return

        const barcodes = Array.isArray(event?.barcodes) ? event.barcodes : []
        const match = barcodes.find((barcode) => {
          const text = String(barcode?.rawValue || '').trim()
          return Boolean(text) && isBarcodeInsideNativeFrame(barcode)
        })
        const text = String(match?.rawValue || '').trim()
        if (!text) return

        scannerResolved = true
        // 先保留透明层：非法码要继续扫，关闭时由 stopScanner 统一拆。
        await stopMlkitScan({ keepChrome: true })
        await handleScannedText(text)
      })

      mlkitScanRunning = true
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode]
      })
    } catch {
      // 原生扫码失败时回退到 WebView 预览路径。
      mlkitScanRunning = false
      await stopMlkitScan()
      nativeMode.value = false
      await openWebScanner()
    }
  }

  /** 插件不支持原生识别区；用 cornerPoints 中心点卡在取景框内，避免框外误触发。 */
  function isBarcodeInsideNativeFrame(barcode) {
    const points = Array.isArray(barcode?.cornerPoints) ? barcode.cornerPoints : []
    if (points.length === 0) return true

    const viewport = document.querySelector('.scanner-viewport--native')
    if (!viewport) return true

    const rect = viewport.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return true

    let sumX = 0
    let sumY = 0
    let count = 0
    for (const point of points) {
      const x = Array.isArray(point) ? point[0] : point?.x
      const y = Array.isArray(point) ? point[1] : point?.y
      if (!Number.isFinite(x) || !Number.isFinite(y)) return true
      sumX += x
      sumY += y
      count += 1
    }
    if (count === 0) return true

    const cx = sumX / count
    const cy = sumY / count
    const pad = 12
    return (
      cx >= rect.left - pad &&
      cx <= rect.right + pad &&
      cy >= rect.top - pad &&
      cy <= rect.bottom + pad
    )
  }

  async function tryOpenMlkitScanner() {
    if (!isNativeScannerPlatform()) return false

    try {
      const { supported } = await BarcodeScanner.isSupported()
      if (!supported) return false

      const permission = await BarcodeScanner.requestPermissions()
      if (permission?.camera && permission.camera !== 'granted') {
        return false
      }
    } catch {
      return false
    }

    scanning.value = true
    scanError.value = ''
    scannerResolved = false
    nativeVideoDetectorDisabled = false
    nativeVideoMissCount = 0
    nativeMode.value = true
    cameraActive.value = false
    scannerReady.value = true
    scannerHint.value = t('my.scannerHint')
    showScanner.value = true
    document.body.classList.add(NATIVE_SCANNER_BODY_CLASS)

    await nextTick()
    await startMlkitScan()
    return true
  }

  async function openWebScanner() {
    scanning.value = true
    scanError.value = ''
    scannerResolved = false
    nativeVideoDetectorDisabled = false
    nativeVideoMissCount = 0
    nativeMode.value = false
    showScanner.value = true

    await nextTick()

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia unavailable')
      }

      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
      scannerStream = stream
      cameraActive.value = true
      await nextTick()
      const video = scannerVideoRef.value
      if (video) {
        video.srcObject = stream
        await video.play?.().catch(() => {})
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

        const handled = await handleScannedText(text)
        if (!handled && !showScanner.value) {
          scanning.value = false
        }
      } catch (e2) {
        const message = String(e2?.message || '')
        if (!message || !/cancel|canceled|cancelled/i.test(message)) {
          scanError.value = e2?.message || t('my.scanFailed')
        }
        scanning.value = false
      }
    }
  }

  async function openScanner() {
    // 若上一路相机还在延迟拆流，先立刻释放，避免双流。
    flushPendingStreamTeardown()
    await stopMlkitScan()

    const usedNative = await tryOpenMlkitScanner()
    if (usedNative) return

    await openWebScanner()
  }

  async function handleScannerGallery() {
    if (scannerResolved) return
    stopScannerLoop()
    // 只停相机，保留原生透明层；否则取消相册后会变成贴在页面上的空框。
    await stopMlkitScan({ keepChrome: nativeMode.value })

    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Photos,
        resultType: CameraResultType.Uri,
        quality: 92,
        promptLabelHeader: t('my.scanFromGallery')
      })

      const src = String(photo?.webPath || photo?.path || '').trim()
      if (!src) {
        if (nativeMode.value) {
          await startMlkitScan()
          return
        }
        startScannerLoop()
        return
      }

      const image = await loadImageFromSrc(src)
      const text = await decodeQrFromImageElement(image)

      if (text) {
        scannerResolved = true
        await handleScannedText(text)
      } else {
        resumeAfterInvalidQr('my.scanNoQRRetry')
      }
    } catch (e) {
      const message = String(e?.message || '')
      if (!message || !/cancel|canceled|cancelled/i.test(message)) {
        scanError.value = e?.message || t('my.galleryReadFailed')
      }
      if (nativeMode.value && showScanner.value) {
        await startMlkitScan()
        return
      }
      if (!showScanner.value) return
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
    flushPendingStreamTeardown()
  })

  return {
    scanning,
    scanError,
    showScanner,
    scannerReady,
    cameraActive,
    nativeMode,
    scannerVideoRef,
    scannerCanvasRef,
    scannerHint,
    showWebLoginConfirm,
    pendingWebLoginId,
    pendingWebLoginType,
    pendingWebLoginName,
    isApprovingWebLogin,
    openScanner,
    closeScanner,
    handleScannerGallery,
    onScannerVideoReady,
    resetScannerState,
    cancelWebLoginConfirm,
    confirmWebLogin
  }
}
