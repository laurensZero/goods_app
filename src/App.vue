<template>
  <div class="app-wrapper">
    <RouterView v-slot="{ Component, route: currentRoute }">
      <Transition name="page-transition" mode="out-in">
        <component :is="Component" :key="currentRoute.fullPath" />
      </Transition>
    </RouterView>
    <TabBar v-if="showTabBar" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TabBar from '@/components/TabBar.vue'

const route = useRoute()
const hiddenTabBarRoutes = ['detail', 'add', 'edit', 'manage-categories', 'manage-ips', 'manage-characters']
const showTabBar = computed(() => !hiddenTabBarRoutes.includes(route.name))
</script>

<style scoped>
.page-transition-enter-active,
.page-transition-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
  will-change: opacity, transform;
}

.page-transition-enter-from {
  opacity: 0;
  transform: translateX(18px);
}

.page-transition-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
</style>
