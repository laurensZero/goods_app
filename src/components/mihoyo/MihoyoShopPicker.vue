<!--
  MihoyoShopPicker.vue
  米游铺店铺多选 chips：上新推送订阅（通知设置页）与上新速览页「编辑店铺」
  共用的选择器，读写同一份配置 user_qq_bindings.mihoyo_shops。
    - 选项来自 src/utils/mihoyo/shops.js（唯一店铺清单，新增店铺自动出现）
    - 组件只负责展示与 toggle 事件，读写由调用方走 qqBinding store
      （乐观更新 + 失败回滚在 store 内处理）
  用法：<MihoyoShopPicker :selected="qqStore.mihoyoShops" :disabled="!qqStore.isMihoyoEnabled" @toggle="toggleShop" />
-->
<template>
  <div class="mh-shop-picker">
    <button
      v-for="shop in MIHOYO_SHOPS"
      :key="shop.code"
      type="button"
      class="mh-shop-chip"
      :class="{ 'mh-shop-chip--active': selected.includes(shop.code) }"
      :disabled="disabled"
      @click="emit('toggle', shop.code)"
    >
      {{ t(shop.labelKey) }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { MIHOYO_SHOPS } from '@/utils/mihoyo/shops'

defineProps({
  /** 已选店铺 code 列表（qqStore.mihoyoShops） */
  selected: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle'])
const { t } = useI18n()
</script>

<style scoped>
.mh-shop-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mh-shop-chip {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mh-shop-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mh-shop-chip--active {
  background: var(--app-text);
  color: var(--app-surface);
  border-color: var(--app-text);
}
</style>
