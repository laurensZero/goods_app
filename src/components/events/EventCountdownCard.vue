<template>
  <article
    class="cd-card"
    :class="[`cd-card--${status}`, toneClass, { 'cd-card--selected': selected }]"
    :data-event-id="String(event.id || '')"
    :aria-label="ariaLabel"
    @touchstart="press.onTouchStart"
    @touchmove="press.onTouchMove"
    @touchend="press.onTouchEnd"
    @touchcancel="press.onTouchCancel"
    @mousedown="press.onMouseDown"
    @mousemove="press.onMouseMove"
    @mouseup="press.onMouseUp"
    @mouseleave="press.onMouseLeave"
    @contextmenu.prevent
  >
    <Transition name="sel-overlay">
      <div v-if="selectionMode" class="selection-overlay">
        <div :class="['check-icon', { 'check-icon--checked': selected }]">
          <svg v-if="selected" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
    </Transition>

    <div class="cd-card__figure">
      <span :class="['cd-card__num', { 'cd-card__num--text': isTextFigure }]">{{ figure }}</span>
      <span v-if="!isTextFigure" class="cd-card__unit">{{ t('events.countdown.unitDay') }}</span>
    </div>

    <div class="cd-card__info">
      <p class="cd-card__caption">{{ caption }}</p>
      <h3 class="cd-card__title">{{ event.name || t('events.card.unnamed') }}</h3>
      <p class="cd-card__meta">
        <span>{{ dateDisplay || t('events.card.pendingTime') }}</span>
        <span v-if="event.location"> · {{ event.location }}</span>
      </p>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { bindEventCardPress, useEventCardPress } from '@/composables/events/useEventCardPress'
import { COUNTDOWN_STATUS } from '@/utils/events/countdown'

const props = defineProps({
  event: { type: Object, required: true },
  status: { type: String, default: COUNTDOWN_STATUS.UNDATED },
  days: { type: Number, default: 0 },
  endsInDays: { type: Number, default: -1 },
  selected: { type: Boolean, default: false },
  selectionMode: { type: Boolean, default: false }
})

const emit = defineEmits(['long-press', 'toggle-select', 'open-detail'])

const { t } = useI18n()

function handleTap() {
  if (props.selectionMode) {
    emit('toggle-select', props.event.id)
    return
  }
  emit('open-detail', { id: props.event.id, sourceEl: null })
}

const press = useEventCardPress({
  onTap: handleTap,
  onLongPress: () => emit('long-press', props.event.id)
})
bindEventCardPress(press)

const isTextFigure = computed(() =>
  props.status === COUNTDOWN_STATUS.UPCOMING && props.days === 0
)

const figure = computed(() => {
  if (isTextFigure.value) return t('events.countdown.today')
  if (props.status === COUNTDOWN_STATUS.UNDATED) return '—'
  return String(props.days)
})

const caption = computed(() => {
  switch (props.status) {
    case COUNTDOWN_STATUS.UPCOMING:
      if (props.days === 0) return t('events.countdown.capIsToday')
      if (props.days === 1) return t('events.countdown.capTomorrow')
      return t('events.countdown.capUntil', { n: props.days })
    case COUNTDOWN_STATUS.ONGOING:
      if (props.endsInDays === 0) return t('events.countdown.capEndsToday')
      if (props.endsInDays === 1) return t('events.countdown.capEndsTomorrow')
      return t('events.countdown.capEndsIn', { n: props.endsInDays })
    case COUNTDOWN_STATUS.PAST:
      if (props.days === 1) return t('events.countdown.capYesterday')
      return t('events.countdown.capAgo', { n: props.days })
    default:
      return t('events.countdown.capUndated')
  }
})

const toneClass = computed(() => {
  switch (props.status) {
    case COUNTDOWN_STATUS.UPCOMING:
      return props.days <= 7 ? 'cd-card--tone-hot' : 'cd-card--tone-cool'
    case COUNTDOWN_STATUS.ONGOING:
      return 'cd-card--tone-live'
    case COUNTDOWN_STATUS.PAST:
      return 'cd-card--tone-past'
    default:
      return 'cd-card--tone-muted'
  }
})

const dateDisplay = computed(() => {
  const start = props.event.startDate
  const end = props.event.endDate
  if (!start) return ''
  if (!end || end === start) return start
  return `${start} - ${end}`
})

const ariaLabel = computed(() =>
  `${figure.value}${isTextFigure.value ? '' : ` ${t('events.countdown.unitDay')}`}，${caption.value}，${props.event.name || ''}`
)
</script>

<style scoped>
.cd-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  min-width: 0;
  padding: 20px 22px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.cd-card:active {
  transform: scale(var(--press-scale-card));
}

.cd-card--selected {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--app-chip-accent-text) 72%, white),
    var(--app-shadow);
}

.selection-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.check-icon {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 10px rgba(20, 20, 22, 0.12);
}

.check-icon--checked {
  background: #141416;
  border-color: #141416;
  color: #fff;
}

.check-icon svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sel-overlay-enter-active,
.sel-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.sel-overlay-enter-from,
.sel-overlay-leave-to {
  opacity: 0;
}

.cd-card__figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  padding: 12px 16px;
  border-radius: 20px;
  background: var(--cd-tone-bg, color-mix(in srgb, var(--app-surface-soft) 88%, transparent));
}

.cd-card__num {
  font-size: 44px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.05em;
  color: var(--cd-tone-strong, var(--app-text));
  font-variant-numeric: tabular-nums;
}

.cd-card__num--text {
  font-size: 26px;
  letter-spacing: -0.02em;
}

.cd-card__unit {
  margin-top: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-tone-soft, var(--app-text-tertiary));
}

.cd-card__info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.cd-card__caption {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-tone-strong, var(--app-text-secondary));
}

.cd-card__title {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.03em;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.cd-card__meta {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
}

/* ---- 状态配色 ---- */

.cd-card--tone-hot {
  --cd-tone-bg: rgba(250, 120, 90, 0.14);
  --cd-tone-strong: #d24a20;
  --cd-tone-soft: color-mix(in srgb, #d24a20 62%, var(--app-text-tertiary));
}

.cd-card--tone-cool {
  --cd-tone-bg: rgba(90, 120, 250, 0.13);
  --cd-tone-strong: #2d56d5;
  --cd-tone-soft: color-mix(in srgb, #2d56d5 58%, var(--app-text-tertiary));
}

.cd-card--tone-live {
  --cd-tone-bg: rgba(46, 168, 122, 0.15);
  --cd-tone-strong: #157a52;
  --cd-tone-soft: color-mix(in srgb, #157a52 58%, var(--app-text-tertiary));
}

.cd-card--tone-past {
  --cd-tone-bg: color-mix(in srgb, var(--app-surface-soft) 92%, transparent);
  --cd-tone-strong: var(--app-text-tertiary);
  --cd-tone-soft: var(--app-text-tertiary);
}

.cd-card--tone-muted {
  --cd-tone-bg: color-mix(in srgb, var(--app-surface-soft) 92%, transparent);
  --cd-tone-strong: var(--app-text-secondary);
  --cd-tone-soft: var(--app-text-tertiary);
}

/* ---- 深色模式 ---- */

:global(html.theme-dark) .check-icon--checked {
  background: #f5f5f7;
  border-color: #f5f5f7;
}

:global(html.theme-dark) .check-icon--checked svg {
  stroke: #141416;
}

:global(html.theme-dark) .cd-card--tone-hot {
  --cd-tone-bg: rgba(250, 140, 100, 0.18);
  --cd-tone-strong: #f2a084;
  --cd-tone-soft: #e8b3a0;
}

:global(html.theme-dark) .cd-card--tone-cool {
  --cd-tone-bg: rgba(100, 130, 250, 0.2);
  --cd-tone-strong: #9db4ff;
  --cd-tone-soft: #aab9e8;
}

:global(html.theme-dark) .cd-card--tone-live {
  --cd-tone-bg: rgba(60, 190, 140, 0.18);
  --cd-tone-strong: #6fd4a8;
  --cd-tone-soft: #93cbb2;
}

@media (max-width: 720px) {
  .cd-card {
    padding: 16px;
    gap: 14px;
  }

  .cd-card__figure {
    min-width: 78px;
    padding: 10px 12px;
  }

  .cd-card__num {
    font-size: 38px;
  }

  .cd-card__num--text {
    font-size: 23px;
  }
}
</style>
