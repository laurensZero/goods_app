<template>
  <GoodsEditorForm :initial-is-wishlist="isWishlistMode" />
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import GoodsEditorForm from '@/components/goods/GoodsEditorForm.vue'

const route = useRoute()
const isWishlistMode = computed(() => route.query.mode === 'wishlist')
</script>
