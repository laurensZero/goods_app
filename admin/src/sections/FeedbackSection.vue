<script setup>
import { ref } from 'vue'
import PanelDrawer from '../components/ui/PanelDrawer.vue'
import FeedbackList from './feedback/FeedbackList.vue'
import FeedbackDetail from './feedback/FeedbackDetail.vue'

const detailId = ref(null)
const listRef = ref(null)
</script>

<template>
  <FeedbackList ref="listRef" @open-detail="detailId = $event" />

  <!-- 详情抽屉 -->
  <PanelDrawer
    :open="!!detailId"
    title="反馈详情"
    kicker="feedback detail"
    :width="560"
    @close="detailId = null"
  >
    <FeedbackDetail :feedback-id="detailId" @updated="listRef?.load()" @close="detailId = null" />
  </PanelDrawer>
</template>
