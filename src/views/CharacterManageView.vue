<template>
  <div class="page sub-page">
    <NavBar title="角色名管理" show-back>
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
      <!-- 新增面板 -->
      <Transition name="panel-fade">
        <div v-if="showInput" class="input-card">
          <input
            ref="inputRef"
            v-model="newName"
            class="row-input"
            type="text"
            placeholder="输入角色名称…"
            maxlength="30"
            @keyup.enter="doAdd"
          />
          <!-- IP 归属选择器 -->
          <div class="ip-select-row">
            <span class="ip-select-label">归属 IP</span>
            <div class="ip-select-chips">
              <button
                type="button"
                :class="['ip-chip', { 'ip-chip--active': newIp === '' }]"
                @click="newIp = ''"
              >不设置</button>
              <button
                v-for="ip in presets.ips"
                :key="ip"
                type="button"
                :class="['ip-chip', { 'ip-chip--active': newIp === ip }]"
                @click="newIp = ip"
              >{{ ip }}</button>
            </div>
          </div>
          <button class="confirm-btn" type="button" @click="doAdd">保存</button>
        </div>
      </Transition>

      <!-- 搜索栏 -->
      <div class="search-wrap">
        <div class="search-bar">
          <svg viewBox="0 0 24 24" fill="none" class="s-icon">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20L16.65 16.65" />
          </svg>
          <input
            v-model="searchKey"
            class="s-input"
            type="search"
            placeholder="搜索角色名…"
          />
          <button v-if="searchKey" class="s-clear" type="button" @click="searchKey = ''">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18" /><path d="M6 6L18 18" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 按 IP 筛选 -->
      <div v-if="presets.ips.length" class="ip-filter-wrap">
        <div class="ip-filter-chips">
          <button
            v-for="ip in presets.ips"
            :key="ip"
            type="button"
            :class="['ip-chip', { 'ip-chip--active': selectedIp === ip }]"
            @click="selectedIp = selectedIp === ip ? '' : ip"
          >{{ ip }}</button>
        </div>
      </div>

      <!-- 列表 -->
      <section class="list-section">
        <template v-if="filteredChars.length > 0">
          <div class="row-list">
            <div
              v-for="(item, idx) in filteredChars"
              :key="item.name"
              class="row-item"
              :class="{ 'row-item--last': idx === filteredChars.length - 1 }"
            >
              <div class="row-info" @click="toggleEditIp(item.name)">
                <span class="row-label">{{ item.name }}</span>
                <span v-if="item.ip" class="row-ip-badge">{{ item.ip }}</span>
                <span v-else class="row-ip-badge row-ip-badge--empty">未分类</span>
              </div>
              <button class="row-delete" type="button" @click="presets.removeCharacter(item.name)">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18" /><path d="M6 6L18 18" />
                </svg>
              </button>
            </div>
          </div>
          <p class="count-hint">共 {{ presets.characters.length }} 个角色 · 点击行可修改归属 IP</p>
        </template>

        <p v-else-if="(searchKey || selectedIp) && presets.characters.length > 0" class="empty-hint">
          无匹配角色
        </p>
        <p v-else class="empty-hint">暂无角色，点击右上角「+」新建</p>
      </section>

      <!-- 修改 IP 浮层 -->
      <Transition name="panel-fade">
        <div v-if="editingChar" class="edit-ip-sheet">
          <div class="edit-ip-header">
            <span class="edit-ip-title">「{{ editingChar }}」的归属 IP</span>
            <button type="button" class="edit-ip-close" @click="editingChar = ''">✕</button>
          </div>
          <div class="ip-select-chips">
            <button
              type="button"
              :class="['ip-chip', { 'ip-chip--active': getCharIp(editingChar) === '' }]"
              @click="setCharIp(editingChar, '')"
            >不设置</button>
            <button
              v-for="ip in presets.ips"
              :key="ip"
              type="button"
              :class="['ip-chip', { 'ip-chip--active': getCharIp(editingChar) === ip }]"
              @click="setCharIp(editingChar, ip)"
            >{{ ip }}</button>
          </div>
        </div>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import NavBar from '@/components/NavBar.vue'

const presets = usePresetsStore()

const showInput = ref(false)
const newName = ref('')
const newIp = ref('')
const inputRef = ref(null)
const searchKey = ref('')
const selectedIp = ref('')

const filteredChars = computed(() => {
  // 兼容旧格式（string）和新格式（{name, ip}）
  let list = presets.characters.map(c => (typeof c === 'string' ? { name: c, ip: '' } : c))
  if (searchKey.value.trim()) {
    const kw = searchKey.value.trim().toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(kw))
  }
  if (selectedIp.value) {
    list = list.filter(c => c.ip === selectedIp.value)
  }
  return list
})

async function toggleInput() {
  showInput.value = !showInput.value
  if (showInput.value) {
    await nextTick()
    inputRef.value?.focus()
  }
}

function doAdd() {
  if (presets.addCharacter(newName.value, newIp.value)) {
    newName.value = ''
    newIp.value = ''
    showInput.value = false
  }
}

// 编辑已有角色的 IP
const editingChar = ref('')

function toggleEditIp(name) {
  editingChar.value = editingChar.value === name ? '' : name
}

function getCharIp(name) {
  const c = presets.characters.find(c => (typeof c === 'string' ? c : c.name) === name)
  return c ? (typeof c === 'string' ? '' : c.ip) : ''
}

function setCharIp(name, ip) {
  presets.updateCharacterIp(name, ip)
  editingChar.value = ''
}
</script>

<style scoped>
.page-body { padding-top: 6px; }

/* ---- 新增面板 ---- */
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
  box-sizing: border-box;
}

.row-input:focus {
  outline: none;
  border-color: var(--app-accent, #007aff);
}

.ip-select-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ip-select-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
}

.ip-select-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.confirm-btn {
  height: 40px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-text);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

/* ---- 动画 ---- */
.panel-fade-enter-active,
.panel-fade-leave-active { transition: all 0.2s ease; }
.panel-fade-enter-from,
.panel-fade-leave-to { opacity: 0; transform: translateY(-8px); }

/* ---- 搜索 ---- */
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

.s-input::placeholder { color: var(--app-text-tertiary); }

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

/* ---- IP 筛选芯片 ---- */
.ip-filter-wrap {
  padding: 0 var(--page-padding) 10px;
  overflow: hidden;
}

.ip-filter-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
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
  transition: all 0.16s ease;
  white-space: nowrap;
}

.ip-chip--active {
  border-color: var(--app-text);
  background: var(--app-text);
  color: #fff;
}

/* ---- 列表 ---- */
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
  padding: 12px 16px;
  border-bottom: 1px solid rgba(142, 142, 147, 0.12);
  gap: 10px;
}

.row-item--last { border-bottom: none; }

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-label {
  font-size: 15px;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 59, 48, 0.1);
  border: none;
  border-radius: 8px;
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

/* ---- 编辑 IP 浮层 ---- */
.edit-ip-sheet {
  position: fixed;
  left: 50%;
  bottom: max(100px, calc(env(safe-area-inset-bottom) + 90px));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
  padding: 16px;
  z-index: 50;
}

.edit-ip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.edit-ip-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.edit-ip-close {
  width: 26px;
  height: 26px;
  border: none;
  background: rgba(142, 142, 147, 0.15);
  border-radius: 50%;
  font-size: 12px;
  color: var(--app-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
