<template>
  <!-- 没设置背景时不渲染任何媒体层，标题区收成普通页头，不给背景留高度 -->
  <header class="profile-hero" :class="{ 'profile-hero--compact': !item, 'profile-hero--letterbox': isLongStrip }">
    <div v-if="item" class="profile-hero__media" aria-hidden="true">
      <Transition :name="transitionName">
        <div :key="item.id" class="profile-hero__layer">
          <!-- 宽屏铺底：方图 / 竖图在超宽横幅里用同一张图模糊填充两侧，
               中间再完整居中显示，避免 cover 把画面裁成一条 -->
          <img
            v-if="item.kind !== 'gradient'"
            class="profile-hero__fill profile-hero__fill--ambient"
            :src="item.uri"
            alt=""
            decoding="async"
          />
          <div
            v-if="item.kind === 'gradient'"
            class="profile-hero__fill profile-hero__fill--gradient"
            :style="gradientStyle"
          />
          <img
            v-else
            class="profile-hero__fill profile-hero__fill--subject"
            :src="item.uri"
            alt=""
            decoding="async"
            :style="imageStyle"
          />
          <div class="profile-hero__tone" :style="{ backgroundColor: toneColor, opacity: item.overlay }" />
        </div>
      </Transition>
      <div class="profile-hero__scrim" />
    </div>

    <div class="profile-hero__bar">
      <button class="profile-hero__icon profile-hero__icon--back" type="button" :aria-label="t('common.aria.back')" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>

      <div class="profile-hero__bar-right">
        <button
          v-if="hasMultiple"
          class="profile-hero__icon"
          type="button"
          :aria-label="t('profile.background.nextAria')"
          @click="emit('next-background')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
            <path d="M20 4v4.5h-4.5" />
            <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
            <path d="M4 20v-4.5h4.5" />
          </svg>
        </button>

        <button
          class="profile-hero__icon"
          type="button"
          :aria-label="t('profile.background.title')"
          @click="emit('open-settings')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="3" />
            <circle cx="9" cy="10" r="1.4" />
            <path d="M4.5 16.5l4.2-3.6 3.2 2.6 3.1-2.8 4.5 4" />
          </svg>
        </button>
      </div>
    </div>

    <div class="profile-hero__content">
      <p v-if="eyebrow" class="profile-hero__eyebrow">{{ eyebrow }}</p>
      <h1 class="profile-hero__title">{{ title }}</h1>
      <button
        v-if="chipLabel"
        class="profile-hero__chip"
        type="button"
        :disabled="!chipClickable"
        :aria-label="chipClickable ? t('profile.chip.openIp') : undefined"
        @click="chipClickable && emit('chip-click')"
      >
        <span class="profile-hero__chip-dot" />
        {{ chipLabel }}
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, default: '' },
  chipLabel: { type: String, default: '' },
  chipClickable: { type: Boolean, default: false },
  item: { type: Object, default: null },
  transition: { type: String, default: 'fade' },
  hasMultiple: { type: Boolean, default: false },
  lowPerf: { type: Boolean, default: false }
})

const emit = defineEmits(['back', 'open-settings', 'next-background', 'chip-click'])

const transitionName = computed(() => (
  props.transition === 'kenburns' && !props.lowPerf ? 'profile-bg-kenburns' : 'profile-bg-fade'
))

/**
 * 长条图（宽高比 ≥ 2，如 3:1 横幅）在任何屏幕都「完整居中 + 同图模糊铺底」，
 * 避免手机/窄屏上 cover 把两侧裁得只剩中间一小块；方形图仍走 cover。
 */
const isLongStrip = computed(() => {
  const width = Number(props.item?.width) || 0
  const height = Number(props.item?.height) || 0
  if (width <= 0 || height <= 0) return false
  return width / height >= 2
})

const gradientStyle = computed(() => {
  const gradient = props.item?.gradient || ['#8EC5FC', '#E0C3FC']
  return {
    backgroundImage: `linear-gradient(145deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`
  }
})

const imageStyle = computed(() => {
  const item = props.item
  if (!item) return {}
  const focalY = Math.round((Number(item.focalY ?? 0.5) * 100) * 10) / 10
  const scale = props.lowPerf ? 1 : Number(item.scale ?? 1)
  return {
    objectPosition: `50% ${focalY}%`,
    transform: scale !== 1 ? `scale(${scale})` : 'none',
    filter: !props.lowPerf && item.blur > 0 ? `blur(${item.blur}px)` : 'none'
  }
})

const toneColor = computed(() => {
  if (props.item?.kind === 'gradient') {
    const gradient = props.item.gradient || ['#000000']
    return gradient[0]
  }
  return '#000000'
})
</script>

<style scoped>
.profile-hero {
  position: relative;
  width: 100%;
  height: min(46vh, 360px);
  min-height: 224px;
  overflow: hidden;
  background: var(--app-surface-soft);
}

.profile-hero__media {
  position: absolute;
  inset: 0;
}

.profile-hero__layer {
  position: absolute;
  inset: 0;
  will-change: opacity, transform;
}

.profile-hero__fill {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background-size: cover;
  background-position: center;
}

.profile-hero__fill--gradient {
  background-size: 100% 100%;
}

/* 手机端不额外铺底（整图 cover 已经是满屏） */
.profile-hero__fill--ambient {
  display: none;
}

.profile-hero__tone {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.profile-hero__scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.34) 0%, rgba(0, 0, 0, 0.06) 34%, rgba(0, 0, 0, 0) 52%),
    linear-gradient(180deg, rgba(0, 0, 0, 0) 42%, color-mix(in srgb, var(--app-bg) 88%, transparent) 100%);
}

/* 悬浮按钮与全站同一套：NavBar 的 36px 浅色玻璃圆钮（18px 图标 / 深色描边文字），
   叠加 PhotoPreviewViewer 里「浮在图片上」的处理（半透明面板 + 背景模糊）。
   行高与内边距也按 NavBar 复刻，保证按钮中心和其它页面的返回键同一水平线。 */
.profile-hero__bar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  /* content-box：下面的 40px 只约束按钮行本身，安全区与 10px 间距在其外，
     与 NavBar 的 .nav-bar__inner min-height 对齐 */
  box-sizing: content-box;
  min-height: 40px;
  padding: calc(env(safe-area-inset-top) + 10px) var(--page-padding) 0;
}

.profile-hero__bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-hero__icon {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-muted) 92%, transparent);
  background-clip: padding-box;
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  transition: transform 0.16s ease, background 0.16s ease;
}

.profile-hero__icon:active {
  transform: scale(0.94);
  background: color-mix(in srgb, var(--app-surface-muted) 78%, transparent);
}

html.theme-dark .profile-hero__icon {
  background: color-mix(in srgb, var(--app-surface) 18%, transparent);
  border-color: color-mix(in srgb, var(--app-surface) 10%, transparent);
}

html.theme-dark .profile-hero__icon:active {
  background: color-mix(in srgb, var(--app-surface) 26%, transparent);
}

.profile-hero__icon svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

/* 箭头光学重量比背景/刷新图标轻，按 NavBar 的 .nav-back 加粗一档补偿 */
.profile-hero__icon--back svg {
  stroke-width: 2.2;
}

.profile-hero__content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  z-index: 2;
  padding: 0 var(--page-padding);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.profile-hero__eyebrow {
  margin: 0;
  font-size: var(--font-small);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.78);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
}

.profile-hero__title {
  margin: 0;
  max-width: 100%;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #ffffff;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.46);
  overflow-wrap: anywhere;
}

.profile-hero__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-pill);
  background: rgba(20, 20, 22, 0.24);
  color: #ffffff;
  font-size: var(--font-small);
  font-weight: 600;
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-hero__chip:disabled {
  cursor: default;
}

.profile-hero__chip-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.8;
}

/* ── 过渡 ── */
.profile-bg-fade-enter-active,
.profile-bg-fade-leave-active {
  transition: opacity 0.55s ease;
}

.profile-bg-fade-enter-from,
.profile-bg-fade-leave-to {
  opacity: 0;
}

.profile-bg-kenburns-enter-active,
.profile-bg-kenburns-leave-active {
  transition: opacity 0.9s ease;
}

.profile-bg-kenburns-enter-from,
.profile-bg-kenburns-leave-to {
  opacity: 0;
}

.profile-bg-kenburns-enter-active {
  animation: profile-kenburns 14s var(--motion-ease-emphasis) both;
}

@keyframes profile-kenburns {
  from { transform: scale(1); }
  to { transform: scale(1.09); }
}

@media (prefers-reduced-motion: reduce) {
  .profile-bg-fade-enter-active,
  .profile-bg-fade-leave-active,
  .profile-bg-kenburns-enter-active,
  .profile-bg-kenburns-leave-active {
    transition-duration: 0.01ms;
  }

  .profile-bg-kenburns-enter-active {
    animation: none;
  }
}

/* ── 平板 / 宽屏 ── */
@media (min-width: 600px) {
  .profile-hero {
    height: min(38vh, 340px);
    min-height: 260px;
  }

  .profile-hero__title {
    font-size: 32px;
  }
}

@media (min-width: 900px) {
  /* 超宽窗口下把横幅钳在 40vh，避免留白过多 */
  .profile-hero {
    height: clamp(300px, 42vh, 440px);
    min-height: 300px;
  }

  /* 宽屏不再整图 cover：方图 / 竖图完整居中显示，两侧用同图模糊铺底 */
  .profile-hero__fill--ambient {
    display: block;
    object-fit: cover;
    transform: scale(1.16);
    filter: blur(32px) saturate(140%) brightness(0.92);
  }

  .profile-hero__fill--subject {
    object-fit: contain;
  }

  .profile-hero__bar,
  .profile-hero__content {
    padding-right: var(--profile-gutter, var(--page-padding));
    padding-left: var(--profile-gutter, var(--page-padding));
  }

  .profile-hero__content {
    bottom: 24px;
    gap: 10px;
  }

  .profile-hero__eyebrow {
    font-size: var(--font-body);
  }

  .profile-hero__title {
    font-size: 40px;
  }

  .profile-hero__chip {
    padding: 8px 14px;
    font-size: var(--font-body);
  }
}

/* ── 长条图：任何屏幕都完整居中，避免窄屏 cover 把两侧裁掉 ── */
.profile-hero--letterbox .profile-hero__fill--ambient {
  display: block;
  object-fit: cover;
  transform: scale(1.16);
  filter: blur(32px) saturate(140%) brightness(0.92);
}

.profile-hero--letterbox .profile-hero__fill--subject {
  object-fit: contain;
}

/* ── 无背景：收起成普通页头 ── */
/* 必须放在所有响应式规则之后，避免被 .profile-hero 的固定高度覆盖 */
.profile-hero--compact {
  height: auto;
  min-height: 0;
  padding-bottom: 6px;
  background: transparent;
}

.profile-hero--compact .profile-hero__content {
  position: static;
  bottom: auto;
  gap: 6px;
  margin-top: 2px;
}

.profile-hero--compact .profile-hero__eyebrow {
  color: var(--app-text-secondary);
  text-shadow: none;
}

.profile-hero--compact .profile-hero__title {
  font-size: 26px;
  color: var(--app-text);
  text-shadow: none;
}

.profile-hero--compact .profile-hero__chip {
  border-color: var(--app-border);
  background: var(--app-surface-soft);
  color: var(--app-text);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
</style>
