import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { LEGAL_ACCEPTED_KEY, LEGAL_DOCS_VERSION } from '@/constants/legalConstants'

export const useLegalStore = defineStore('legal', () => {
  const gateVisible = ref(false)
  /** Web / iOS 无法 exitApp 时的阻断态 */
  const gateBlocked = ref(false)
  const viewerVisible = ref(false)
  const activeDocType = ref('terms')
  const checked = ref(false)

  let resolveGate
  const gateReady = new Promise((resolve) => {
    resolveGate = resolve
  })

  async function checkGate() {
    if (checked.value) return gateReady
    checked.value = true
    try {
      const accepted = await readPersisted(LEGAL_ACCEPTED_KEY)
      if (accepted !== LEGAL_DOCS_VERSION) {
        gateVisible.value = true
        activeDocType.value = 'terms'
      } else {
        resolveGate()
      }
    } catch {
      gateVisible.value = true
      activeDocType.value = 'terms'
    }
    return gateReady
  }

  async function acceptDocs() {
    await writePersisted(LEGAL_ACCEPTED_KEY, LEGAL_DOCS_VERSION)
    gateVisible.value = false
    gateBlocked.value = false
    resolveGate()
  }

  function disagree() {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      void CapApp.exitApp().catch(() => {
        gateBlocked.value = true
        gateVisible.value = false
      })
      return
    }
    gateBlocked.value = true
    gateVisible.value = false
  }

  function reopenGate() {
    gateBlocked.value = false
    viewerVisible.value = false
    activeDocType.value = 'terms'
    gateVisible.value = true
  }

  function openViewer(docType = 'terms') {
    if (gateVisible.value || gateBlocked.value) return
    activeDocType.value = docType
    viewerVisible.value = true
  }

  function closeViewer() {
    viewerVisible.value = false
  }

  function setDocType(docType) {
    activeDocType.value = docType
  }

  const dialogVisible = computed(() => gateVisible.value || viewerVisible.value)
  const isGateMode = computed(() => gateVisible.value)

  return {
    gateVisible,
    gateBlocked,
    viewerVisible,
    activeDocType,
    checked,
    gateReady,
    dialogVisible,
    isGateMode,
    checkGate,
    acceptDocs,
    disagree,
    reopenGate,
    openViewer,
    closeViewer,
    setDocType
  }
})
