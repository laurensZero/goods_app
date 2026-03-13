<template>
  <div class="app-wrapper">
    <RouterView v-slot="{ Component, route: currentRoute }">
      <template v-if="Component">
        <template v-if="currentRoute.meta.keepAlive">
          <KeepAlive :include="keepAliveViewNames">
            <component
              :is="Component"
              :key="getKeepAliveKey(currentRoute)"
            />
          </KeepAlive>
        </template>
        <template v-else>
          <component
            :is="Component"
            :key="getRouteKey(currentRoute)"
          />
        </template>
      </template>
    </RouterView>
    <TabBar v-if="showTabBar" />
  </div>
</template>

<script setup>
import { computed, KeepAlive } from 'vue'
import { useRoute } from 'vue-router'
import TabBar from '@/components/TabBar.vue'

const route = useRoute()
const keepAliveViewNames = ['HomeView', 'TimelineView', 'WishlistView']
const hiddenTabBarRoutes = ['detail', 'add', 'edit', 'import', 'cart-import', 'account-import', 'taobao-import', 'manage-categories', 'manage-ips', 'manage-characters', 'storage-locations', 'trash']
const showTabBar = computed(() => !hiddenTabBarRoutes.includes(String(route.name ?? '')))

function getKeepAliveKey(currentRoute) {
  return String(currentRoute.name ?? currentRoute.path ?? currentRoute.fullPath)
}

function getRouteKey(currentRoute) {
  return currentRoute.fullPath
}
</script>
