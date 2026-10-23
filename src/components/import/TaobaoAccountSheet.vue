<template>
  <AccountManagerSheet
    ref="managerRef"
    :model-value="modelValue"
    :accounts="accounts"
    :active-account-id="activeAccountId"
    :active-account-label="activeAccountLabel"
    @update:model-value="(v) => { if (!v) close() }"
    @switch="(account) => $emit('switch', account)"
    @remove="(account) => $emit('remove', account)"
    @relogin="onRelogin"
    @login-new="onLoginNew"
  />

  <TaobaoQrLoginSheet
    v-model="showQrLogin"
    @success="(payload) => $emit('login-cookie', payload)"
  />
</template>

<script setup>
import { ref, watch } from 'vue'
import AccountManagerSheet from '@/components/import/AccountManagerSheet.vue'
import TaobaoQrLoginSheet from '@/components/import/TaobaoQrLoginSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accounts: { type: Array, default: () => [] },
  activeAccountId: { type: String, default: '' },
  activeAccountLabel: { type: String, default: '' },
})

const emit = defineEmits([
  'update:modelValue',
  'switch',
  'remove',
  'login-cookie',
])

const managerRef = ref(null)
const showQrLogin = ref(false)

useDialogBackButton(closeChildren, () => showQrLogin.value)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) showQrLogin.value = false
  }
)

function closeChildren() {
  showQrLogin.value = false
}

function close() {
  closeChildren()
  emit('update:modelValue', false)
}

/** 登录成功后由父组件调用：关掉扫码弹层与账号面板 */
function closeAll() {
  closeChildren()
  emit('update:modelValue', false)
}

function onLoginNew() {
  managerRef.value?.setNotice('')
  showQrLogin.value = true
}

function onRelogin() {
  managerRef.value?.setNotice('')
  showQrLogin.value = true
}

defineExpose({
  setNotice(message, tone = 'info') {
    managerRef.value?.setNotice(message, tone)
  },
  close,
  closeAll,
})
</script>
