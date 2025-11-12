<template>
  <div>
    <h1 class="text-3xl font-bold mb-8">Available Modules</h1>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading modules...</div>
    </div>

    <div v-else-if="error" class="card bg-red-50 border-red-200">
      <p class="text-red-800">Error: {{ error }}</p>
    </div>

    <div v-else class="space-y-6">
      <div v-for="module in modules" :key="module.type" class="card">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-2xl font-bold">{{ module.name }}</h2>
            <p class="text-gray-600 mt-1">{{ module.description }}</p>
          </div>
          <span :class="`badge badge-${module.type} text-lg px-4 py-2`">
            {{ module.type }}
          </span>
        </div>

        <div class="text-sm text-gray-600 mb-4">
          <strong>URL:</strong> {{ module.url }}
        </div>

        <h3 class="text-lg font-bold mb-3">Endpoints</h3>
        <div class="space-y-3">
          <div
            v-for="(endpoint, index) in module.endpoints"
            :key="index"
            class="border border-gray-200 rounded-lg p-4"
          >
            <div class="flex items-center space-x-3 mb-2">
              <span
                class="badge"
                :class="{
                  'bg-blue-100 text-blue-800': endpoint.method === 'GET',
                  'bg-green-100 text-green-800': endpoint.method === 'POST',
                  'bg-yellow-100 text-yellow-800': endpoint.method === 'PATCH',
                  'bg-red-100 text-red-800': endpoint.method === 'DELETE',
                }"
              >
                {{ endpoint.method }}
              </span>
              <code class="text-sm font-mono">{{ endpoint.path }}</code>
            </div>

            <p class="text-sm text-gray-600 mb-3">{{ endpoint.description }}</p>

            <div v-if="endpoint.params && endpoint.params.length > 0" class="mb-3">
              <div class="text-xs font-medium text-gray-500 mb-2">Parameters:</div>
              <div class="space-y-1">
                <div
                  v-for="param in endpoint.params"
                  :key="param.name"
                  class="text-xs flex items-start"
                >
                  <code class="bg-gray-100 px-1 rounded mr-2">{{ param.name }}</code>
                  <span class="text-gray-600">
                    {{ param.type }}
                    <span v-if="param.required" class="text-red-600">*</span>
                    - {{ param.description }}
                  </span>
                </div>
              </div>
            </div>

            <div v-if="endpoint.body && endpoint.body.length > 0" class="mb-3">
              <div class="text-xs font-medium text-gray-500 mb-2">Request Body:</div>
              <div class="space-y-1">
                <div
                  v-for="field in endpoint.body"
                  :key="field.name"
                  class="text-xs flex items-start"
                >
                  <code class="bg-gray-100 px-1 rounded mr-2">{{ field.name }}</code>
                  <span class="text-gray-600">
                    {{ field.type }}
                    <span v-if="field.required" class="text-red-600">*</span>
                    - {{ field.description }}
                  </span>
                </div>
              </div>
            </div>

            <details v-if="endpoint.response">
              <summary class="cursor-pointer text-primary-600 hover:text-primary-700 text-sm">
                View Example Response
              </summary>
              <pre class="json-viewer mt-2 text-xs">{{ JSON.stringify(endpoint.response.example, null, 2) }}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useModuleStore } from '../stores/moduleStore';

const moduleStore = useModuleStore();

const modules = computed(() => moduleStore.modules);
const loading = computed(() => moduleStore.loading);
const error = computed(() => moduleStore.error);

onMounted(async () => {
  await moduleStore.loadModules();
});
</script>
