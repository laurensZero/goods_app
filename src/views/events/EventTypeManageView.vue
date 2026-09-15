<template>
  <div class="route-page">
    <div class="page sub-page">
    <NavBar :title="t('manage.eventTypeManage')" show-back>
      <template #right>
        <button class="add-btn" type="button" @click="toggleInput">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19" />
            <path d="M5 12H19" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main class="page-body page-entry">
      <Transition name="panel-fade">
        <div v-if="showInput" class="input-card">
          <input
            ref="inputRef"
            v-model="newName"
            class="row-input"
            type="text"
            maxlength="20"
            :placeholder="t('manage.eventType.inputPlaceholder')"
            @input="syncName"
            @blur="syncName"
            @change="syncName"
            @compositionend="syncName"
            @paste="syncNameLater"
            @keyup.enter="doAdd"
          />
          <button class="confirm-btn" type="button" @pointerdown="flushActiveInput" @click="doAdd">
            {{ t('common.save') }}
          </button>
        </div>
      </Transition>

      <section class="list-section">
        <p class="section-caption">{{ t('manage.eventType.builtinSection') }}</p>
        <div class="row-list">
          <div v-for="(item, idx) in builtinRows" :key="item.value" class="row-item" :class="{ 'row-item--last': idx === builtinRows.length - 1 }">
            <span class="type-chip" :class="item.chipClass">{{ item.label }}</span>
            <div class="row-main row-main--static">
              <span class="row-meta">{{ t('manage.eventType.eventCount', { count: getEventCount(item.value) }) }}</span>
            </div>
            <span class="builtin-badge">{{ t('manage.eventType.builtinBadge') }}</span>
          </div>
        </div>

        <p class="section-caption section-caption--custom">{{ t('manage.eventType.customSection') }}</p>
        <div v-if="presets.eventTypes.length > 0" class="row-list">
          <div
            v-for="(item, idx) in presets.eventTypes"
            :key="item.name"
            class="row-item"
            :class="{ 'row-item--last': idx === presets.eventTypes.length - 1 }"
          >
            <span class="type-chip type-custom">{{ item.name }}</span>
            <button class="row-main" type="button" @click="openEdit(item.name)">
              <span class="row-meta">{{ t('manage.eventType.eventCount', { count: getEventCount(item.name) }) }}</span>
            </button>
            <button
              class="tracks-toggle"
              type="button"
              :class="{ 'tracks-toggle--on': item.showTracks }"
              :aria-pressed="item.showTracks ? 'true' : 'false'"
              :aria-label="t('manage.eventType.showTracks')"
              @click="toggleShowTracks(item)"
            >
              <span class="tracks-toggle__label">{{ t('manage.eventType.showTracksShort') }}</span>
              <span class="tracks-toggle__knob" aria-hidden="true" />
            </button>
            <button class="row-delete" type="button" :aria-label="t('manage.eventType.delete')" @click="tryRemove(item.name)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18" />
                <path d="M6 6L18 18" />
              </svg>
            </button>
          </div>
        </div>

        <div class="list-footer">
          <p v-if="presets.eventTypes.length === 0" class="empty-hint">
            {{ t('manage.eventType.emptyHint') }}
          </p>
          <p v-else class="count-hint">{{ t('manage.eventType.count', { count: presets.eventTypes.length }) }}</p>
        </div>
      </section>
    </main>

    <AppSheet
      v-model="editSheetVisible"
      :lock-scroll="false"
      sheet-class="manage-edit-sheet"
    >
      <div class="edit-form" :style="editSheetStyle">
        <div class="edit-header">
          <span class="edit-title">{{ t('manage.eventType.editTitle') }}</span>
          <button type="button" class="edit-close" @click="closeEdit">×</button>
        </div>

        <p class="edit-caption">{{ t('manage.eventType.current', { name: editingName }) }}</p>

        <input
          ref="editInputRef"
          v-model="editName"
          class="row-input"
          type="text"
          maxlength="20"
          :placeholder="t('manage.eventType.newPlaceholder')"
          @focus="handleEditInputFocus"
          @keyup.enter="saveEdit"
        />

        <p v-if="editError" class="edit-error">{{ editError }}</p>

        <button class="save-btn" type="button" @click="saveEdit">{{ t('manage.eventType.saveEdit') }}</button>
      </div>
    </AppSheet>
    </div>

  <PresetDeleteConfirm
    :show="showDeleteConfirm"
    :name="pendingDeleteName"
    :count="affectedCount"
    :field-label="t('manage.eventType.fieldLabel')"
    @cancel="showDeleteConfirm = false"
    @confirm="confirmDelete"
  />
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePresetsStore } from '@/stores/presets'
import { useEventsStore } from '@/stores/events'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { useEditSheet } from '@/composables/manage/useEditSheet'
import {
  BUILTIN_EVENT_TYPES,
  getEventTypeChipClass,
  resolveEventTypeLabel
} from '@/constants/eventTypes'
import NavBar from '@/components/common/NavBar.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import PresetDeleteConfirm from '@/components/preset/PresetDeleteConfirm.vue'

const { t } = useI18n()
const presets = usePresetsStore()
const eventsStore = useEventsStore()

const builtinRows = computed(() =>
  BUILTIN_EVENT_TYPES.map((value) => ({
    value,
    label: resolveEventTypeLabel(value, t),
    chipClass: getEventTypeChipClass(value)
  }))
)

const typeCountMap = computed(() => {
  const map = new Map()
  for (const item of eventsStore.activeList) {
    const key = String(item.type || '').trim() || 'other'
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
})

function getEventCount(type) {
  const key = String(type || '').trim() || 'other'
  return typeCountMap.value.get(key) || 0
}

const showInput = ref(false)
const newName = ref('')
const inputRef = ref(null)
const editingName = ref('')
const editName = ref('')
const editError = ref('')
const editInputRef = ref(null)

const showDeleteConfirm = ref(false)
const pendingDeleteName = ref('')
const affectedCount = ref(0)

const { editSheetStyle, editSheetVisible, handleEditInputFocus } = useEditSheet({
  editingKey: editingName,
  editInputRef,
  closeEdit
})

async function toggleInput() {
  showInput.value = !showInput.value
  if (showInput.value) {
    await nextTick()
    inputRef.value?.focus()
  }
}

async function doAdd() {
  await commitActiveInput()
  syncDomField()
  if (await presets.addEventType(newName.value)) {
    newName.value = ''
    showInput.value = false
  }
}

function syncName(event) {
  newName.value = event.target.value ?? ''
}

function syncNameLater() {
  requestAnimationFrame(syncDomField)
}

function syncDomField() {
  if (inputRef.value) {
    newName.value = inputRef.value.value ?? ''
  }
}

async function tryRemove(name) {
  const count = getEventCount(name)
  if (count > 0) {
    pendingDeleteName.value = name
    affectedCount.value = count
    showDeleteConfirm.value = true
    return
  }
  await presets.removeEventType(name)
}

async function toggleShowTracks(item) {
  await presets.updateEventTypeShowTracks(item.name, !item.showTracks)
}

async function confirmDelete() {
  showDeleteConfirm.value = false
  const name = pendingDeleteName.value
  if (name) {
    await eventsStore.renameEventType(name, '')
    await presets.removeEventType(name)
  }
  pendingDeleteName.value = ''
  affectedCount.value = 0
}

function openEdit(name) {
  editingName.value = name
  editName.value = name
  editError.value = ''
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function closeEdit() {
  editingName.value = ''
  editName.value = ''
  editError.value = ''
}

async function saveEdit() {
  const previous = editingName.value
  const nextName = String(editName.value || '').trim()

  if (!nextName) {
    editError.value = t('manage.eventType.errorEmpty')
    return
  }

  if (previous === nextName) {
    closeEdit()
    return
  }

  const updated = await presets.updateEventTypeName(previous, nextName)
  if (!updated) {
    editError.value = t('manage.eventType.errorExists')
    return
  }

  await eventsStore.renameEventType(previous, nextName)
  closeEdit()
}
</script>

<style scoped>
.page-body { padding-top: 6px; }

.input-card {
  display: flex;
  gap: 10px;
  margin: 0 16px 12px;
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.row-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  outline: none;
}

.row-input:focus { border-color: rgba(20, 20, 22, 0.16); }

.confirm-btn,
.save-btn {
  min-width: 72px;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  background: #141416;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.list-section { padding: 0 16px 120px; }

.section-caption {
  margin: 4px 4px 8px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.section-caption--custom { margin-top: 20px; }

.row-list {
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.row-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(142, 142, 147, 0.12);
}

.row-item--last { border-bottom: none; }

.type-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.type-exhibition { background: rgba(90, 120, 250, 0.14); color: #355be0; }
.type-concert { background: rgba(250, 149, 90, 0.14); color: #d26f20; }
.type-other { background: rgba(142, 142, 147, 0.14); color: #6a6e77; }
.type-custom { background: rgba(150, 100, 250, 0.14); color: #7c4dcc; }

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  appearance: none;
  -webkit-appearance: none;
  min-height: 40px;
  justify-content: center;
}

.row-main--static { cursor: default; }

.row-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

.row-meta {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.builtin-badge {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.tracks-toggle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
}

.tracks-toggle__label {
  font-size: 11px;
  font-weight: 600;
}

.tracks-toggle__knob {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: rgba(142, 142, 147, 0.28);
  transition: background 0.16s ease;
}

.tracks-toggle__knob::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.16s ease;
}

.tracks-toggle--on {
  color: #7c4dcc;
}

.tracks-toggle--on .tracks-toggle__knob {
  background: #7c4dcc;
}

.tracks-toggle--on .tracks-toggle__knob::after {
  transform: translateX(16px);
}

.row-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(199, 68, 68, 0.12);
  color: #c74444;
  flex-shrink: 0;
}

.row-delete svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.list-footer {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.count-hint,
.empty-hint {
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: center;
}

/* 外壳由 AppSheet 提供；内容区用 padding 补偿键盘高度 */
.edit-form {
  padding-bottom: var(--edit-sheet-keyboard-offset, 0px);
  transition: padding-bottom 0.18s ease;
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.edit-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
}

.edit-close {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(142, 142, 147, 0.15);
  color: var(--app-text-tertiary);
  font-size: 18px;
  line-height: 1;
}

.edit-caption {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.edit-error {
  margin-top: 8px;
  font-size: 13px;
  color: #d64545;
}

.save-btn {
  width: 100%;
  margin-top: 12px;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

:global(html.theme-dark) .confirm-btn,
  :global(html.theme-dark) .save-btn {
    background: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .row-input:focus {
    border-color: rgba(255, 255, 255, 0.15);
  }

:global(html.theme-dark) .type-exhibition {
    background: rgba(90, 120, 250, 0.2);
    color: #9db4ff;
  }

:global(html.theme-dark) .type-concert {
    background: rgba(250, 149, 90, 0.2);
    color: #f2a869;
  }

:global(html.theme-dark) .type-other {
    background: rgba(142, 142, 147, 0.2);
    color: #a7acb8;
  }

:global(html.theme-dark) .type-custom {
    background: rgba(150, 100, 250, 0.2);
    color: #c4a1ff;
  }

:global(html.theme-dark) .tracks-toggle__knob {
    background: rgba(142, 142, 147, 0.4);
  }

:global(html.theme-dark) .tracks-toggle--on {
    color: #c4a1ff;
  }

:global(html.theme-dark) .tracks-toggle--on .tracks-toggle__knob {
    background: #9b6fe0;
  }
</style>
