<template>
  <GoodsEditorForm mode="edit" :edit-id="id" />
</template>

<script setup>
import GoodsEditorForm from '@/components/goods/GoodsEditorForm.vue'

defineProps({
  id: {
    type: String,
    required: true
  }
})
</script>
