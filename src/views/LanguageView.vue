<template>
  <div class="page language-page">
    <NavBar :title="t('manage.language')" show-back />

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Z" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10a15.3 15.3 0 0 1-4 10a15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">Language Settings</p>
            <h1 class="hero-title">{{ t('manage.language') }}</h1>
            <p class="hero-desc">{{ t('manage.languageDesc') }}</p>
            <div class="hero-meta">
              <span class="hero-chip">{{ currentLanguageLabel }}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Select Language</p>
          <h2 class="section-title">{{ t('manage.languageSwitch') }}</h2>
          <p class="section-desc">{{ t('manage.languageSwitchDesc') }}</p>
        </div>

        <div class="language-grid">
          <button
            v-for="locale in localeOptions"
            :key="locale.value"
            type="button"
            :class="['language-card', { 'language-card--active': currentLocale === locale.value }]"
            @click="switchLocale(locale.value)"
          >
            <div class="language-card__body">
              <span class="language-card__name">{{ locale.label }}</span>
              <span class="language-card__native">{{ locale.nativeLabel }}</span>
            </div>
            <span v-if="currentLocale === locale.value" class="language-card__check">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import { setLocale } from '@/locales'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'

defineOptions({ name: 'LanguageView' })

const { t, locale } = useI18n()
const pageBodyRef = ref(null)

const currentLocale = computed(() => locale.value)

const localeOptions = [
  { value: 'zh-CN', label: '简体中文', nativeLabel: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: '繁體中文', nativeLabel: 'Chinese (Traditional)' },
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'ja', label: '日本語', nativeLabel: 'Japanese' },
  { value: 'ko', label: '한국어', nativeLabel: 'Korean' }
]

const currentLanguageLabel = computed(() => {
  const current = localeOptions.find(l => l.value === currentLocale.value)
  return current ? current.label : ''
})

async function switchLocale(newLocale) {
  if (newLocale === currentLocale.value) return
  await setLocale(newLocale)
}

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

onMounted(() => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
})
</script>

<style scoped src="../assets/views/LanguageView.css"></style>
