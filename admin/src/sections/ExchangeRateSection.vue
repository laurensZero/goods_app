<script setup>
import { onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { formatTime } from '../utils/format'

const loading = ref(false)
const saving = ref(false)
const source = ref('')
const updatedAt = ref('')
const entries = ref([])
const status = ref({ text: '', type: 'default' })

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

async function load() {
  loading.value = true
  try {
    const data = await supabaseRequest('/rest/v1/exchange_rates', {
      params: { select: 'rates,source,updated_at', id: 'eq.1' }
    })
    const row = Array.isArray(data) ? data[0] : data
    const rates = row?.rates || {}
    source.value = row?.source || '--'
    updatedAt.value = row?.updated_at || ''
    entries.value = Object.entries(rates)
      .map(([code, rate]) => ({ code, rate: Number(rate) || 0 }))
      .sort((a, b) => (a.code === 'CNY' ? -1 : b.code === 'CNY' ? 1 : a.code.localeCompare(b.code)))
    setStatus('已加载。', 'ok')
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

function addRow() {
  entries.value.push({ code: '', rate: 0 })
}

function removeRow(index) {
  entries.value.splice(index, 1)
}

async function save() {
  const rates = {}
  const seen = new Set()
  for (const e of entries.value) {
    const code = String(e.code || '').trim().toUpperCase()
    const rate = Number(e.rate)
    if (!code) continue
    if (seen.has(code)) {
      setStatus(`币种 "${code}" 重复，请检查。`, 'error')
      return
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setStatus(`币种 "${code}" 的汇率需为大于 0 的数字。`, 'error')
      return
    }
    seen.add(code)
    rates[code] = rate
  }
  if (!rates.CNY) rates.CNY = 1
  saving.value = true
  try {
    await supabaseRequest('/rest/v1/exchange_rates?id=eq.1', {
      method: 'PATCH',
      body: { rates, source: 'manual', updated_at: new Date().toISOString() }
    })
    setStatus('已覆盖汇率快照。', 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '保存失败。', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <p class="status-text">
    汇率权威快照（1 外币 = ? CNY）。所有设备统一从 <code>exchange_rates</code> 读取同一份汇率。
    手动覆盖后 <code>updated_at</code> 会刷新以立即生效，但 Edge Function <code>refresh-exchange-rates</code>
    定时任务会按计划再次刷新覆盖。
  </p>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">Exchange Rates</p>
        <h3 class="card-title">汇率快照</h3>
      </div>
      <div class="state-row">
        <span class="state">来源：{{ source }}</span>
        <span class="state">更新：{{ formatTime(updatedAt) }}</span>
      </div>
    </div>

    <div v-if="loading" class="status-text">加载中…</div>
    <template v-else>
      <div class="rate-list">
        <div v-for="(e, idx) in entries" :key="idx" class="rate-row">
          <input v-model="e.code" class="input rate-code" type="text" placeholder="币种" list="currency-options">
          <input v-model.number="e.rate" class="input rate-value" type="number" step="0.0001" min="0" placeholder="汇率">
          <button class="btn btn--sm btn--danger" type="button" @click="removeRow(idx)">删</button>
        </div>
      </div>
      <datalist id="currency-options">
        <option value="CNY" />
        <option value="USD" />
        <option value="JPY" />
        <option value="EUR" />
        <option value="GBP" />
        <option value="HKD" />
        <option value="TWD" />
        <option value="KRW" />
      </datalist>

      <div class="actions">
        <button class="btn btn--soft" type="button" @click="addRow">+ 添加币种</button>
        <button class="btn btn--primary" type="button" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存覆盖' }}
        </button>
      </div>
    </template>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>
</template>

<style scoped>
.card--inner {
  gap: 12px;
}

.state-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.rate-list {
  display: grid;
  gap: 8px;
}

.rate-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}

.rate-code {
  text-transform: uppercase;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
