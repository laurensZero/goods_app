<template>
  <!--
    评论装扮气泡（米游社）页签挂件：挂到各 tab 页主面板右上角。
    本组件不自带定位容器：宿主把它放进主面板（position:relative 锚点），
    用 CSS 变量 --mhy-bubble-right / --mhy-bubble-top 微调贴角位置（默认贴 0,0）。

    注意：本组件不做米游铺开关门控（渲染层默认始终开启），
    开关门控由宿主在调用点处理（v-if 包住本组件即可）。
  -->
  <span class="mhy-bubble-deco">
    <!-- 气泡贴角画：透明底 PNG（动图播 gif）。画布 4:1 左侧大量留白，可点区用
         专用热区条收敛在右侧美术区域（见 .mhy-bubble-deco__tap），避免透明部分
         吃掉头部标题/按钮的点击 -->
    <span v-if="bubbleSrc" class="mhy-bubble-deco__bubble" aria-hidden="true">
      <LazyCachedImage
        :src="bubbleSrc"
        alt=""
        :skeleton-enabled="false"
        :fallback-enabled="false"
        class="mhy-bubble-deco__bubble-img"
        @error="onBubbleImgError"
      />
      <button
        type="button"
        class="mhy-bubble-deco__tap"
        :aria-label="t('my.bubble.editEntry')"
        @click.stop="openPicker"
        @mouseenter="editHot = true"
        @mouseleave="editHot = false"
      />
    </span>

    <!-- 编辑入口：低调小铅笔。所有端默认隐形（触屏无 hover，常驻会被用户要求隐藏），
         热区保留：桌面 hover 浮现，触屏直接点贴角盲区/点气泡本体打开选择器 -->
    <button
      type="button"
      class="mhy-bubble-deco__edit"
      :class="{ 'mhy-bubble-deco__edit--show': editHot, 'mhy-bubble-deco__edit--empty': !bubbleSrc }"
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
// 悬停气泡美术区时显现铅笔钮（触屏无 hover，走点气泡本体入口）
const editHot = ref(false)

/** 当前页配置的气泡（目录紧凑项，null = 无气泡） */
const currentBubble = computed(() => bubblesStore.byPage[props.pageKey] || null)

// 页面挂载时确保配置收敛；已登录且本地无配置时 store 内部走限频 refreshUser
onMounted(() => {
  void bubblesStore.ensureLoaded(props.pageKey)
})

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
  // 上屏（页面贴角）永远是原图级：mirror → 去参原图，不做任何缩放
  return resolveBubbleSrc(item)
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
  /* 部分装扮底图是不透明整幅画（自带 bg_color 背景），贴在概览卡右上角时
     会把卡片的圆角盖成直角——容器裁一个与卡片一致的右上圆角 */
  overflow: hidden;
  border-top-right-radius: var(--radius-large, 16px);
}

/* 可点热区：只盖右侧美术区域（约前 62% 是透明留白），点气泡=开选择器；
   触屏端编辑钮隐形后的主要入口 */
.mhy-bubble-deco__tap {
  position: absolute;
  top: 0;
  right: 0;
  width: 38%;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  pointer-events: auto;
  cursor: pointer;
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
  /* 全端默认隐形（触屏用户要求隐藏按钮），24px 热区保留可盲点 */
  opacity: 0;
  transition: opacity 0.16s ease;
}

.mhy-bubble-deco__edit svg {
  width: 14px;
  height: 14px;
}

/* 桌面 hover 显现；触屏端无 hover：没选装扮时露出低透明度铅笔钮做入口
   （否则无处进入编辑），选了之后气泡本体即入口，钮保持隐形 */
@media (hover: hover) and (pointer: fine) {
  .mhy-bubble-deco__edit:hover,
  .mhy-bubble-deco__edit:focus-visible,
  .mhy-bubble-deco__edit--show {
    opacity: 0.85;
  }
}

@media (hover: none) {
  .mhy-bubble-deco__edit--empty {
    opacity: 0.42;
  }
}

.mhy-bubble-deco__edit:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 1px;
}
</style>
