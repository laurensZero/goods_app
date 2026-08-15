<template>
  <TagSuggestionPanel
    :suggestions="tagSuggestions"
    @apply="applySuggestion"
    @ignore="handleIgnore"
    @apply-all="applyAllSuggestions"
  />
</template>

<script setup>
import { reactive } from 'vue'
import TagSuggestionPanel from '@/components/goods/TagSuggestionPanel.vue'
import { useSmartTagging } from '@/composables/goods/useSmartTagging'

// 队列项智能识别建议：把 entry 的字段映射成 useSmartTagging 期望的表单形态。
// 由于 useSmartTagging 必须在组件 setup 中调用（内部有 watch/onBeforeUnmount），
// 每个队列项通过本组件独立实例化，字段读写直接落到 entry 上。
// 注意：entry 是父级传入的共享响应式对象，这里用本地别名读写（避免直接改 props 触发 lint 规则）。
defineOptions({ name: 'ImportQueueTagSuggestions' })

const props = defineProps({
  entry: { type: Object, required: true },
})

const entry = props.entry

const form = reactive({
  get name() {
    return entry.name
  },
  set name(value) {
    entry.name = value
  },
  get note() {
    return entry.info?.notes ?? ''
  },
  set note(value) {
    if (entry.info) entry.info.notes = value
  },
  get characters() {
    return entry.info?.characters ?? []
  },
  set characters(value) {
    if (entry.info) entry.info.characters = value
  },
  get category() {
    return entry.info?.category ?? ''
  },
  set category(value) {
    if (entry.info) entry.info.category = value
  },
  get ip() {
    return entry.info?.ip ?? ''
  },
  set ip(value) {
    if (entry.info) entry.info.ip = value
  },
  get tags() {
    return entry.info?.tags ?? []
  },
  set tags(value) {
    if (entry.info) entry.info.tags = value
  },
})

const { tagSuggestions, applySuggestion, ignoreSuggestion, applyAllSuggestions } = useSmartTagging(form)

function handleIgnore({ field }) {
  if (field === 'characters' && entry.info) {
    entry.info.characters = []
  }
  ignoreSuggestion({ field })
}
</script>
