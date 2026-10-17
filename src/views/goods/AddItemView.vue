<template>
  <GoodsEditorForm
    :initial-is-wishlist="isWishlistMode"
    :draft-slot="draftSlot"
    :resume-draft="resumeDraft"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import GoodsEditorForm from '@/components/goods/GoodsEditorForm.vue'
import { BATCH_DRAFT_SLOTS } from '@/composables/batch/useBatchQueue'

const route = useRoute()
const isWishlistMode = computed(() => route.query.mode === 'wishlist')
// 单个新增草稿槽位固定在入口侧（收藏/心愿各一行），不受表单内 isWishlist 开关影响
const draftSlot = computed(() => (isWishlistMode.value ? BATCH_DRAFT_SLOTS.WISHLIST : BATCH_DRAFT_SLOTS.COLLECTION))
// fresh=1：入口已让用户选过「重新开始」（旧草稿已清除）→ 不再恢复
const resumeDraft = computed(() => route.query.fresh !== '1')
</script>
