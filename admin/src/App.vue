<script setup>
import { computed, ref, watch } from 'vue'
import { useAdminTheme } from './composables/useAdminTheme'
import { SECTIONS } from './config/sections'
import AdminSidebar from './components/layout/AdminSidebar.vue'
import AdminNav from './components/layout/AdminNav.vue'
import AdminHeader from './components/layout/AdminHeader.vue'
import SectionCard from './components/ui/SectionCard.vue'

const { appearance, toggleDark } = useAdminTheme()

// 侧栏展开/收起状态持久化
const SIDEBAR_KEY = 'goods_admin_sidebar_collapsed'
const sidebarCollapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1')

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

// 始终只聚焦一个分区，无「全部」模式
const activeSectionId = ref(SECTIONS[0].id)
const activeSection = computed(() =>
  SECTIONS.find((s) => s.id === activeSectionId.value) ?? SECTIONS[0]
)

const isDark = computed(() => appearance.value === 'dark')

function selectSection(id) {
  activeSectionId.value = id
}

watch(activeSectionId, () => {
  const el = document.getElementById(activeSectionId.value)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
</script>

<template>
  <div
    class="admin-shell"
    :class="{ 'admin-shell--nav-collapsed': sidebarCollapsed }"
  >
    <AdminSidebar
      :collapsed="sidebarCollapsed"
      :sections="SECTIONS"
      :active-id="activeSectionId"
      @toggle="toggleSidebar"
      @select="selectSection"
    />

    <div class="admin-body">
      <div class="admin-body__inner">
        <AdminHeader
          :is-dark="isDark"
          :active-section="activeSection"
          @toggle-theme="toggleDark"
        />

        <AdminNav
          :sections="SECTIONS"
          :active-id="activeSectionId"
          @select="selectSection"
        />

        <main class="admin-main">
          <section :id="activeSection.id" class="admin-section">
            <SectionCard :section="activeSection">
              <component :is="activeSection.component" />
            </SectionCard>
          </section>
        </main>

        <footer class="admin-footer">
          <p>Goods APP 管理台</p>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  min-height: 100vh;
}

/* 主体列：header、导航、内容、footer 共用同一居中容器，左右对齐 */
.admin-body__inner {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 22px var(--page-padding) 0;
  display: flex;
  flex-direction: column;
  transition: max-width var(--motion-medium) var(--motion-ease-default);
}

.admin-main {
  width: 100%;
  padding: var(--page-padding) 0 48px;
}

.admin-section {
  scroll-margin-top: 12px;
}

.admin-footer {
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

/* 平板横版/桌面：侧栏占据左侧，主体在剩余空间居中；收起侧栏时主体可稍宽 */
@media (min-width: 1180px) {
  .admin-shell {
    display: flex;
    align-items: flex-start;
  }

  .admin-body {
    flex: 1;
    min-width: 0;
  }

  .admin-body__inner {
    max-width: 900px;
    padding: 24px 24px 0;
  }

  .admin-shell--nav-collapsed .admin-body__inner {
    max-width: 960px;
  }

  .admin-main {
    padding-bottom: 56px;
  }
}
</style>