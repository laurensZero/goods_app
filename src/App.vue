<template>
  <div class="app-wrapper">
    <RouterView v-slot="{ Component, route: currentRoute }">
      <KeepAlive v-if="currentRoute.meta.keepAlive">
        <component :is="Component" :key="currentRoute.name" />
      </KeepAlive>

      <component v-else :is="Component" :key="currentRoute.fullPath" />
    </RouterView>
    <TabBar v-if="showTabBar" />
  </div>
</template>

<script setup>
import { computed, KeepAlive } from 'vue'
import { useRoute } from 'vue-router'
import TabBar from '@/components/TabBar.vue'

const route = useRoute()
const hiddenTabBarRoutes = ['detail', 'add', 'edit', 'manage-categories', 'manage-ips', 'manage-characters']
const showTabBar = computed(() => !hiddenTabBarRoutes.includes(route.name))
</script>
