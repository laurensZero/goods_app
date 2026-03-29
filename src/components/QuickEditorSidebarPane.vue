<template>
  <aside class="quick-editor-sidebar">
    <div class="quick-editor-sidebar-tabs">
      <slot name="tabs" />
    </div>
    <div class="quick-editor-sidebar-scroll">
      <slot />
    </div>
  </aside>
</template>

<script setup>
</script>

<style scoped>
.quick-editor-sidebar {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.quick-editor-sidebar-tabs {
  flex: 0 0 auto;
  min-height: 0;
}

.quick-editor-sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  scrollbar-width: none;
}

.quick-editor-sidebar-scroll::-webkit-scrollbar {
  display: none;
}

@media (max-width: 760px) {
  .quick-editor-sidebar {
    gap: 10px;
    overflow: visible;
  }

  .quick-editor-sidebar-scroll {
    flex: 0 0 auto;
    min-height: auto;
    overflow: visible;
  }
}

@media (min-width: 761px) and (max-width: 1024px) {
  .quick-editor-sidebar {
    height: 100%;
    max-height: 100%;
    gap: 10px;
  }
}
</style>
