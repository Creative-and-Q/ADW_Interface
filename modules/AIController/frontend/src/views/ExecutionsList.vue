<template>
  <div>
    <h1 class="text-3xl font-bold mb-8">Execution History</h1>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading executions...</div>
    </div>

    <div v-else-if="error" class="card bg-red-50 border-red-200">
      <p class="text-red-800">Error: {{ error }}</p>
    </div>

    <div v-else-if="executions.length === 0" class="card text-center py-12">
      <p class="text-gray-500">No executions yet. Execute a chain to see history here!</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="execution in executions"
        :key="execution.id"
        class="card hover:shadow-md transition-shadow cursor-pointer"
        @click="viewExecution(execution.id!)"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <span
                :class="[
                  'badge',
                  execution.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
                ]"
              >
                {{ execution.success ? 'Success' : 'Failed' }}
              </span>
              <h3 class="text-lg font-bold">{{ execution.chain_name || 'Ad-hoc Chain' }}</h3>
            </div>

            <div class="flex items-center space-x-4 text-sm text-gray-600">
              <span>{{ execution.steps.length }} steps</span>
              <span>{{ execution.total_duration_ms }}ms</span>
              <span>{{ formatDate(execution.started_at) }}</span>
            </div>

            <div v-if="execution.error" class="mt-2 text-sm text-red-600">
              Error: {{ execution.error }}
            </div>
          </div>

          <div class="flex items-center space-x-2">
            <div
              v-for="module in getModules(execution)"
              :key="module"
              :class="`badge badge-${module}`"
            >
              {{ module }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useExecutionStore } from '../stores/executionStore';
import type { ExecutionResult } from '../types';

const router = useRouter();
const executionStore = useExecutionStore();

const executions = computed(() => executionStore.executions);
const loading = computed(() => executionStore.loading);
const error = computed(() => executionStore.error);

function getModules(execution: ExecutionResult): string[] {
  const modules = new Set(execution.steps.map((s) => s.module));
  return Array.from(modules);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function viewExecution(id: number) {
  router.push(`/execution/${id}`);
}

onMounted(async () => {
  await executionStore.loadUserExecutions('admin', 50);
});
</script>
