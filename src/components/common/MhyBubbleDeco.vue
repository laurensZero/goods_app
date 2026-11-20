<template>
  <!--
    评论装扮气泡（米游社）页签挂件：挂到各 tab 页主面板右上角。
    本组件不自带定位容器：宿主把它放进主面板（position:relative 锚点），
    用 CSS 变量 --mhy-bubble-right / --mhy-bubble-top 微调贴角位置（默认贴 0,0）。

    注意：本组件不做米游铺开关门控（渲染层默认始终开启），
    开关门控由宿主在调用点处理（v-if 包住本组件即可）。
  -->
  <span class="mhy-bubble-deco">
    <!-- 气泡贴角画：透明底 PNG（动图播 gif），pointer-events 穿透不挡面板交互 -->
    <span v-if="bubbleSrc" class="mhy-bubble-deco__bubble" aria-hidden="true">
      <!-- 与头像框同一条图片缓存链路：换图时保留旧像素，新图解码完再替换；
           失败不显示内置占位（透明贴角上会露出灰底），由下面的降级链处理 -->
      <LazyCachedImage
        :src="bubbleSrc"
        alt=""
        :skeleton-enabled="false"
        :fallback-enabled="false"
        class="mhy-bubble-deco__bubble-img"
        @error="onBubbleImgError"
      />
    </span>

    <!-- 编辑入口：低调小铅笔。桌面 hover 才显现，触屏常态低透明度；
         气泡本体 pointer-events:none，按钮单独恢复可点 -->
    <button
      type="button"
      class="mhy-bubble-deco__edit"
      :aria-label="t('my.bubble.editEntry')"
      :title="t('my.bubble.editEntry')"
      @click.stop="openPicker"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </button>

    <MhyBubblePickerSheet
      v-model="showPicker"
      :bubble="currentBubble"
      :page-key="pageKey"
      @select="onSelect"
    />

    <!-- 保存失败提示：AppToast 是 fixed 定位，放组件内不影响锚点布局 -->
    <AppToast :message="toastMsg" />
  </span>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import AppToast from '@/components/common/AppToast.vue'
import MhyBubblePickerSheet from '@/components/my/MhyBubblePickerSheet.vue'
import { useMhyBubblesStore } from '@/stores/mhyBubbles'
import { useToast } from '@/composables/useToast'
import { resolveBubbleSrc } from '@/utils/mhyDecor/cdn'

const { t } = useI18n()

const props = defineProps({
  /** 页面 key（home/wishlist/events/recharge/my），决定读/写哪一页的配置 */
  pageKey: { type: String, required: true },
  /** 气泡展示宽度（px），实际贴角尺寸由 CSS 变量 --mhy-bubble-size 控制，这里只用于取图档位 */
  width: { type: Number, default: 176 }
})

const bubblesStore = useMhyBubblesStore()
const { toastMsg, showToast } = useToast()

const showPicker = ref(false)

/** 当前页配置的气泡（目录紧凑项，null = 无气泡） */
const currentBubble = computed(() => bubblesStore.byPage[props.pageKey] || null)

// 页面挂载时确保配置收敛；已登录且本地无配置时 store 内部走限频 refreshUser
onMounted(() => {
  void bubblesStore.ensureLoaded(props.pageKey)
})

/** 展示宽取 2 倍图（retina），动图是否可播看 a && gif（用户已拍板支持动图） */
const displayWidth = computed(() => Math.max(16, Number(props.width) || 176) * 2)
const canPlayGif = computed(() => !!(currentBubble.value?.a && currentBubble.value?.gif))

// gif 加载失败退静态底图；静态也失败就整体隐藏贴图（装饰元素，不留破图占位）
const gifFailed = ref(false)
const staticFailed = ref(false)
watch(
  () => currentBubble.value?.i || '',
  () => {
    gifFailed.value = false
    staticFailed.value = false
  }
)

/**
 * 真正挂到 <img> 上的地址。
 *
 * 列表里的缩略图和贴角用的 2 倍图不是同一张，切换时必然换图；
 * 缓存与「换图时保留旧像素」都交给 LazyCachedImage（与头像框一致），
 * 所以不会先贴一张低清图再跳成高清。
 */
const bubbleSrc = computed(() => {
  const item = currentBubble.value
  if (!item || staticFailed.value) return ''
  if (canPlayGif.value && !gifFailed.value) {
    return resolveBubbleSrc(item, { playAnimation: true })
  }
  return resolveBubbleSrc(item, { width: displayWidth.value })
})

function onBubbleImgError() {
  // 当前在播 gif：退静态再试一次；静态也挂了就放弃展示
  if (canPlayGif.value && !gifFailed.value) {
    gifFailed.value = true
    return
  }
  staticFailed.value = true
}

function openPicker() {
  showPicker.value = true
}

/**
 * 选择器点 tile 的即时回调（不关弹窗）：更新该页配置 + 本地落库 + 云端同步。
 * store 返回云端 Promise，失败弹 toast；本地已即时生效，弹窗里能直接看到。
 */
function onSelect(item) {
  bubblesStore.setPage(props.pageKey, item).catch((e) => {
    console.warn('[MhyBubbleDeco] mhy_bubbles sync failed', e)
    showToast(t('my.bubble.saveFailed'))
  })
}
</script>

<style scoped>
/*
 * 定位基准：宿主主面板（position:relative）。root 是 0×0 的贴角锚点，
 * 子元素以它为包含块；offset 由宿主用 CSS 变量微调（summary-section 的
 * 右侧要加 --page-padding 才能对齐卡片边缘）。
 */
.mhy-bubble-deco {
  position: absolute;
  top: var(--mhy-bubble-top, 0px);
  right: var(--mhy-bubble-right, 0px);
  width: 0;
  height: 0;
  /* 低于面板内可交互元素（summary 布局/账号面板内容都是 z-index:1） */
  z-index: 0;
  pointer-events: none;
}

.mhy-bubble-deco__bubble {
  position: absolute;
  top: 0;
  right: 0;
  /* 素材自带 4:1 的画布（384×96），按 88px 宽贴角时实际画只有二十来像素高，
     所以默认给到 176px（≈44px 高）；各页可用 --mhy-bubble-size 单独调 */
  width: var(--mhy-bubble-size, 176px);
}

/* LazyCachedImage 根节点默认 height:100%，父级没有显式高度会塌成 0；
   素材固定 4:1，这里用 aspect-ratio 撑出高度 */
.mhy-bubble-deco__bubble-img {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 1;
}

.mhy-bubble-deco__bubble-img :deep(.lazy-image-element) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.mhy-bubble-deco__edit {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(20, 20, 22, 0.32);
  color: #fff;
  z-index: 2;
  pointer-events: auto;
  cursor: pointer;
  /* 触屏常态低透明度 */
  opacity: 0.42;
  transition: opacity 0.16s ease;
}

.mhy-bubble-deco__edit svg {
  width: 14px;
  height: 14px;
}

/* 桌面 hover 显现：贴角 24px 热区常驻（opacity 不影响命中），移入即浮现 */
@media (hover: hover) and (pointer: fine) {
  .mhy-bubble-deco__edit {
    opacity: 0;
  }

  .mhy-bubble-deco__edit:hover,
  .mhy-bubble-deco__edit:focus-visible {
    opacity: 0.85;
  }
}

.mhy-bubble-deco__edit:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 1px;
}
</style>
