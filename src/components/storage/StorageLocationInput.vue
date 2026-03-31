<template>
  <div class="storage-location-input">
    <div class="storage-location-summary" :class="{ 'storage-location-summary--empty': !modelValue }">
      {{ modelValue || placeholder }}
    </div>

    <div class="storage-location-levels">
      <div
        v-for="level in levelConfigs"
        :key="level.depth"
        class="storage-location-level"
      >
        <span class="storage-location-level__label">第 {{ level.depth + 1 }} 级</span>
        <AppSelect
          :model-value="level.selectedId"
          :options="level.options"
          :placeholder="level.placeholder"
          @update:model-value="selectAtLevel(level.depth, $event)"
        />
      </div>
    </div>

    <button
      v-if="quickCreate"
      type="button"
      class="storage-location-create-btn"
      @click="toggleQuickCreate"
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3V13" />
        <path d="M3 8H13" />
      </svg>
      {{ quickCreateButtonText }}
    </button>

    <QuickPresetCreator
      v-if="quickCreate && showQuickCreate"
      :show="showQuickCreate"
      v-model="quickCreateName"
      :placeholder="quickCreatePlaceholder"
      :maxlength="20"
      submit-text="新增位置"
      @cancel="closeQuickCreate"
      @submit="submitQuickCreate"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import AppSelect from '@/components/common/AppSelect.vue'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: '未设置收纳位置'
  },
  quickCreate: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const presets = usePresetsStore()

const selectedIds = ref([])
const showQuickCreate = ref(false)
const quickCreateName = ref('')

const deepestSelectedId = computed(() => {
  const ids = selectedIds.value.filter(Boolean)
  return ids[ids.length - 1] || ''
})

const deepestSelectedPath = computed(() =>
  deepestSelectedId.value ? presets.buildStorageLocationPathById(deepestSelectedId.value) : ''
)

const levelConfigs = computed(() => {
  const levels = []
  let parentId = ''
  let depth = 0
  let shouldContinue = true

  while (shouldContinue && depth < 20) {
    const children = presets.getStorageLocationChildren(parentId)
    const selectedId = selectedIds.value[depth] || ''
    levels.push({
      depth,
      selectedId,
      placeholder: depth === 0 ? '选择一级位置' : `选择第 ${depth + 1} 级位置`,
      options: [
        {
          label: depth === 0 ? '不设置' : '到这里为止',
          value: ''
        },
        ...children.map((child) => ({
          label: child.name,
          value: child.id
        }))
      ]
    })

    if (!selectedId) {
      shouldContinue = false
      continue
    }

    const childOptions = presets.getStorageLocationChildren(selectedId)
    if (childOptions.length === 0 && !props.quickCreate) {
      shouldContinue = false
      continue
    }

    parentId = selectedId
    depth += 1
  }

  return levels
})

const quickCreateButtonText = computed(() =>
  deepestSelectedId.value ? '新建下一级位置' : '新建一级位置'
)

const quickCreatePlaceholder = computed(() =>
  deepestSelectedPath.value
    ? `新增到 ${deepestSelectedPath.value} 下`
    : '输入一级位置名称'
)

watch(
  () => props.options,
  (options) => {
    presets.syncStorageLocationsFromPaths(options)
  },
  { immediate: true, deep: true }
)

watch(
  () => props.modelValue,
  async (value) => {
    if (!value) {
      selectedIds.value = []
      return
    }

    const ids = await presets.ensureStorageLocationPath(value)
    selectedIds.value = ids
  },
  { immediate: true }
)

function emitCurrentPath(nextIds = selectedIds.value) {
  const filteredIds = nextIds.filter(Boolean)
  const deepestId = filteredIds[filteredIds.length - 1]
  const path = deepestId ? presets.buildStorageLocationPathById(deepestId) : ''

  emit('update:modelValue', path)
}

function selectAtLevel(depth, value) {
  const nextIds = selectedIds.value.slice(0, depth)
  if (value) {
    nextIds.push(value)
  }

  selectedIds.value = nextIds
  emitCurrentPath(nextIds)
}

function toggleQuickCreate() {
  showQuickCreate.value = !showQuickCreate.value
  if (!showQuickCreate.value) {
    quickCreateName.value = ''
  }
}

function closeQuickCreate() {
  showQuickCreate.value = false
  quickCreateName.value = ''
}

async function submitQuickCreate() {
  const name = String(quickCreateName.value || '').trim()
  if (!name) return

  const node = await presets.addStorageLocation(name, deepestSelectedId.value)
  if (!node) return

  const nextIds = [...selectedIds.value.filter(Boolean), node.id]
  selectedIds.value = nextIds
  emitCurrentPath(nextIds)
  closeQuickCreate()
}
</script>

<style scoped>
.storage-location-input {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.storage-location-summary {
  min-height: 44px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(20, 20, 22, 0.05);
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.storage-location-summary--empty {
  color: var(--app-placeholder);
}

.storage-location-levels {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.storage-location-level {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.storage-location-level__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 500;
}

.storage-location-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  padding: 0;
}

.storage-location-create-btn:active {
  transform: scale(0.96);
}

.storage-location-create-btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

:global(html.theme-dark) .storage-location-summary {
    background: rgba(255, 255, 255, 0.05);
  }
</style>
