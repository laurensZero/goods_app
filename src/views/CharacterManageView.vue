<template>
  <div class="page sub-page">
    <NavBar title="角色管理" show-back>
      <template #right>
        <button class="add-btn" type="button" @click="toggleInput">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19" />
            <path d="M5 12H19" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main class="page-body">
      <Transition name="panel-fade">
        <div v-if="showInput" class="input-card">
          <input
            ref="inputRef"
            v-model="newName"
            class="row-input"
            type="text"
            maxlength="30"
            placeholder="输入角色名称"
            @input="syncName"
            @blur="syncName"
            @change="syncName"
            @compositionend="syncName"
            @paste="syncNameLater"
            @keyup.enter="doAdd"
          />

          <div class="ip-select-row">
            <span class="ip-select-label">归属 IP</span>
            <div class="ip-select-chips">
              <button
                type="button"
                :class="['ip-chip', { 'ip-chip--active': newIp === '' }]"
                @click="newIp = ''"
              >
                未设置
              </button>
              <button
                v-for="ip in presets.ips"
                :key="ip"
                type="button"
                :class="['ip-chip', { 'ip-chip--active': newIp === ip }]"
                @click="newIp = ip"
              >
                {{ ip }}
              </button>
            </div>
          </div>

          <button class="confirm-btn" type="button" @pointerdown="flushActiveInput" @click="doAdd">
            保存
          </button>
        </div>
      </Transition>

      <div class="search-wrap">
        <div class="search-bar">
          <svg viewBox="0 0 24 24" fill="none" class="s-icon" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20L16.65 16.65" />
          </svg>
          <input
            v-model="searchKey"
            class="s-input"
            type="search"
            placeholder="搜索角色名称"
          />
          <button v-if="searchKey" class="s-clear" type="button" @click="searchKey = ''">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="presets.ips.length" class="ip-filter-wrap">
        <div class="ip-filter-chips">
          <button
            type="button"
            :class="['ip-chip', { 'ip-chip--active': selectedIp === EMPTY_IP_FILTER }]"
            @click="selectedIp = selectedIp === EMPTY_IP_FILTER ? '' : EMPTY_IP_FILTER"
          >
            未设置
          </button>
          <button
            v-for="ip in presets.ips"
            :key="ip"
            type="button"
            :class="['ip-chip', { 'ip-chip--active': selectedIp === ip }]"
            @click="selectedIp = selectedIp === ip ? '' : ip"
          >
            {{ ip }}
          </button>
        </div>
      </div>

      <section class="list-section">
        <template v-if="filteredCharacters.length > 0">
          <div class="row-list">
            <div
              v-for="(item, idx) in filteredCharacters"
              :key="item.name"
              class="row-item"
              :class="{ 'row-item--last': idx === filteredCharacters.length - 1 }"
            >
              <button class="row-main" type="button" @click="openEdit(item)">
                <span class="row-label">{{ item.name }}</span>
                <div class="row-meta-line">
                  <span class="row-ip-badge" :class="{ 'row-ip-badge--empty': !item.ip }">
                    {{ item.ip || '未设置 IP' }}
                  </span>
                  <span class="row-meta">{{ getGoodsCount(item.name) }} 件收藏</span>
                </div>
              </button>

              <button class="row-delete" type="button" aria-label="删除角色" @click="removeCharacter(item.name)">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18" />
                  <path d="M6 6L18 18" />
                </svg>
              </button>
            </div>
          </div>
          <p class="count-hint">共 {{ presets.characters.length }} 个角色，点按条目可修改名称和 IP</p>
        </template>

        <p v-else-if="(searchKey || selectedIp) && presets.characters.length > 0" class="empty-hint">
          没有匹配的角色
        </p>
        <p v-else class="empty-hint">还没有角色，点击右上角新建</p>
      </section>
    </main>

    <Teleport to="body">
      <Transition name="sheet-backdrop">
        <div v-if="editingCharacter" class="edit-backdrop" @click="closeEdit" />
      </Transition>
      <Transition name="sheet-slide">
        <div v-if="editingCharacter" class="edit-sheet" :style="editSheetStyle">
          <div class="edit-header">
            <span class="edit-title">编辑角色</span>
            <button type="button" class="edit-close" @click="closeEdit">×</button>
          </div>

          <p class="edit-caption">当前：{{ editingCharacter }}</p>

          <input
            ref="editInputRef"
            v-model="editName"
            class="row-input"
            type="text"
            maxlength="30"
            placeholder="输入新的角色名称"
            @focus="handleEditInputFocus"
            @keyup.enter="saveEdit"
          />

          <div class="edit-group">
            <span class="edit-label">归属 IP</span>
            <div class="ip-select-chips">
              <button
                type="button"
                :class="['ip-chip', { 'ip-chip--active': editIp === '' }]"
                @click="editIp = ''"
              >
                未设置
              </button>
              <button
                v-for="ip in presets.ips"
                :key="ip"
                type="button"
                :class="['ip-chip', { 'ip-chip--active': editIp === ip }]"
                @click="editIp = ip"
              >
                {{ ip }}
              </button>
            </div>
          </div>

          <p v-if="editError" class="edit-error">{{ editError }}</p>

          <button class="save-btn" type="button" @click="saveEdit">保存修改</button>
        </div>
      </Transition>
    </Teleport>
  </div>

  <PresetDeleteConfirm
    :show="showDeleteConfirm"
    :name="pendingDeleteName"
    :count="affectedCount"
    field-label="该角色"
    @cancel="showDeleteConfirm = false"
    @confirm="confirmDelete"
  />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizeCharacterName, usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { usePresetDelete } from '@/composables/usePresetDelete'
import NavBar from '@/components/NavBar.vue'
import PresetDeleteConfirm from '@/components/PresetDeleteConfirm.vue'

const EMPTY_IP_FILTER = '__empty__'

const presets = usePresetsStore()
const store = useGoodsStore()

const { showDeleteConfirm, pendingDeleteName, affectedCount, tryRemove: removeCharacter, confirmDelete } = usePresetDelete({
  getAffected: (list, name) => list.filter((item) => item.characters?.includes(name)),
  patch: (item, name) => ({ ...item, characters: item.characters.filter((character) => character !== name) }),
  removePreset: (name) => presets.removeCharacter(name)
})

const showInput = ref(false)
const newName = ref('')
const newIp = ref('')
const inputRef = ref(null)
const searchKey = ref('')
const selectedIp = ref('')
const editingCharacter = ref('')
const originalCharacterIp = ref('')
const editName = ref('')
const editIp = ref('')
const editError = ref('')
const editInputRef = ref(null)
const keyboardInset = ref(0)

const editSheetStyle = computed(() => ({
  '--edit-sheet-keyboard-offset': `${keyboardInset.value}px`
}))

const filteredCharacters = computed(() => {
  let list = presets.characters.map((character) => ({
    name: character.name,
    ip: character.ip
  }))

  if (searchKey.value.trim()) {
    const keyword = searchKey.value.trim().toLowerCase()
    list = list.filter((character) => character.name.toLowerCase().includes(keyword))
  }

  if (selectedIp.value === EMPTY_IP_FILTER) {
    list = list.filter((character) => !character.ip)
  } else if (selectedIp.value) {
    list = list.filter((character) => character.ip === selectedIp.value)
  }

  return list
})

const goodsCountMap = computed(() => {
  const map = new Map()
  for (const item of store.list) {
    for (const character of item.characters || []) {
      map.set(character, (map.get(character) || 0) + 1)
    }
  }
  return map
})

function getGoodsCount(name) {
  return goodsCountMap.value.get(name) || 0
}

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
  if (await presets.addCharacter(newName.value, newIp.value)) {
    newName.value = ''
    newIp.value = ''
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

function openEdit(character) {
  editingCharacter.value = character.name
  originalCharacterIp.value = character.ip || ''
  editName.value = character.name
  editIp.value = character.ip || ''
  editError.value = ''
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function closeEdit() {
  editingCharacter.value = ''
  originalCharacterIp.value = ''
  editName.value = ''
  editIp.value = ''
  editError.value = ''
}

async function saveEdit() {
  const previousName = editingCharacter.value
  const previousIp = originalCharacterIp.value
  const nextName = normalizeCharacterName(editName.value)
  const nextIp = String(editIp.value || '').trim()

  if (!nextName) {
    editError.value = '请输入角色名称'
    return
  }

  let currentName = previousName

  if (nextName !== previousName) {
    const renamed = await presets.updateCharacterName(previousName, nextName)
    if (!renamed) {
      editError.value = '角色名称已存在'
      return
    }

    await store.replaceCharacterName(previousName, nextName)
    currentName = nextName
  }

  if (nextIp !== previousIp) {
    await presets.updateCharacterIp(currentName, nextIp)
    await store.syncCharacterIp(currentName, nextIp, previousIp)
  }

  closeEdit()
}

function updateKeyboardInset() {
  if (!editingCharacter.value) {
    keyboardInset.value = 0
    return
  }

  const viewport = window.visualViewport
  if (!viewport) {
    keyboardInset.value = 0
    return
  }

  keyboardInset.value = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
}

function ensureEditInputVisible() {
  if (!editingCharacter.value) return
  editInputRef.value?.scrollIntoView?.({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth'
  })
}

function handleEditInputFocus() {
  window.setTimeout(() => {
    updateKeyboardInset()
    ensureEditInputVisible()
  }, 80)
  window.setTimeout(ensureEditInputVisible, 220)
}

onMounted(() => {
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
})

watch(editingCharacter, async (value) => {
  if (!value) {
    keyboardInset.value = 0
    return
  }

  await nextTick()
  updateKeyboardInset()
  window.setTimeout(ensureEditInputVisible, 120)
})
</script>

<style scoped>
.page-body { padding-top: 6px; }

.input-card {
  margin: 0 var(--page-padding) 12px;
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
  overflow: hidden;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row-input {
  height: 40px;
  padding: 0 12px;
  border: 1.5px solid rgba(142, 142, 147, 0.2);
  border-radius: var(--radius-small);
  background: var(--app-bg);
  font-size: 15px;
  color: var(--app-text);
  width: 100%;
  outline: none;
}

.row-input:focus { border-color: rgba(20, 20, 22, 0.2); }

.ip-select-row,
.edit-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ip-select-label,
.edit-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
}

.ip-select-chips,
.ip-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.confirm-btn,
.save-btn {
  height: 40px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-text);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.search-wrap {
  padding: 4px var(--page-padding) 8px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(142, 142, 147, 0.12);
  border-radius: 12px;
}

.s-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
}

.s-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--app-text);
  outline: none;
}

.s-input::-webkit-search-cancel-button { display: none; }

.s-clear {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(142, 142, 147, 0.3);
  border: none;
  border-radius: 50%;
  padding: 0;
}

.s-clear svg {
  width: 10px;
  height: 10px;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.ip-filter-wrap {
  padding: 0 var(--page-padding) 10px;
  overflow: hidden;
}

.ip-filter-chips {
  overflow-x: auto;
  flex-wrap: nowrap;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}

.ip-filter-chips::-webkit-scrollbar { display: none; }

.ip-chip {
  flex-shrink: 0;
  scroll-snap-align: start;
  padding: 4px 12px;
  border: 1.5px solid rgba(142, 142, 147, 0.25);
  border-radius: 20px;
  background: transparent;
  font-size: 13px;
  color: var(--app-text-tertiary);
  white-space: nowrap;
}

.ip-chip--active {
  border-color: var(--app-text);
  background: var(--app-text);
  color: #fff;
}

.list-section { padding: 0 var(--page-padding) 120px; }

.row-list {
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.row-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(142, 142, 147, 0.12);
}

.row-item--last { border-bottom: none; }

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  appearance: none;
  -webkit-appearance: none;
}

.row-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.row-meta {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.row-ip-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(90, 120, 250, 0.1);
  color: #5a78fa;
  font-size: 11px;
  font-weight: 500;
}

.row-ip-badge--empty {
  background: rgba(142, 142, 147, 0.1);
  color: var(--app-text-tertiary);
}

.row-delete {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 59, 48, 0.1);
  border: none;
  border-radius: 50%;
}

.row-delete svg {
  width: 14px;
  height: 14px;
  stroke: #ff3b30;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.count-hint {
  font-size: 12px;
  color: var(--app-text-tertiary);
  text-align: center;
  margin: 10px 0 0;
}

.empty-hint {
  font-size: 14px;
  color: var(--app-text-tertiary);
  text-align: center;
  padding: 40px 0 0;
}

.edit-backdrop {
  position: fixed;
  inset: 0;
  z-index: 59;
  background: rgba(20, 20, 22, 0.12);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.edit-sheet {
  position: fixed;
  left: 50%;
  bottom: calc(max(env(safe-area-inset-bottom), 16px) + 16px + var(--edit-sheet-keyboard-offset, 0px));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  max-height: calc(100dvh - var(--edit-sheet-keyboard-offset, 0px) - 32px);
  background: rgba(255, 255, 255, 0.92);
  border-radius: var(--radius-card);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
  padding: 18px 16px 16px;
  z-index: 60;
  overflow-y: auto;
  overscroll-behavior: contain;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
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
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.edit-error {
  margin-top: 10px;
  font-size: 13px;
  color: #d64545;
}

.save-btn {
  width: 100%;
  margin-top: 16px;
}

.edit-group {
  margin-top: 14px;
}

.edit-label {
  margin-bottom: 2px;
}

.edit-group .ip-select-chips {
  gap: 8px;
}

.edit-group .ip-chip {
  padding: 6px 14px;
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

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
  transition: opacity 180ms ease;
}

.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(28px);
}

:global(html.theme-dark) .edit-sheet {
    background: rgba(28, 28, 30, 0.95);
  }

:global(html.theme-dark) .confirm-btn,
  :global(html.theme-dark) .save-btn {
    color: #141416;
  }

:global(html.theme-dark) .ip-chip--active {
    background: #f5f5f7;
    border-color: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .row-input:focus {
    border-color: rgba(255, 255, 255, 0.15);
  }
</style>
