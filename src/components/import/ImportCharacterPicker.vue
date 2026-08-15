<template>
  <div class="import-character-picker">
    <div v-if="modelValue.length" class="import-character-picker__chips">
      <span v-for="character in modelValue" :key="character" class="import-character-picker__chip">
        {{ character }}
        <button type="button" class="import-character-picker__remove" :aria-label="t('common.aria.removeCharacter')" @click="removeCharacter(character)">×</button>
      </span>
    </div>
    <AppSelect :model-value="''" :options="availableOptions" :placeholder="t('import.characterPlaceholder')" @update:model-value="addCharacter" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSelect from '@/components/common/AppSelect.vue'
import { usePresetsStore } from '@/stores/presets'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  ip: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const presets = usePresetsStore()

const availableOptions = computed(() => presets.characters
  .filter((character) => !props.ip || character.ip === props.ip)
  .filter((character) => !props.modelValue.includes(character.name))
  .map((character) => ({ label: character.name, value: character.name })))

function addCharacter(name) {
  if (!name || props.modelValue.includes(name)) return
  emit('update:modelValue', [...props.modelValue, name])
}

function removeCharacter(name) {
  emit('update:modelValue', props.modelValue.filter((character) => character !== name))
}
</script>

<style scoped>
.import-character-picker { display: grid; gap: 8px; }
.import-character-picker__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.import-character-picker__chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px 5px 10px; border: 1px solid var(--app-border, rgba(120, 120, 128, 0.2)); border-radius: 8px; font-size: 0.85rem; }
.import-character-picker__remove { border: 0; padding: 0; background: transparent; color: var(--app-text-secondary, #888); font-size: 1rem; line-height: 1; cursor: pointer; }
</style>
