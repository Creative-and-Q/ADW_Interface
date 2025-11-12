<template>
  <div>
    <button @click="$router.back()" class="btn btn-secondary btn-sm mb-4">
      ← Back
    </button>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading execution...</div>
    </div>

    <div v-else-if="error" class="card bg-red-50 border-red-200">
      <p class="text-red-800">Error: {{ error }}</p>
    </div>

    <div v-else-if="execution">
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-3xl font-bold">{{ execution.chain_name || 'Ad-hoc Chain' }}</h1>
        <span
          :class="[
            'badge text-lg px-4 py-2',
            execution.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
          ]"
        >
          {{ execution.success ? 'Success' : 'Failed' }}
        </span>
      </div>

      <!-- Summary -->
      <div class="card mb-6">
        <h2 class="text-xl font-bold mb-4">Summary</h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div class="text-sm text-gray-500">Steps</div>
            <div class="text-2xl font-bold">{{ execution.steps.length }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Duration</div>
            <div class="text-2xl font-bold">{{ execution.total_duration_ms }}ms</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Started</div>
            <div class="text-sm">{{ new Date(execution.started_at).toLocaleString() }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Completed</div>
            <div class="text-sm">{{ new Date(execution.completed_at).toLocaleString() }}</div>
          </div>
        </div>
        <div v-if="execution.error" class="mt-4 p-3 bg-red-50 border border-red-200 rounded">
          <strong class="text-red-800">Error:</strong>
          <span class="text-red-700 ml-2">{{ execution.error }}</span>
        </div>
      </div>

      <!-- Input -->
      <div class="card mb-6">
        <h2 class="text-xl font-bold mb-4">Input Data</h2>
        <pre class="json-viewer">{{ JSON.stringify(execution.input, null, 2) }}</pre>
      </div>

      <!-- Steps -->
      <div class="card">
        <h2 class="text-xl font-bold mb-4">Steps ({{ execution.steps.length }})</h2>
        <div class="space-y-4">
          <div
            v-for="(step, index) in execution.steps"
            :key="index"
            class="border border-gray-200 rounded-lg p-4"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center space-x-3">
                <span class="text-lg font-bold text-gray-700">Step {{ index + 1 }}</span>
                <span :class="`badge badge-${step.module}`">{{ step.module }}</span>
                <span class="text-sm text-gray-500">{{ step.method }}</span>
              </div>
              <div class="flex items-center space-x-3">
                <span
                  :class="[
                    'badge',
                    step.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
                  ]"
                >
                  {{ step.success ? 'Success' : 'Failed' }}
                </span>
                <span class="text-sm text-gray-500">{{ step.duration_ms }}ms</span>
              </div>
            </div>

            <div class="text-sm mb-3">
              <strong>{{ step.step_name || step.step_id }}</strong>
            </div>

            <div class="text-xs text-gray-600 mb-3">
              {{ step.request.url }}
            </div>

            <div v-if="step.error" class="mb-3 text-sm text-red-600">
              Error: {{ step.error }}
            </div>

            <details>
              <summary class="cursor-pointer text-primary-600 hover:text-primary-700 text-sm">
                View Request
              </summary>
              <div class="mt-2 space-y-2">
                <div v-if="step.request.params">
                  <div class="text-xs font-medium text-gray-500">Parameters:</div>
                  <pre class="json-viewer text-xs">{{ JSON.stringify(step.request.params, null, 2) }}</pre>
                </div>
                <div v-if="step.request.body">
                  <div class="text-xs font-medium text-gray-500">Body:</div>
                  <pre class="json-viewer text-xs">{{ JSON.stringify(step.request.body, null, 2) }}</pre>
                </div>
              </div>
            </details>

            <details class="mt-2">
              <summary class="cursor-pointer text-primary-600 hover:text-primary-700 text-sm">
                View Response
              </summary>
              <pre class="json-viewer mt-2 text-xs">{{ JSON.stringify(step.response, null, 2) }}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useExecutionStore } from '../stores/executionStore';

const route = useRoute();
const executionStore = useExecutionStore();

const execution = computed(() => executionStore.currentExecution);
const loading = computed(() => executionStore.loading);
const error = computed(() => executionStore.error);

onMounted(async () => {
  const id = parseInt(route.params.id as string);
  // Don't pass userId - allow viewing any execution
  await executionStore.loadExecution(id);
});
</script>
