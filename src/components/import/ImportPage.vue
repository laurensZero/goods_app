<!--
  ImportPage.vue
  导入类页面通用外壳：页面根容器 + NavBar（返回自带转场）+ 内容插槽。
  各导入源（米游铺 / 淘宝 / 未来扩展）统一由此进入；页面级 class 通过
  attrs 透传到根节点（如 class="import-page"）。
-->
<template>
  <div class="page">
    <NavBar :title="title" show-back>
      <template #right>
        <slot name="right" />
      </template>
    </NavBar>
    <slot />
  </div>
</template>

<script setup>
import NavBar from '@/components/common/NavBar.vue'

defineProps({
  title: {
    type: String,
    default: ''
  }
})
</script>
