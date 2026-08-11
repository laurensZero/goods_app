<script setup>
import { ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import PanelDrawer from '../components/ui/PanelDrawer.vue'
import SurveyList from './survey/SurveyList.vue'
import SurveyForm from './survey/SurveyForm.vue'
import SurveyResponses from './survey/SurveyResponses.vue'

const listRef = ref(null)
const editorOpen = ref(false)
const editingItem = ref(null)
const responsesOpen = ref(false)

function openCreate() {
  editingItem.value = null
  responsesOpen.value = false
  editorOpen.value = true
}

function openEdit(item) {
  editingItem.value = item
  responsesOpen.value = false
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editingItem.value = null
}

function openResponses() {
  editorOpen.value = false
  responsesOpen.value = true
}

async function onSubmit(row) {
  try {
    if (editingItem.value) {
      await supabaseRequest(`/rest/v1/surveys?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: row })
    } else {
      await supabaseRequest('/rest/v1/surveys', { method: 'POST', body: row })
    }
    closeEditor()
    listRef.value?.load()
  } catch (e) {
    // 表单提交失败由 Section 兜底提示
  }
}
</script>

<template>
  <SurveyList
    ref="listRef"
    @create="openCreate"
    @edit="openEdit"
    @view-responses="openResponses"
  />

  <!-- 问卷编辑抽屉 -->
  <PanelDrawer
    :open="editorOpen"
    :title="editingItem ? '编辑问卷' : '新建问卷'"
    kicker="survey editor"
    :width="640"
    @close="closeEditor"
  >
    <SurveyForm :editing="editingItem" @submit="onSubmit" @close="closeEditor" />
  </PanelDrawer>

  <!-- 回复查看抽屉 -->
  <PanelDrawer
    :open="responsesOpen"
    title="问卷回复"
    kicker="survey responses"
    :width="720"
    @close="responsesOpen = false"
  >
    <SurveyResponses :surveys="listRef?.items || []" />
  </PanelDrawer>
</template>
