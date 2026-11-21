<template>
  <span class="mhy-avatar-frame" :style="rootStyle">
    <span class="mhy-avatar-frame__avatar">
      <LazyCachedImage
        v-if="avatar"
        :src="avatar"
        :alt="alt"
        :root-margin="rootMargin"
        :lazy="lazy"
        :skeleton-enabled="skeletonEnabled"
        class="mhy-avatar-frame__img"
      />
      <slot v-else />
    </span>

    <!-- 挂件画在头像外圈：默认 128.5% 与米游社网页端 .mhy-avatar__pendant 一致，
         大尺寸头像可用 scale 放宽，让挂件更有存在感 -->
    <span v-if="frameSrc" class="mhy-avatar-frame__pendant" aria-hidden="true">
      <!-- 装饰层禁用骨架/降级占位：挂件没加载出来时不能有灰块挡住底下头像，
           加载失败就当没挂件（降级链在 resolveAvatarPendantSrc 里已收敛） -->
      <LazyCachedImage
        :src="frameSrc"
        alt=""
        :root-margin="rootMargin"
        :skeleton-enabled="false"
        :fallback-enabled="false"
        class="mhy-avatar-frame__pendant-img"
      />
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { resolveAvatarPendantSrc } from '@/utils/mhyDecor/cdn'

const props = defineProps({
  /** 头像地址 */
  avatar: { type: String, default: '' },
  /** 挂件原始 CDN 地址（不带 x-oss-process 也可以） */
  frame: { type: String, default: '' },
  /** 挂件整图镜像（Supabase Storage 副本，目录条目的 m；米游社条目传空串） */
  frameMirror: { type: String, default: '' },
  /** 挂件云端预压缩 128px 静态 webp（目录条目的 t；米游社条目传空串） */
  frameThumb: { type: String, default: '' },
  /** 头像直径（px） */
  size: { type: Number, default: 44 },
  /**
   * 挂件相对头像的缩放倍数。
   * 1.285 = 米游社网页端（60px 级头像）的原始比例；
   * 大尺寸头像（个人主页 84px）传 1.4，挂件才不会显得缩在头像里。
   */
  scale: { type: Number, default: 1.285 },
  alt: { type: String, default: '' },
  /**
   * 挂件是否为动图。
   * 动图在 items 里标了 live；列表里默认 flatten 成静态首帧，避免 500 KB 级的 webp。
   */
  animated: { type: Boolean, default: false },
  /** 允许播放动图（详情页/个人主页再打开） */
  playAnimation: { type: Boolean, default: false },
  /** 头像是否懒加载（首屏头像传 false，避免 IntersectionObserver 前白屏） */
  lazy: { type: Boolean, default: true },
  /** 头像是否显示骨架屏（首屏常驻头像传 false） */
  skeletonEnabled: { type: Boolean, default: true },
  rootMargin: { type: String, default: '320px 0px' }
})

const rootStyle = computed(() => ({
  '--mhy-avatar-size': `${Math.max(16, Number(props.size) || 44)}px`,
  '--mhy-pendant-scale': String(Math.max(1, Number(props.scale) || 1.285))
}))

/**
 * 取图交给 resolveAvatarPendantSrc：小尺寸/静态优先云端缩略图，其次镜像，
 * 最后 OSS 缩放；播动画时必须显式传 animate，否则会命中静态缩略图（t 是首帧）。
 * 与切换时的预热共用同一个函数，避免两处算法漂移导致「预热了但还是重新拉」。
 */
const frameSrc = computed(() => {
  if (!props.frame) return ''
  return resolveAvatarPendantSrc(
    { u: props.frame, m: props.frameMirror, t: props.frameThumb, a: props.animated },
    { size: props.size, playAnimation: props.playAnimation }
  )
})
</script>

<style scoped>
.mhy-avatar-frame {
  position: relative;
  display: inline-block;
  width: var(--mhy-avatar-size);
  height: var(--mhy-avatar-size);
  flex: 0 0 auto;
  vertical-align: middle;
}

.mhy-avatar-frame__avatar {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  border-radius: 50%;
  background: var(--app-surface-soft);
}

.mhy-avatar-frame__img,
.mhy-avatar-frame__pendant-img {
  width: 100%;
  height: 100%;
}

/* 默认 128.5%（米游社网页端 .mhy-avatar__pendant 的原始比例），
   scale 可放大；用 translate 居中，避免百分比 margin 与 -2px 补偿的写法 */
.mhy-avatar-frame__pendant {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  display: block;
  width: calc(var(--mhy-pendant-scale) * 100%);
  height: calc(var(--mhy-pendant-scale) * 100%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
