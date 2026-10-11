<template>
  <div class="page guide-section-page">
    <NavBar :title="section ? section.title : t('guide.navTitle')" show-back />

    <main ref="pageBodyRef" class="page-body page-entry">
      <article v-if="section" class="guide-section">
        <header class="guide-section__head">
          <span class="guide-section__num">{{ section.no }}</span>
          <div class="guide-section__heading">
            <p class="guide-section__kicker">{{ t('guide.sectionKicker', { n: section.no }) }}</p>
            <h1 class="guide-section__title">{{ section.title }}</h1>
            <p class="guide-section__desc">{{ section.desc }}</p>
          </div>
          <span class="guide-section__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="(d, i) in section.icon" :key="i" :d="d" />
            </svg>
          </span>
        </header>

        <ol v-if="section.steps.length" class="guide-steps">
          <li v-for="(step, sIdx) in section.steps" :key="sIdx" class="guide-steps__item">
            <span class="guide-steps__num">{{ sIdx + 1 }}</span>
            <p class="guide-steps__text">{{ step }}</p>
          </li>
        </ol>

        <div v-if="section.shots.length" class="guide-shots">
          <figure
            v-for="shot in section.shots"
            :key="shot.key"
            class="guide-shot"
            :data-shot="shot.key"
          >
            <div
              class="guide-shot__frame"
              :class="{ 'guide-shot__frame--failed': shot.failed }"
              :style="{ aspectRatio: `${shot.meta.w} / ${shot.meta.h}` }"
            >
              <img
                v-if="!shot.failed"
                class="guide-shot__img"
                :src="shot.url"
                :alt="section.title"
                loading="lazy"
                decoding="async"
                @load="scheduleLayout"
                @error="markShotFailed(shot.key)"
              />
              <span v-else class="guide-shot__fallback">{{ t('guide.shotFallback') }}</span>
              <template v-for="anno in shot.meta.annos" :key="anno.n">
                <span class="guide-anno" :style="annoStyle(anno)">
                  <i class="guide-anno__dot">{{ shot.numOffset + anno.n }}</i>
                </span>
                <span
                  class="guide-anno-label"
                  :data-n="anno.n"
                  :style="labelStyle(shot.key, anno.n)"
                >
                  {{ shotLabel(shot, anno) }}
                </span>
              </template>
            </div>
          </figure>
        </div>

        <aside v-if="section.faq.length" class="guide-faq">
          <div v-for="(item, fIdx) in section.faq" :key="fIdx" class="guide-faq__item">
            <p class="guide-faq__q">{{ item.q }}</p>
            <p class="guide-faq__a">{{ item.a }}</p>
          </div>
        </aside>

        <aside v-if="section.tip" class="guide-tip">
          <span class="guide-tip__badge">{{ t('guide.tipLabel') }}</span>
          <p class="guide-tip__text">{{ section.tip }}</p>
        </aside>
      </article>

      <nav v-if="section" class="guide-pager">
        <button
          v-if="prevSection"
          type="button"
          class="guide-pager__btn guide-pager__btn--prev"
          @click="openSection(prevSection.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="guide-pager__copy">
            <small>{{ t('guide.prevSection') }}</small>
            <b>{{ prevSection.title }}</b>
          </span>
        </button>
        <button
          v-if="nextSection"
          type="button"
          class="guide-pager__btn guide-pager__btn--next"
          @click="openSection(nextSection.id)"
        >
          <span class="guide-pager__copy">
            <small>{{ t('guide.nextSection') }}</small>
            <b>{{ nextSection.title }}</b>
          </span>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </nav>

      <p class="guide-footnote">{{ t('guide.footnote') }}</p>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import { GUIDE_SECTIONS, GUIDE_SHOT_BASE } from '@/content/guide/guideSections'
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

defineOptions({ name: 'GuideSectionView' })

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const pageBodyRef = ref(null)
const failedShots = ref(new Set())

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

const sectionIndex = computed(() =>
  GUIDE_SECTIONS.findIndex((item) => item.id === route.params.section)
)

const section = computed(() => {
  // 依赖 locale：切换语言时章节内容重建
  void locale.value
  const index = sectionIndex.value
  if (index < 0) return null
  const meta = GUIDE_SECTIONS[index]
  const base = `guide.s.${meta.id}`
  return {
    id: meta.id,
    no: index + 1,
    icon: meta.icon,
    title: t(`${base}.title`),
    desc: t(`${base}.desc`),
    steps: messageArray(`${base}.steps`),
    tip: t(`${base}.tip`),
    faq: meta.id === 'faq' ? faqItems() : [],
      shots: (() => {
        // 同章节内标号连续：第二张图从上一张的最后一个编号接着数
        let numOffset = 0
        return meta.shots
          .filter((key) => shotManifest[key])
          .map((key) => {
            const shot = {
              key,
              meta: shotManifest[key],
              url: GUIDE_SHOT_BASE + shotManifest[key].file,
              failed: failedShots.value.has(key),
              numOffset
            }
            numOffset += shotManifest[key].annos?.length || 0
            return shot
          })
      })()
    }
})

const prevSection = computed(() => buildPagerItem(sectionIndex.value - 1))
const nextSection = computed(() => buildPagerItem(sectionIndex.value + 1))

function buildPagerItem(index) {
  const meta = GUIDE_SECTIONS[index]
  if (!meta) return null
  return { id: meta.id, title: t(`guide.s.${meta.id}.title`) }
}

function shotLabel(shot, anno) {
  return t(`guide.shot.${shot.key}.${anno.label}`)
}

function markShotFailed(key) {
  failedShots.value = new Set([...failedShots.value, key])
}

function annoStyle(anno) {
  return {
    left: `${anno.x}%`,
    top: `${anno.y}%`,
    width: `${anno.w}%`,
    height: `${anno.h}%`
  }
}

/**
 * 标注文字统一锚在红框右上角，放不下时按 右上 → 右下 → 左上 → 左下 回退。
 * 每个候选位校验：不出图、不压编号点、不压其它红框、不压已放置的文字。
 * 位置以 px 存储（依赖实测的 pill 尺寸），视口/语言变化时由 layoutLabels() 重算。
 */
const labelPos = ref({})

function labelStyle(shotKey, n) {
  const pos = labelPos.value[`${shotKey}:${n}`]
  if (!pos) return { visibility: 'hidden' }
  return { left: `${pos.left}px`, top: `${pos.top}px` }
}

function layoutLabels() {
  const root = pageBodyRef.value
  if (!root) return
  const next = {}
  for (const figure of root.querySelectorAll('.guide-shot')) {
    const shotKey = figure.dataset.shot
    const meta = shotManifest[shotKey]
    const frame = figure.querySelector('.guide-shot__frame')
    if (!frame || !meta?.annos?.length) continue
    const fw = frame.clientWidth
    const fh = frame.clientHeight
    if (!fw || !fh) continue
    const boxes = meta.annos.map((a) => ({
      n: a.n,
      left: (a.x / 100) * fw,
      top: (a.y / 100) * fh,
      width: (a.w / 100) * fw,
      height: (a.h / 100) * fh
    }))
    const placed = []
    for (const box of boxes) {
      const el = frame.querySelector(`.guide-anno-label[data-n="${box.n}"]`)
      if (!el) continue
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) continue
      // 阻挡物：只有已放置的文字互相不能压（框是半透明描边，压住框可接受）
      // 锚点始终贴着自己的框：上/下两档高度 × 右对齐/左对齐/居中三档水平位。
      // 上方锚点留 16px 让开编号点（框左上 22px 圆 + 2px 边）；
      // 撞到已放文字时沿框边滑到下一档，不做远距离逃逸。
      const tops = [box.top - h - 16, box.top + box.height + 4]
      const lefts = [
        box.left + box.width - w,
        box.left,
        box.left + box.width / 2 - w / 2
      ]
      const candidates = tops.flatMap((top) => lefts.map((left) => ({ left, top })))
      const inB = (c) => c.left >= 0 && c.top >= 0 && c.left + w <= fw && c.top + h <= fh
      const area = (c) =>
        placed.reduce((sum, p) => {
          const x = Math.min(c.left + w, p.left + p.width) - Math.max(c.left, p.left)
          const y = Math.min(c.top + h, p.top + p.height) - Math.max(c.top, p.top)
          return sum + Math.max(0, x) * Math.max(0, y)
        }, 0)
      const legal = candidates.filter(inB)
      const pick =
        legal.find((c) => area(c) === 0) ||
        legal.sort((a, b) => area(a) - area(b))[0] ||
        candidates[0]
      // 兜底：夹回图内，避免被 frame 的 overflow 裁掉
      const left = Math.min(Math.max(pick.left, 0), Math.max(fw - w, 0))
      const top = Math.min(Math.max(pick.top, 0), Math.max(fh - h, 0))
      placed.push({ left, top, width: w, height: h })
      next[`${shotKey}:${box.n}`] = { left, top }
    }
  }
  labelPos.value = next
}

let layoutRaf = 0
function scheduleLayout() {
  if (layoutRaf) return
  layoutRaf = window.requestAnimationFrame(() => {
    layoutRaf = 0
    layoutLabels()
  })
}


function openSection(id) {
  runWithRouteTransition(() => router.replace(`/manage/guide/${id}`), { direction: 'forward' })
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

watch(
  () => route.params.section,
  (id) => {
    if (!GUIDE_SECTIONS.some((item) => item.id === id)) {
      router.replace('/manage/guide')
      return
    }
    resetPageScrollTop()
    window.requestAnimationFrame(resetPageScrollTop)
  }
)

// pill 尺寸依赖渲染结果：章节/语言切换、图片尺寸就绪、容器宽度变化都要重排
watch([() => route.params.section, locale], async () => {
  labelPos.value = {}
  await nextTick()
  scheduleLayout()
})

let shotsObserver = null

function observeShots() {
  shotsObserver?.disconnect()
  const root = pageBodyRef.value
  if (!root || typeof ResizeObserver === 'undefined') return
  shotsObserver = new ResizeObserver(() => scheduleLayout())
  root.querySelectorAll('.guide-shot__frame').forEach((el) => shotsObserver.observe(el))
  shotsObserver.observe(root)
}

onMounted(async () => {
  if (sectionIndex.value < 0) {
    router.replace('/manage/guide')
    return
  }
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  await nextTick()
  scheduleLayout()
  observeShots()
})

onActivated(async () => {
  resetPageScrollTop()
  await nextTick()
  scheduleLayout()
  observeShots()
})

onBeforeUnmount(() => {
  shotsObserver?.disconnect()
  if (layoutRaf) window.cancelAnimationFrame(layoutRaf)
})
</script>

<style scoped src="@/assets/views/GuideSectionView.css"></style>
