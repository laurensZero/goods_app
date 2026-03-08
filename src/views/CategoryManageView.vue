<template>
  <div class="page page--transition sub-page" :class="{ 'page--leaving': isPageLeaving }">
    <NavBar title="分类管理" show-back>
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
            placeholder="输入分类名称"
            maxlength="20"
            @keyup.enter="doAdd"
          />
          <button class="confirm-btn" type="button" @click="doAdd">保存</button>
        </div>
      </Transition>

      <section class="list-section">
        <div v-if="presets.categories.length > 0" class="row-list">
          <div
            v-for="(item, idx) in presets.categories"
            :key="item"
            class="row-item"
            :class="{ 'row-item--last': idx === presets.categories.length - 1 }"
          >
            <span class="row-label">{{ item }}</span>
            <button class="row-delete" type="button" @click="removeCategory(item)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18" />
                <path d="M6 6L18 18" />
              </svg>
            </button>
          </div>
        </div>

        <div class="list-footer">
          <button
            v-if="presets.categories.length === 0"
            class="restore-btn"
            type="button"
            @click="restoreDefaults"
          >
            恢复默认分类
          </button>
          <p v-if="presets.categories.length === 0" class="empty-hint">
            暂无分类，点击右上角新建，或恢复默认分类
          </p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import { commitActiveInput } from '@/utils/commitActiveInput'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import NavBar from '@/components/NavBar.vue'

const presets = usePresetsStore()
const { isPageLeaving } = usePageLeaveAnimation()

const showInput = ref(false)
const newName = ref('')
const inputRef = ref(null)

const DEFAULT_LIST = ['手办', '挂件', '立牌', '徽章', '卡片', '色纸', 'CD/专辑', '周边服饰', '其他']

async function toggleInput() {
  showInput.value = !showInput.value
  if (showInput.value) {
    await nextTick()
    inputRef.value?.focus()
  }
}

async function doAdd() {
  await commitActiveInput()
  if (await presets.addCategory(newName.value)) {
    newName.value = ''
    showInput.value = false
  }
}

async function removeCategory(name) {
  await presets.removeCategory(name)
}

async function restoreDefaults() {
  for (const category of DEFAULT_LIST) {
    await presets.addCategory(category)
  }
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
  background: #fff;
  box-shadow: var(--app-shadow);
}

.row-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: #f4f4f6;
  color: var(--app-text);
  font-size: 15px;
  outline: none;
  transition: border-color 0.16s;
}

.row-input:focus { border-color: rgba(20, 20, 22, 0.16); }
.row-input::placeholder { color: var(--app-placeholder); }

.confirm-btn {
  min-width: 64px;
  height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 14px;
  background: #141416;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.16s, opacity 0.16s;
}

.confirm-btn:active { transform: scale(0.96); }

.list-section { padding: 0 16px; }

.row-list {
  background: #fff;
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.row-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #f2f2f7;
}

.row-item--last { border-bottom: none; }

.row-label {
  flex: 1;
  font-size: 15px;
  color: var(--app-text);
}

.row-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: #f5eaea;
  color: #c04444;
  flex-shrink: 0;
  transition: transform 0.14s;
}

.row-delete:active { transform: scale(var(--press-scale-button)); }

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

.restore-btn {
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--app-shadow);
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.14s;
}

.restore-btn:active { transform: scale(0.96); }

.empty-hint {
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: center;
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
</style>
