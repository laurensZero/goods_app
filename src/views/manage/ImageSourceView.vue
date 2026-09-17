<template>
  <div class="page image-source-page">
    <NavBar :title="t('manage.imageSource')" show-back />

    <main ref="pageBodyRef" class="page-body page-entry">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">Image Source</p>
            <h1 class="hero-title">{{ t('manage.imageSource') }}</h1>
            <p class="hero-desc">{{ t('manage.imageSourceDesc') }}</p>
            <div class="hero-meta">
              <span class="hero-chip">{{ currentModeLabel }}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="content-section">
        <!-- 嵌入设置页时 .section-head 会被 ManageView 隐藏，操作按钮不能放里面 -->
        <div class="speed-toolbar">
          <div class="speed-toolbar__copy">
            <p class="speed-toolbar__label">Select Source</p>
            <h2 class="speed-toolbar__title">{{ t('manage.imageSourceSelect') }}</h2>
            <p class="speed-toolbar__desc">{{ t('manage.imageSourceSelectDesc') }}</p>
          </div>
        </div>

        <div class="source-grid">
          <button
            v-for="option in sourceOptions"
            :key="option.id"
            type="button"
            :class="['source-card', { 'source-card--active': currentMode === option.id }]"
            @click="selectSource(option.id)"
          >
            <div class="source-card__body">
              <div class="source-card__title-row">
                <span class="source-card__name">{{ t(option.labelKey) }}</span>
                <span v-if="currentMode === option.id" class="source-card__badge">{{ t('manage.imageSourceInUse') }}</span>
              </div>
              <span class="source-card__desc">{{ t(option.descKey) }}</span>
              <span class="source-card__origin">{{ option.origin }}</span>
              <span v-if="getSpeedText(option.id)" class="source-card__speed">{{ getSpeedText(option.id) }}</span>
            </div>
            <span v-if="currentMode === option.id" class="source-card__check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
          </button>
        </div>
        <p class="shared-hint">{{ t('manage.imageSourceSharedHint') }}</p>
      </section>

      <section class="content-section">
        <!-- 嵌入设置页时 .section-head 会被 ManageView 隐藏，操作按钮不能放里面 -->
        <div class="speed-toolbar">
          <div class="speed-toolbar__copy">
            <p class="speed-toolbar__label">Speed Test</p>
            <h2 class="speed-toolbar__title">{{ t('manage.imageSourceSpeedTest') }}</h2>
            <p class="speed-toolbar__desc">{{ speedTestHintText }}</p>
          </div>
          <button
            type="button"
            class="ghost-button"
            :disabled="isTesting || !samplePath"
            @click="runSpeedTest"
          >
            {{ isTesting ? t('manage.imageSourceTesting') : t('manage.imageSourceStartTest') }}
          </button>
        </div>

        <article class="speed-panel">
          <div v-if="!samplePath" class="speed-panel__empty">
            {{ t('manage.imageSourceNoSample') }}
          </div>
          <div v-else-if="isTesting" class="speed-panel__empty">
            {{ t('manage.imageSourceTesting') }}…
          </div>
          <div v-else-if="!hasTestResults" class="speed-panel__empty">
            {{ t('manage.imageSourceIdle') }}
          </div>
          <div v-else class="speed-results">
            <div
              v-for="result in resultRows"
              :key="result.id"
              class="speed-row"
              :class="{ 'speed-row--failed': !result.ok }"
            >
              <div class="speed-row__main">
                <span class="speed-row__name">{{ t(result.labelKey) }}</span>
                <span class="speed-row__status">{{ result.statusText }}</span>
              </div>
              <div class="speed-row__meta">
                <span class="speed-row__ms">{{ result.msText }}</span>
                <span v-if="result.isFastest" class="speed-row__tag">{{ t('manage.imageSourceFastest') }}</span>
              </div>
            </div>
            <button
              v-if="fastestSourceId && fastestSourceId !== currentMode"
              type="button"
              class="apply-fastest"
              @click="applyFastest"
            >
              {{ t('manage.imageSourceApplyFastest', { name: t(getSourceLabelKey(fastestSourceId)) }) }}
            </button>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGoodsStore } from '@/stores/goods'
import NavBar from '@/components/common/NavBar.vue'
import {
  IMAGE_SOURCE_OPTIONS,
  getImageSourceMode,
  setImageSourceMode
} from '@/config/mediaProxy'
import {
  extractSupabasePublicStoragePath,
  runImageSourceSpeedTest
} from '@/utils/image/imageSourceSpeedTest'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'ImageSourceView' })

const { t } = useI18n()
const goodsStore = useGoodsStore()
const pageBodyRef = ref(null)

const SOURCE_META = [
  {
    id: 'proxy',
    labelKey: 'manage.imageSourceProxy',
    descKey: 'manage.imageSourceProxyDesc'
  },
  {
    id: 'direct',
    labelKey: 'manage.imageSourceDirect',
    descKey: 'manage.imageSourceDirectDesc'
  }
]

const sourceOptions = computed(() =>
  SOURCE_META.map((meta) => {
    const origin = IMAGE_SOURCE_OPTIONS.find((item) => item.id === meta.id)?.origin || ''
    return { ...meta, origin }
  })
)

const currentMode = ref(getImageSourceMode())
const isTesting = ref(false)
const testResults = ref([])
const fastestSourceId = ref('')

const currentModeLabel = computed(() => {
  const option = sourceOptions.value.find((item) => item.id === currentMode.value)
  return option ? t(option.labelKey) : ''
})

const hasTestResults = computed(() => testResults.value.length > 0)

const resultRows = computed(() =>
  testResults.value.map((result) => {
    const option = sourceOptions.value.find((item) => item.id === result.sourceId)
    return {
      id: result.sourceId,
      labelKey: option?.labelKey || 'manage.imageSourceProxy',
      ok: result.ok,
      isFastest: fastestSourceId.value && result.sourceId === fastestSourceId.value,
      statusText: result.ok
        ? t('manage.imageSourceReachable')
        : t('manage.imageSourceUnreachable'),
      msText: result.ok && Number.isFinite(result.ms)
        ? t('manage.imageSourceLatency', { ms: result.ms })
        : '—'
    }
  })
)

const samplePath = computed(() => {
  const list = goodsStore.list || []
  for (const item of list) {
    const images = Array.isArray(item?.images) ? item.images : []
    for (const image of images) {
      const path = extractSupabasePublicStoragePath(image?.uri)
      if (path) return path
    }
  }
  return ''
})

const speedTestHintText = computed(() =>
  samplePath.value
    ? t('manage.imageSourceSpeedTestDesc')
    : t('manage.imageSourceNoSample')
)

function getSourceLabelKey(id) {
  return sourceOptions.value.find((item) => item.id === id)?.labelKey || 'manage.imageSourceProxy'
}

function getSpeedText(sourceId) {
  const result = testResults.value.find((item) => item.sourceId === sourceId)
  if (!result?.ok || !Number.isFinite(result.ms)) return ''
  return t('manage.imageSourceLatency', { ms: result.ms })
}

function selectSource(id) {
  currentMode.value = setImageSourceMode(id)
}

async function runSpeedTest() {
  if (isTesting.value || !samplePath.value) return
  isTesting.value = true
  testResults.value = []
  fastestSourceId.value = ''

  try {
    const payload = await runImageSourceSpeedTest({ storagePath: samplePath.value })
    testResults.value = payload.results || []
    fastestSourceId.value = payload.fastestSourceId || ''
  } finally {
    isTesting.value = false
  }
}

function applyFastest() {
  if (!fastestSourceId.value) return
  currentMode.value = setImageSourceMode(fastestSourceId.value)
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

onMounted(() => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
})

onBeforeUnmount(() => {
  isTesting.value = false
})
</script>

<style scoped src="@/assets/views/ImageSourceView.css" />
