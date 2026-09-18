import { ref } from 'vue'
import { SECTIONS } from '../config/sections'

const SECTION_KEY = 'goods_admin_active_section'

function readSavedSection() {
  try {
    const saved = localStorage.getItem(SECTION_KEY)
    if (saved && SECTIONS.some((s) => s.id === saved)) return saved
  } catch { /* ignore */ }
  return SECTIONS[0].id
}

/** 模块级共享：App 与各 section 通过同一实例切换分区并传递筛选载荷。 */
const activeSectionId = ref(readSavedSection())
/** 跨分区一次性载荷：{ target, ts, device_id?, keyword?, userName? } */
const sectionPayload = ref(null)

export function useAdminNav() {
  function selectSection(id) {
    if (!SECTIONS.some((s) => s.id === id)) return
    activeSectionId.value = id
    try {
      localStorage.setItem(SECTION_KEY, id)
    } catch { /* ignore */ }
  }

  /**
   * 切换分区，可携带筛选载荷（设备 ID / 关键词等）。
   * 目标 section 在 onMounted 时 consumeSectionPayload 读取一次。
   */
  function goToSection(id, payload = null) {
    sectionPayload.value = payload
      ? { target: id, ts: Date.now(), ...payload }
      : null
    selectSection(id)
  }

  /** 目标 section 读取并清空指向自己的载荷；无则返回 null。 */
  function consumeSectionPayload(sectionId) {
    const p = sectionPayload.value
    if (!p || p.target !== sectionId) return null
    sectionPayload.value = null
    return p
  }

  return {
    activeSectionId,
    sectionPayload,
    selectSection,
    goToSection,
    consumeSectionPayload
  }
}
