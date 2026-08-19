<template>
  <div class="import-character-picker">
    <div class="import-character-picker__head">
      <button type="button" class="import-character-picker__quick-add" @click="toggleQuickCreate">
        {{ t('goods.batch.quickAdd') }}
      </button>
    </div>

    <div class="import-character-picker__select" :class="{ 'import-character-picker__select--open': open }">
      <button type="button" class="import-character-picker__trigger" @click="open = !open">
        <div class="import-character-picker__content">
          <span v-if="modelValue.length === 0" class="import-character-picker__placeholder">{{ t('import.characterPlaceholder') }}</span>
          <div v-else class="import-character-picker__chips">
            <span v-for="character in modelValue" :key="character" class="import-character-picker__chip">
              {{ character }}
              <button type="button" class="import-character-picker__remove" :aria-label="t('common.aria.removeCharacter')" @click.stop="removeCharacter(character)">×</button>
            </span>
          </div>
        </div>
        <svg class="import-character-picker__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 10L12 15L17 10" />
        </svg>
      </button>

      <div v-if="open" class="import-character-picker__panel">
        <button
          v-for="character in availableCharacters"
          :key="character.name"
          type="button"
          class="import-character-picker__option"
          :class="{ 'import-character-picker__option--active': modelValue.includes(character.name) }"
          @click="toggleCharacter(character.name)"
        >
          <span>{{ character.name }}</span>
          <span v-if="modelValue.includes(character.name)" class="import-character-picker__check">✓</span>
        </button>
        <div v-if="availableCharacters.length === 0" class="import-character-picker__empty">{{ t('goods.batch.noCharactersAvailable') }}</div>
      </div>
    </div>

    <QuickPresetCreator
      v-if="showQuickCreate"
      :show="showQuickCreate"
      v-model="quickCharacterName"
      :placeholder="t('goods.batch.inputCharacterName')"
      :maxlength="30"
      :submit-text="t('goods.batch.newCharacter')"
      :secondary-value="quickCharacterIp"
      :secondary-options="quickCharacterIpOptions"
      :secondary-label="ip ? t('goods.batch.currentIpLabel') : t('goods.batch.selectCharacterIp')"
      :secondary-placeholder="t('goods.batch.noIp')"
      @update:secondary-value="quickCharacterIp = $event"
      @cancel="closeQuickCreate"
      @submit="submitQuickCharacter"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'
import { usePresetsStore } from '@/stores/presets'
import { normalizeCharacterName } from '@/stores/presets'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  ip: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const presets = usePresetsStore()
const open = ref(false)
const showQuickCreate = ref(false)
const quickCharacterName = ref('')
const NO_IP_OPTION = '__NO_IP__'
const quickCharacterIp = ref(props.ip || NO_IP_OPTION)

const availableCharacters = computed(() => presets.characters
  .filter((character) => !props.ip || character.ip === props.ip)
  .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')))

const quickCharacterIpOptions = computed(() => {
  if (props.ip) return [{ label: props.ip, value: props.ip }]
  return [
    { label: t('goods.batch.noIp'), value: NO_IP_OPTION },
    ...presets.ips.map((ip) => ({ label: ip, value: ip }))
  ]
})

function toggleCharacter(name) {
  const next = props.modelValue.includes(name)
    ? props.modelValue.filter((character) => character !== name)
    : [...props.modelValue, name]
  emit('update:modelValue', next)
}

function removeCharacter(name) {
  emit('update:modelValue', props.modelValue.filter((character) => character !== name))
}

function toggleQuickCreate() {
  showQuickCreate.value = !showQuickCreate.value
  if (showQuickCreate.value) {
    quickCharacterName.value = ''
    quickCharacterIp.value = props.ip || NO_IP_OPTION
  }
}

function closeQuickCreate() {
  showQuickCreate.value = false
  quickCharacterName.value = ''
  quickCharacterIp.value = props.ip || NO_IP_OPTION
}

async function submitQuickCharacter() {
  const name = normalizeCharacterName(quickCharacterName.value)
  if (!name) return

  const targetIp = props.ip || (quickCharacterIp.value === NO_IP_OPTION ? '' : quickCharacterIp.value)
  await presets.addCharacter(name, targetIp)
  if (!props.modelValue.includes(name)) {
    emit('update:modelValue', [...props.modelValue, name])
  }
  closeQuickCreate()
}

watch(() => props.ip, (ip) => {
  quickCharacterIp.value = ip || NO_IP_OPTION
})
</script>

<style scoped>
.import-character-picker { position: relative; display: grid; gap: 8px; }
.import-character-picker__head { display: flex; justify-content: flex-end; }
.import-character-picker__quick-add { border: 0; padding: 2px 0; background: transparent; color: var(--app-text-secondary); font-size: 12px; cursor: pointer; }
.import-character-picker__select { position: relative; }
.import-character-picker__trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 48px; padding: 6px 14px; border: 1px solid rgba(20, 20, 22, 0.08); border-radius: 16px; background: var(--app-surface); color: var(--app-text); text-align: left; }
.import-character-picker__content { min-width: 0; flex: 1; }
.import-character-picker__placeholder { color: var(--app-placeholder); font-size: 16px; }
.import-character-picker__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.import-character-picker__chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px 5px 10px; border: 1px solid var(--app-border, rgba(120, 120, 128, 0.2)); border-radius: 8px; font-size: 0.85rem; }
.import-character-picker__remove { border: 0; padding: 0; background: transparent; color: var(--app-text-secondary, #888); font-size: 1rem; line-height: 1; cursor: pointer; }
.import-character-picker__arrow { width: 18px; height: 18px; margin-left: 10px; flex-shrink: 0; stroke: var(--app-text-tertiary); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.18s ease; }
.import-character-picker__select--open .import-character-picker__arrow { transform: rotate(180deg); }
.import-character-picker__panel { position: absolute; top: calc(100% + 8px); left: 0; z-index: 50; width: 100%; max-height: 240px; overflow-y: auto; padding: 8px; border: 1px solid rgba(20, 20, 22, 0.05); border-radius: 18px; background: var(--app-surface); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06); }
.import-character-picker__option { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; padding: 0 12px; border: none; border-radius: 12px; background: transparent; color: var(--app-text); text-align: left; }
.import-character-picker__option--active { background: rgba(20, 20, 22, 0.06); font-weight: 600; }
.import-character-picker__check { font-weight: 700; }
.import-character-picker__empty { padding: 14px 12px; color: var(--app-text-tertiary); font-size: 14px; text-align: center; }
</style>
