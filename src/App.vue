<template>
  <div class="app-wrapper">
    <RouterView v-slot="{ Component, route: currentRoute }">
      <KeepAlive :include="keepAliveViewNames">
        <component :is="Component" v-if="currentRoute.meta.keepAlive" />
      </KeepAlive>
      <component :is="Component" v-if="!currentRoute.meta.keepAlive" />
    </RouterView>
    <TabBar v-if="showTabBar" />
  </div>
</template>

<script setup>
import { computed, KeepAlive } from 'vue'
import { useRoute } from 'vue-router'
import TabBar from '@/components/TabBar.vue'

const route = useRoute()
const keepAliveViewNames = ['HomeView', 'TimelineView']
const hiddenTabBarRoutes = ['detail', 'add', 'edit', 'import', 'account-import', 'taobao-import', 'manage-categories', 'manage-ips', 'manage-characters']
const showTabBar = computed(() => !hiddenTabBarRoutes.includes(route.name))
</script>
