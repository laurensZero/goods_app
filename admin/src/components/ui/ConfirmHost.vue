<script setup>
import { useConfirm } from '../../composables/useConfirm'
import ConfirmDialog from './ConfirmDialog.vue'

const { confirmState, settle } = useConfirm()

function onCancel() {
  settle(false)
}

function onConfirm() {
  settle(true)
}
</script>

<template>
  <ConfirmDialog
    :visible="confirmState.visible"
    :title="confirmState.title"
    :message="confirmState.message"
    :confirm-text="confirmState.confirmText"
    :cancel-text="confirmState.cancelText"
    :danger="confirmState.danger"
    @confirm="onConfirm"
    @cancel="onCancel"
  />
</template>
