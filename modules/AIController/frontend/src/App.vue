<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex">
            <div class="flex-shrink-0 flex items-center">
              <h1 class="text-2xl font-bold text-primary-600">AIController</h1>
            </div>
            <div class="ml-10 flex space-x-4 items-center">
              <router-link
                to="/"
                class="nav-link"
                :class="{ active: $route.path === '/' }"
              >
                Dashboard
              </router-link>
              <router-link
                to="/chains"
                class="nav-link"
                :class="{ active: $route.path === '/chains' }"
              >
                Chains
              </router-link>
              <router-link
                to="/builder"
                class="nav-link"
                :class="{ active: $route.path === '/builder' }"
              >
                Builder
              </router-link>
              <router-link
                to="/executions"
                class="nav-link"
                :class="{ active: $route.path === '/executions' }"
              >
                Executions
              </router-link>
              <router-link
                to="/modules"
                class="nav-link"
                :class="{ active: $route.path === '/modules' }"
              >
                Modules
              </router-link>
              <router-link
                to="/control"
                class="nav-link"
                :class="{ active: $route.path === '/control' }"
              >
                Control
              </router-link>
              <router-link
                to="/ai-agent"
                class="nav-link"
                :class="{ active: $route.path === '/ai-agent' }"
              >
                🤖 AI Agent
              </router-link>
            </div>
          </div>
          <div class="flex items-center">
            <div class="text-sm text-gray-600">
              User: <span class="font-medium">{{ userId }}</span>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

// For demo purposes - in production, this would come from auth
const userId = ref('admin');
</script>

<style scoped>
.nav-link {
  @apply text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors;
}

.nav-link.active {
  @apply text-primary-600 bg-primary-50;
}
</style>
