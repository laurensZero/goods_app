<!--
  ImportHeroPreview.vue
  导入结果预览卡（米游铺同款）：左侧封面预览 + 右侧名称/说明。
-->
<template>
  <section class="manage-hero">
    <div class="preview-stage">
      <div class="preview-glow" />
      <div
        class="preview-media"
        :class="{ 'preview-media--empty': !image }"
        :data-cover-tone="coverTone"
      >
        <img v-if="image" :src="image" :alt="name" class="preview-image" />
        <span v-else class="preview-fallback">{{ fallbackText }}</span>
      </div>
    </div>

    <article class="hero-card">
      <p class="hero-label">{{ label }}</p>
      <h1 class="hero-title">{{ name || t('import.goodsName') }}</h1>
      <p class="hero-desc">{{ desc }}</p>
    </article>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  image: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  desc: {
    type: String,
    default: ''
  },
  coverTone: {
    type: String,
    default: null
  }
})

const { t } = useI18n()

const fallbackText = computed(() =>
  props.name?.trim().charAt(0).toUpperCase() || t('goods.heroFallbackGoods')
)
</script>

<style scoped>
.manage-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 0;
}

.preview-stage {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-glow {
  position: absolute;
  inset: -4px;
  border-radius: 26px;
  background: radial-gradient(ellipse at center, rgba(100, 160, 255, 0.18) 0%, transparent 70%);
  pointer-events: none;
}

.preview-media {
  width: 76px;
  height: 76px;
  border-radius: var(--radius-card);
  overflow: hidden;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--app-shadow-sm);
  position: relative;
  z-index: 1;
}

.preview-media--empty {
  background: var(--cover-tone);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-fallback {
  font-size: 26px;
  font-weight: 700;
  color: var(--cover-tone-text);
  line-height: 1;
}

.hero-card {
  padding: 0;
  flex: 1;
  min-width: 0;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.hero-desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}
</style>
