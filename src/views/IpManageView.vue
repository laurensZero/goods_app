<template>
  <div class="page page--transition sub-page" :class="{ 'page--leaving': isPageLeaving }">
    <NavBar title="IP 管理" show-back>
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
            placeholder="输入 IP 名称"
            maxlength="40"
            @input="syncName"
            @blur="syncName"
            @change="syncName"
            @compositionend="syncName"
            @paste="syncNameLater"
            @keyup.enter="doAdd"
          />
          <button class="confirm-btn" type="button" @pointerdown="flushActiveInput" @click="doAdd">保存</button>
        </div>
      </Transition>

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
            placeholder="搜索 IP 名称"
          />
          <button v-if="searchKey" class="s-clear" type="button" @click="searchKey = ''">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
            </svg>
          </button>
        </div>
      </div>

      <section class="list-section">
        <template v-if="filteredIps.length > 0">
          <div class="row-list">
            <div
              v-for="(item, idx) in filteredIps"
              :key="item"
              class="row-item"
              :class="{ 'row-item--last': idx === filteredIps.length - 1 }"
            >
              <span class="row-label">{{ item }}</span>
              <button class="row-delete" type="button" @click="removeIp(item)">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18" />
                  <path d="M6 6L18 18" />
                </svg>
              </button>
            </div>
          </div>
          <p class="count-hint">共 {{ presets.ips.length }} 个 IP</p>
        </template>

        <p v-else-if="searchKey && presets.ips.length > 0" class="empty-hint">
          没有匹配 “{{ searchKey }}” 的 IP
        </p>
        <p v-else class="empty-hint">暂无 IP，点击右上角新建</p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import NavBar from '@/components/NavBar.vue'

const presets = usePresetsStore()
const { isPageLeaving } = usePageLeaveAnimation()

const showInput = ref(false)
const newName = ref('')
const inputRef = ref(null)
const searchKey = ref('')

const filteredIps = computed(() => {
  if (!searchKey.value.trim()) return presets.ips
  const keyword = searchKey.value.trim().toLowerCase()
  return presets.ips.filter((ip) => ip.toLowerCase().includes(keyword))
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
  if (await presets.addIp(newName.value)) {
    newName.value = ''
    showInput.value = false
  }
}

async function removeIp(name) {
  await presets.removeIp(name)
}

function syncName(event) {
  newName.value = event.target.value ?? ''
}

function syncNameLater() {
  requestAnimationFrame(() => {
    syncDomField()
  })
}

function syncDomField() {
  if (inputRef.value) {
    newName.value = inputRef.value.value ?? ''
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
  transition: transform 0.16s;
}

.confirm-btn:active { transform: scale(0.96); }

.search-wrap {
  padding: 0 16px;
  margin-bottom: 12px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  background: rgba(142, 142, 147, 0.12);
  border-radius: 12px;
}

.s-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.s-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  outline: none;
}

.s-input::placeholder { color: var(--app-text-tertiary); }
.s-input::-webkit-search-cancel-button { display: none; }

.s-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: #aeaeb2;
  border-radius: 50%;
  flex-shrink: 0;
  transition: transform 0.12s;
}

.s-clear:active { transform: scale(var(--press-scale-button)); }

.s-clear svg {
  width: 10px;
  height: 10px;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-linecap: round;
}

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

.count-hint,
.empty-hint {
  margin-top: 12px;
  font-size: 13px;
  color: var(--app-text-tertiary);
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
