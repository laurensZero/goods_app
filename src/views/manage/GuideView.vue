<template>
  <div class="page guide-page">
    <NavBar :title="t('guide.navTitle')" show-back />

    <main ref="pageBodyRef" class="page-body page-entry">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M9 7h6" />
              <path d="M9 11h6" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">User Guide</p>
            <h1 class="hero-title">{{ t('guide.title') }}</h1>
            <p class="hero-desc">{{ t('guide.subtitle') }}</p>
            <div class="hero-meta">
              <span class="hero-chip">{{ t('guide.metaSections', { count: GUIDE_SECTIONS.length }) }}</span>
            </div>
          </div>
        </article>
      </section>

      <div class="guide-tools">
        <div class="guide-search" :class="{ 'guide-search--focus': searchFocused }">
          <svg class="guide-search__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.35-3.35" />
          </svg>
          <input
            v-model="query"
            class="guide-search__input"
            type="search"
            enterkeyhint="search"
            :placeholder="t('guide.searchPlaceholder')"
            :aria-label="t('guide.searchPlaceholder')"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <button v-if="query" type="button" class="guide-search__clear" :aria-label="t('guide.clearSearch')" @click="query = ''">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p v-if="query" class="guide-hits">{{ t('guide.searchHits', { count: visibleSections.length, query }) }}</p>
      </div>

      <div v-if="visibleSections.length > 0" class="guide-index" :aria-label="t('guide.contents')">
        <button
          v-for="section in visibleSections"
          :key="section.id"
          type="button"
          class="guide-index__row"
          @click="openSection(section.id)"
        >
          <span class="guide-index__num">{{ section.no }}</span>
          <span class="guide-index__copy">
            <span class="guide-index__title" v-html="highlight(section.title)" />
            <span class="guide-index__desc" v-html="highlight(section.desc)" />
          </span>
          <span class="guide-index__side">
            <span class="guide-index__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path v-for="(d, i) in section.icon" :key="i" :d="d" />
              </svg>
            </span>
            <svg class="guide-index__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>
      </div>

      <section v-else class="guide-empty">
        <svg class="guide-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.35-3.35" />
          <path d="M8.5 11h5" />
        </svg>
        <h3 class="guide-empty__title">{{ t('guide.noResultTitle') }}</h3>
        <p class="guide-empty__desc">{{ t('guide.noResultDesc') }}</p>
        <button type="button" class="guide-empty__btn" @click="query = ''">{{ t('guide.clearSearch') }}</button>
      </section>

      <p class="guide-footnote">{{ t('guide.footnote') }}</p>
    </main>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import { GUIDE_SECTIONS } from '@/content/guide/guideSections'
import shotManifest from '@/content/guide/guideShotManifest.json'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
// guide.json 被 unplugin-vue-i18n 预编译成 AST（t() 可用，但数组叶子不再是字符串），
// 这里另外以 raw 形式导入原文，供数组/FAQ 等结构化文案读取。
import guideRawZhCN from '../../locales/zh-CN/guide.json?raw'
import guideRawZhTW from '../../locales/zh-TW/guide.json?raw'
import guideRawEn from '../../locales/en/guide.json?raw'
import guideRawJa from '../../locales/ja/guide.json?raw'
import guideRawKo from '../../locales/ko/guide.json?raw'

defineOptions({ name: 'GuideView' })

const { t, locale } = useI18n()
const router = useRouter()
const pageBodyRef = ref(null)
const query = ref('')
const searchFocused = ref(false)

const GUIDE_RAW_BY_LOCALE = {
  'zh-CN': guideRawZhCN,
  'zh-TW': guideRawZhTW,
  en: guideRawEn,
  ja: guideRawJa,
  ko: guideRawKo
}
const guideParsedCache = new Map()

function guideRawJson() {
  const current = locale.value
  if (!guideParsedCache.has(current)) {
    const src = GUIDE_RAW_BY_LOCALE[current] || GUIDE_RAW_BY_LOCALE['zh-CN']
    try {
      guideParsedCache.set(current, JSON.parse(src))
    } catch {
      guideParsedCache.set(current, null)
    }
  }
  return guideParsedCache.get(current)
}

/** 按扁平点号 key 读取 guide.json 原始值（数组/对象保持结构） */
function rawMessage(key) {
  return guideRawJson()?.[key]
}

/** 读取 i18n 数组文案（缺失时返回空数组，不打断渲染） */
function messageArray(key) {
  const value = rawMessage(key)
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.length > 0)
  if (typeof value === 'string' && value) return [value]
  return []
}

/** FAQ 条目：guide.s.faq.items = [{ q, a }] */
function faqItems() {
  const value = rawMessage('guide.s.faq.items')
  if (!Array.isArray(value)) return []
  return value
    .map((item) => ({ q: String(item?.q || ''), a: String(item?.a || '') }))
    .filter((item) => item.q || item.a)
}

const allSections = computed(() => {
  // 依赖 locale：切换语言时整棵章节树重建
  void locale.value
  return GUIDE_SECTIONS.map((section, index) => {
    const base = `guide.s.${section.id}`
    return {
      id: section.id,
      no: index + 1,
      icon: section.icon,
      title: t(`${base}.title`),
      desc: t(`${base}.desc`),
      steps: messageArray(`${base}.steps`),
      tip: t(`${base}.tip`),
      faq: section.id === 'faq' ? faqItems() : [],
      shotLabels: section.shots.flatMap((key) =>
        (shotManifest[key]?.annos || []).map((anno) => t(`guide.shot.${key}.${anno.label}`))
      )
    }
  })
})

function sectionHaystack(section) {
  return [
    section.title,
    section.desc,
    ...section.steps,
    section.tip,
    ...section.faq.flatMap((item) => [item.q, item.a]),
    ...section.shotLabels
  ].join('\n').toLowerCase()
}

const visibleSections = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allSections.value
  return allSections.value.filter((section) => sectionHaystack(section).includes(q))
})

function openSection(id) {
  runWithRouteTransition(() => router.push(`/manage/guide/${id}`), { direction: 'forward' })
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlight(text) {
  const safe = escapeHtml(text || '')
  const q = query.value.trim()
  if (!q) return safe
  const safeQuery = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return safe.replace(new RegExp(safeQuery, 'gi'), (match) => `<mark class="guide-mark">${match}</mark>`)
  } catch {
    return safe
  }
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

onMounted(() => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
})

onActivated(resetPageScrollTop)
</script>

<style scoped src="@/assets/views/GuideView.css"></style>
