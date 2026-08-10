<template>
  <div class="page event-map-page">
    <NavBar :title="t('events.map.title')" show-back @back="handleBackNavigation">
      <template #right>
        <button
          v-if="!geocoding && reGeocodableCount > 0"
          class="nav-icon-btn"
          type="button"
          :aria-label="t('events.map.locate')"
          @click="reGeocodeMissing"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
          </svg>
        </button>
      </template>
    </NavBar>

    <div ref="mapElRef" class="event-map" :class="{ 'event-map--dark': isDarkMap }" />

    <div v-if="hasLocated && !geocoding" class="map-legend">
      <span>{{ t('events.map.eventCount', { count: totalLocatedEvents }) }}</span>
      <span class="map-legend__dot" />
      <span>{{ t('events.map.placeCount', { count: mapPins.pins.length }) }}</span>
    </div>

    <Transition name="map-sheet">
      <div v-if="selectedPin" class="map-sheet">
        <div class="map-sheet__grabber" />
        <div class="map-sheet__head">
          <div class="map-sheet__head-copy">
            <p class="map-sheet__label">{{ t('events.map.venueEvents') }}</p>
            <h3 class="map-sheet__title">{{ selectedPinTitle }}</h3>
          </div>
          <button class="map-sheet__close" type="button" :aria-label="t('common.close')" @click="selectedPin = null">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div class="map-sheet__list">
          <button
            v-for="evt in selectedPin.events"
            :key="evt.id"
            class="map-sheet__item"
            type="button"
            @click="openEvent(evt)"
          >
            <span class="map-sheet__item-name">{{ evt.name || t('events.card.unnamed') }}</span>
            <span class="map-sheet__item-meta">{{ eventMeta(evt) }}</span>
          </button>
        </div>
      </div>
    </Transition>

    <Transition name="map-sheet">
      <div v-if="showUnlocated" class="map-sheet">
        <div class="map-sheet__grabber" />
        <div class="map-sheet__head">
          <div class="map-sheet__head-copy">
            <p class="map-sheet__label">{{ t('events.map.unlocated') }}</p>
            <h3 class="map-sheet__title">{{ t('events.map.unlocatedCount', { count: unlocatedEvents.length }) }}</h3>
          </div>
          <button class="map-sheet__close" type="button" :aria-label="t('common.close')" @click="showUnlocated = false">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>
        </div>
        <button
          v-if="!geocoding && reGeocodableCount > 0"
          class="map-sheet__action"
          type="button"
          @click="reGeocodeMissing"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
          </svg>
          {{ t('events.map.locateMissing', { count: reGeocodableCount }) }}
        </button>
        <div class="map-sheet__list">
          <button
            v-for="evt in unlocatedEvents"
            :key="evt.id"
            class="map-sheet__item"
            type="button"
            @click="openEvent(evt)"
          >
            <span class="map-sheet__item-name">{{ evt.name || t('events.card.unnamed') }}</span>
            <span class="map-sheet__item-meta">{{ eventMeta(evt) }}</span>
          </button>
        </div>
      </div>
    </Transition>

    <Transition name="map-fab">
      <button
        v-if="unlocatedEvents.length > 0 && !selectedPin && !showUnlocated"
        class="map-unlocated-fab"
        type="button"
        :aria-label="t('events.map.unlocated')"
        @click="showUnlocated = true"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <circle cx="12" cy="7.5" r="0.5" fill="currentColor" />
        </svg>
        {{ unlocatedEvents.length }}
      </button>
    </Transition>

    <Transition name="map-fab">
      <div v-if="geocoding" class="map-geocode-progress">
        {{ t('events.map.locatingProgress', { current: geocodeProgress.current, total: geocodeProgress.total }) }}
      </div>
    </Transition>

    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useEventsStore } from '@/stores/events'
import { useThemeStore } from '@/stores/theme'
import { geocodeAddressToCity, combineCityDistrict } from '@/utils/events/geocodeCity'
import { normalizeCityName, resolveCityCoords } from '@/utils/events/cityCoordinates'
import { loadAmap } from '@/utils/amap'
import { playRouteSceneSlide, runWithRouteTransition } from '@/utils/routeTransition'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'

defineOptions({ name: 'EventMapView' })

// 高德 JS API 使用 [经度, 纬度] 顺序（Leaflet 相反），所有坐标需转换
const CHINA_CENTER = [106, 34.5]
const CHINA_ZOOM = 4
// 中国范围（含南海诸岛）加少量边距；限制地图可平移/缩放的区域，避免缩到全球或漂到海上
const CHINA_BOUNDS = { minLat: 0, minLng: 66, maxLat: 58, maxLng: 146 }
const MIN_ZOOM = 3
// 移动端高德 JS API 2.0 支持到 20 级，放开上限让用户可以缩得更近、细节更清楚
const MAX_ZOOM = 20
const GEOFENCE_DELAY_MS = 120
const MAP_VIEW_STATE_KEY = 'event_map_view_state'

const { t } = useI18n()
const router = useRouter()
const eventsStore = useEventsStore()
const themeStore = useThemeStore()
const { toastMsg, showToast } = useToast()

const mapElRef = ref(null)
const selectedPin = ref(null)
const showUnlocated = ref(false)
const geocoding = ref(false)
const geocodeProgress = ref({ current: 0, total: 0 })

let amap = null
let map = null
let markers = []
let fitBoundsDone = false
let exiting = false
// 从地图点了 pin 进详情后返回时，需要补一次标准返回滑入动画（KeepAlive 复用不重挂载，无过渡）
let expectingDetailReturn = false
let removeAndroidBackListener = null

function bindAndroidBackButton() {
  if (removeAndroidBackListener) return
  removeAndroidBackListener = addAndroidBackButtonListener(handleAndroidBackButton)
}

function unbindAndroidBackButton() {
  if (!removeAndroidBackListener) return
  removeAndroidBackListener()
  removeAndroidBackListener = null
}

function hasStoredCoords(evt) {
  const lat = String(evt?.latitude || '').trim()
  const lng = String(evt?.longitude || '').trim()
  if (!lat || !lng) return false
  const nLat = Number(lat)
  const nLng = Number(lng)
  return Number.isFinite(nLat) && Number.isFinite(nLng) && Math.abs(nLat) <= 90 && Math.abs(nLng) <= 180
}

function resolveEventCoords(evt) {
  if (hasStoredCoords(evt)) {
    return { lat: Number(evt.latitude), lng: Number(evt.longitude), fallback: false }
  }
  if (evt?.city) {
    const cityCoords = resolveCityCoords(evt.city)
    if (cityCoords) {
      return { lat: Number(cityCoords.latitude), lng: Number(cityCoords.longitude), fallback: true }
    }
  }
  return null
}

const mapPins = computed(() => {
  const pinsMap = new Map()
  const unlocated = []
  for (const evt of eventsStore.activeList) {
    const coords = resolveEventCoords(evt)
    if (!coords) {
      unlocated.push(evt)
      continue
    }
    const key = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`
    let pin = pinsMap.get(key)
    if (!pin) {
      pin = { key, lat: coords.lat, lng: coords.lng, fallback: coords.fallback, events: [] }
      pinsMap.set(key, pin)
    }
    pin.events.push(evt)
  }
  return {
    pins: [...pinsMap.values()].map((pin) => ({
      ...pin,
      events: [...pin.events].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))
    })),
    unlocated
  }
})

const totalLocatedEvents = computed(() =>
  mapPins.value.pins.reduce((sum, pin) => sum + pin.events.length, 0)
)
const hasLocated = computed(() => mapPins.value.pins.length > 0)
const unlocatedEvents = computed(() => mapPins.value.unlocated)
const reGeocodableEvents = computed(() =>
  eventsStore.activeList.filter((evt) => {
    if (!String(evt?.location || '').trim()) return false
    return !hasStoredCoords(evt)
  })
)
const reGeocodableCount = computed(() => reGeocodableEvents.value.length)

const selectedPinTitle = computed(() => {
  const pin = selectedPin.value
  if (!pin) return ''
  const first = pin.events[0]
  // 城市兜底针：没有精确坐标，标题应显示城市名而不是第一个活动的地址
  if (pin.fallback) {
    const cityEvent = pin.events.find((e) => String(e?.city || '').trim()) || first
    const city = String(cityEvent?.city || '').trim()
    if (city) return normalizeCityName(city)
    const loc = String(cityEvent?.location || '').trim()
    if (loc) return loc
  }
  const loc = String(first?.location || '').trim()
  if (loc) return loc
  const city = String(first?.city || '').trim()
  if (city) return city
  return pin.events.length > 1
    ? `${pin.events.length}`
    : (String(first?.name || '').trim() || t('events.card.unnamed'))
})

const isDarkMap = computed(() => themeStore.appliedAppearance === 'dark')

function eventMeta(evt) {
  const parts = [String(evt?.startDate || '').trim(), String(evt?.location || '').trim(), String(evt?.city || '').trim()].filter(Boolean)
  return parts.join(' · ')
}

// 进入活动详情前保存地图中心/缩放，从详情返回时原位还原（地图不在 KeepAlive 里，
// 重挂载会重置视图；用 sessionStorage 跨挂载持久化，彻底退出地图页时清除）
function saveMapViewState() {
  if (!map) return
  try {
    const center = map.getCenter()
    sessionStorage.setItem(MAP_VIEW_STATE_KEY, JSON.stringify({
      center: [center.lat, center.lng],
      zoom: map.getZoom()
    }))
  } catch {
    // ignore
  }
}

function loadMapViewState() {
  try {
    const raw = sessionStorage.getItem(MAP_VIEW_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.center || !Array.isArray(parsed.center) || parsed.center.length < 2) return null
    const lat = Number(parsed.center[0])
    const lng = Number(parsed.center[1])
    const zoom = Number(parsed.zoom)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null
    return { center: [lat, lng], zoom }
  } catch {
    return null
  }
}

function clearMapViewState() {
  try {
    sessionStorage.removeItem(MAP_VIEW_STATE_KEY)
  } catch {
    // ignore
  }
}

function restoreMapView() {
  if (!map) return
  const saved = loadMapViewState()
  if (!saved) return
  // immediately=true：无动画直接跳到保存的视图，避免从全国视野缓慢缩放回原位
  map.setZoomAndCenter(saved.zoom, [saved.center[1], saved.center[0]], true)
  fitBoundsDone = true
}

function openEvent(evt) {
  const eventId = String(evt?.id || '')
  if (!eventId) return
  saveMapViewState()
  expectingDetailReturn = true
  selectedPin.value = null
  showUnlocated.value = false
  runWithRouteTransition(() => router.push(`/events/${eventId}`).catch(() => {}), { direction: 'forward' })
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

// 平移/缩放结束后若中心漂出中国范围，拉回边界内（相当于 Leaflet 的 maxBounds）
function clampMapView() {
  if (!map) return
  const center = map.getCenter()
  const lat = center.lat
  const lng = center.lng
  const clampedLat = clamp(lat, CHINA_BOUNDS.minLat, CHINA_BOUNDS.maxLat)
  const clampedLng = clamp(lng, CHINA_BOUNDS.minLng, CHINA_BOUNDS.maxLng)
  if (clampedLat !== lat || clampedLng !== lng) {
    map.setCenter([clampedLng, clampedLat], false)
  }
}

function applyMapStyle() {
  if (!map) return
  map.setMapStyle(isDarkMap.value ? 'amap://styles/dark' : 'amap://styles/normal')
}

async function initMap() {
  if (map || !mapElRef.value) return
  amap = await loadAmap()
  // 从详情页返回时直接用保存的视图初始化，避免先渲染全国视野再动画过渡到原位置
  const saved = loadMapViewState()
  map = new amap.Map(mapElRef.value, {
    center: saved ? [saved.center[1], saved.center[0]] : CHINA_CENTER,
    zoom: saved ? saved.zoom : CHINA_ZOOM,
    zooms: [MIN_ZOOM, MAX_ZOOM],
    viewMode: '2D',
    // 关闭程序化视图切换动画（setFitView/setZoomAndCenter/setCenter 全部立即跳转）
    animateEnable: false,
    resizeEnable: true,
    mapStyle: isDarkMap.value ? 'amap://styles/dark' : 'amap://styles/normal'
  })
  map.on('click', () => {
    selectedPin.value = null
  })
  map.on('moveend', clampMapView)
  if (saved) fitBoundsDone = true
  // AMap 构造参数 center/zoom 在首帧不一定生效（异步初始化/添加 Marker 后可能被重置），
  // 地图初始化完成后重新套用保存的视图作为兜底，保证返回时原位原比例
  map.on('complete', () => {
    if (saved) {
      map.setZoomAndCenter(saved.zoom, [saved.center[1], saved.center[0]], true)
    }
  })
}

function rebuildMarkers() {
  if (!map || !amap) return
  for (const marker of markers) {
    marker.setMap(null)
  }
  markers = []
  const pins = mapPins.value.pins
  if (pins.length === 0) {
    map.setZoomAndCenter(CHINA_ZOOM, CHINA_CENTER, false)
    fitBoundsDone = true
    return
  }

  for (const pin of pins) {
    const marker = new amap.Marker({
      position: [pin.lng, pin.lat],
      anchor: 'center',
      content: `<div class="map-pin ${pin.fallback ? 'map-pin--fallback' : ''}">${pin.events.length}</div>`,
      title: pin.fallback ? '' : (pin.events[0]?.name || '')
    })
    marker.on('click', (e) => {
      // 阻止 DOM 事件冒泡到地图容器，否则地图级 click（关闭弹层）会立刻把刚选中的点关掉
      e?.originalEvent?.stopPropagation?.()
      selectedPin.value = pin
    })
    marker.setMap(map)
    markers.push(marker)
  }

  if (!fitBoundsDone) {
    fitBoundsDone = true
    // avoid = [上, 右, 下, 左] 的像素内边距，maxZoom 限制单点时的最大放大级别
    map.setFitView(markers, false, [48, 48, 48, 48], 12)
  }
}

function exitMap() {
  if (exiting) return
  exiting = true
  expectingDetailReturn = false
  // 与其他页面统一：直接走标准返回过渡（runWithRouteTransition 会对目标页做滑入动画），
  // 不再叠加整页平移/淡出，避免过渡过重
  // 彻底离开地图页：清掉保存的视图状态，下次进入重新 fitBounds
  clearMapViewState()
  const historyState = router.options.history.state
  if (historyState?.back != null) {
    runWithRouteTransition(() => router.back(), { direction: 'back' })
  } else {
    runWithRouteTransition(() => router.replace('/events'), { direction: 'back' })
  }
}

function handleBackNavigation() {
  if (selectedPin.value || showUnlocated.value) {
    selectedPin.value = null
    showUnlocated.value = false
    return
  }
  exitMap()
}

function handleAndroidBackButton(event) {
  if (selectedPin.value || showUnlocated.value) {
    selectedPin.value = null
    showUnlocated.value = false
    event.preventDefault()
    return
  }
  event.preventDefault()
  exitMap()
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reGeocodeMissing() {
  if (geocoding.value) return
  const targets = reGeocodableEvents.value
  if (targets.length === 0) return
  geocoding.value = true
  geocodeProgress.value = { current: 0, total: targets.length }
  let succeeded = 0
  for (const evt of targets) {
    try {
      const result = await geocodeAddressToCity(evt.location)
      if (result) {
        await eventsStore.updateEventRecord(evt.id, {
          // updateEventRecord 会对 tracks/otherExpenses 重做归一化，部分更新时必须
          // 显式回传，否则会被 normalizeTracks(undefined) 归一成空数组导致数据丢失
          tracks: Array.isArray(evt.tracks) ? evt.tracks : [],
          otherExpenses: Array.isArray(evt.otherExpenses) ? evt.otherExpenses : [],
          city: combineCityDistrict(result.city, result.district),
          latitude: result.latitude || '',
          longitude: result.longitude || ''
        })
        succeeded += 1
      }
    } catch {
      // 单项失败继续下一场，不阻断批量定位
    }
    geocodeProgress.value = { current: geocodeProgress.value.current + 1, total: targets.length }
    await delay(GEOFENCE_DELAY_MS)
  }
  geocoding.value = false
  if (succeeded > 0) {
    fitBoundsDone = false
    rebuildMarkers()
    showToast(t('events.map.locateDone', { count: succeeded }))
  } else {
    showToast(t('events.map.locateFailed'))
  }
}

watch(mapPins, () => {
  if (!map) return
  rebuildMarkers()
}, { deep: true })

watch(isDarkMap, () => {
  applyMapStyle()
})

onMounted(async () => {
  if (!eventsStore.isReady) {
    await eventsStore.init()
  }
  await nextTick()
  try {
    await initMap()
    // 先放 Marker 再恢复视图：AMap 添加 Marker 后 zoom 可能被内部重置，最后恢复才能保证原位原比例
    rebuildMarkers()
    restoreMapView()
  } catch (e) {
    console.error('amap init failed', e)
    showToast(t('events.map.loadFailed'))
  }
  bindAndroidBackButton()
})

// 地图页已加入 KeepAlive：从详情返回时实例不销毁，无需重新初始化（避免白屏重新加载）
onActivated(() => {
  // KeepAlive 缓存了组件级状态，重新进入地图页时重置退出标志，保证返回键可用
  exiting = false
  bindAndroidBackButton()
  const isDetailReturn = expectingDetailReturn
  expectingDetailReturn = false
  if (!map) return
  // 隐藏再显示后容器尺寸可能失效，下一帧再重新测量（此时布局才计算完成），并刷新 Marker
  requestAnimationFrame(() => map.resize())
  rebuildMarkers()
  if (isDetailReturn) {
    // 从详情页返回：KeepAlive 复用实例没有过渡，补一次标准返回滑入动画，与其他页面统一
    playRouteSceneSlide('back')
  }
})

onDeactivated(() => {
  // 离开地图页（进详情/回列表）时解绑返回键，避免在其他页面误触发
  unbindAndroidBackButton()
})

onBeforeUnmount(() => {
  unbindAndroidBackButton()
  if (map) {
    map.destroy()
    map = null
    amap = null
    markers = []
  }
})
</script>

<style scoped>
.event-map-page {
  position: relative;
  height: 100dvh;
  overflow: hidden;
  background: var(--app-bg);
}

.event-map {
  position: relative;
  flex: 1;
  min-height: 0;
  z-index: 0;
}

.event-map :deep(.amap-container) {
  width: 100%;
  height: 100%;
  background: color-mix(in srgb, var(--app-surface) 40%, var(--app-bg));
  font-family: inherit;
}

.map-legend {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 62px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
  white-space: nowrap;
}

.map-legend__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--app-text-tertiary);
}

.map-sheet {
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 600;
  width: min(calc(100vw - 24px), 520px);
  max-width: calc(100vw - 24px);
  max-height: min(56dvh, 460px);
  display: flex;
  flex-direction: column;
  padding: 8px 16px calc(12px + env(safe-area-inset-bottom));
  border-radius: 24px;
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  box-shadow: var(--app-shadow);
  transform: translateX(-50%);
  overflow: hidden;
}

.map-sheet__grabber {
  width: 40px;
  height: 4px;
  margin: 0 auto 8px;
  border-radius: 999px;
  background: var(--app-text-tertiary);
  opacity: 0.4;
}

.map-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--app-glass-border);
}

.map-sheet__head-copy {
  min-width: 0;
}

.map-sheet__label {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.06em;
}

.map-sheet__title {
  margin: 2px 0 0;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-sheet__close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-muted) 92%, transparent);
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.16s ease;
}

.map-sheet__close:active {
  transform: scale(0.94);
}

.map-sheet__close svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.map-sheet__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  scrollbar-width: none;
}

.map-sheet__list::-webkit-scrollbar {
  display: none;
}

.map-sheet__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface) 62%, transparent);
  text-align: left;
  transition: background 0.16s ease;
}

.map-sheet__item:active {
  background: color-mix(in srgb, var(--app-surface) 80%, transparent);
}

.map-sheet__item-name {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-sheet__item-meta {
  color: var(--app-text-tertiary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-sheet__action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 10px;
  padding: 11px 14px;
  border: none;
  border-radius: 14px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.map-sheet__action:active {
  transform: scale(0.98);
  opacity: 0.9;
}

.map-sheet__action svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.map-unlocated-fab {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 550;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  height: 46px;
  border: none;
  border-radius: 999px;
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.map-unlocated-fab:active {
  transform: scale(0.96);
}

.map-unlocated-fab svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.map-geocode-progress {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 62px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 550;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}

/* AMap Marker 内容由 SDK 动态注入，需穿透作用域 */
.event-map :deep(.map-pin) {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--app-text) 30%, transparent);
  border: 2px solid color-mix(in srgb, var(--app-surface) 92%, transparent);
  transform-origin: center;
}

.event-map :deep(.map-pin--fallback) {
  background: var(--app-surface);
  color: var(--app-text-secondary);
  border: 2px dashed color-mix(in srgb, var(--app-text) 38%, transparent);
  box-shadow: none;
  font-size: 12px;
}

.map-sheet-enter-active,
.map-sheet-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.map-sheet-enter-from,
.map-sheet-leave-to {
  transform: translate(-50%, 24px);
  opacity: 0;
}

.map-fab-enter-active,
.map-fab-leave-active {
  transition: transform 0.22s ease, opacity 0.18s ease;
}

.map-fab-enter-from,
.map-fab-leave-to {
  transform: translateY(12px);
  opacity: 0;
}
</style>
