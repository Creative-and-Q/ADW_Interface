<template>
  <div>
    <h1 class="text-3xl font-bold mb-8">Dashboard</h1>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading...</div>
    </div>

    <div v-else-if="error" class="card bg-red-50 border-red-200">
      <p class="text-red-800">Error: {{ error }}</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Statistics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="card">
          <h3 class="text-sm font-medium text-gray-500">Total Chains</h3>
          <p class="text-3xl font-bold text-gray-900 mt-2">{{ stats?.total_chains || 0 }}</p>
        </div>
        <div class="card">
          <h3 class="text-sm font-medium text-gray-500">Total Executions</h3>
          <p class="text-3xl font-bold text-gray-900 mt-2">{{ stats?.total_executions || 0 }}</p>
        </div>
        <div class="card">
          <h3 class="text-sm font-medium text-gray-500">Success Rate</h3>
          <p class="text-3xl font-bold text-green-600 mt-2">{{ successRate }}%</p>
        </div>
        <div class="card">
          <h3 class="text-sm font-medium text-gray-500">Avg Duration</h3>
          <p class="text-3xl font-bold text-gray-900 mt-2">
            {{ stats?.average_duration_ms || 0 }}ms
          </p>
        </div>
      </div>

      <!-- Recent Executions -->
      <div class="card">
        <h2 class="text-xl font-bold mb-4">Recent Executions</h2>
        <div v-if="stats?.recent_executions && stats.recent_executions.length > 0">
          <div class="space-y-3">
            <div
              v-for="execution in stats.recent_executions"
              :key="execution.id"
              class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              @click="$router.push(`/execution/${execution.id}`)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span
                    :class="[
                      'badge',
                      execution.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
                    ]"
                  >
                    {{ execution.success ? 'Success' : 'Failed' }}
                  </span>
                  <span class="ml-2 font-medium">{{ execution.chain_name || 'Ad-hoc' }}</span>
                </div>
                <div class="text-sm text-gray-500">
                  {{ formatDate(execution.started_at) }}
                </div>
              </div>
              <div class="mt-2 text-sm text-gray-600">
                {{ execution.steps.length }} steps • {{ execution.total_duration_ms }}ms
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-gray-500">No executions yet</div>
      </div>

      <!-- Quick Actions -->
      <div class="card">
        <h2 class="text-xl font-bold mb-4">Quick Actions</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            @click="$router.push('/builder')"
            class="btn btn-primary flex items-center justify-center"
          >
            <span class="mr-2">+</span>
            Create New Chain
          </button>
          <button
            @click="$router.push('/chains')"
            class="btn btn-secondary flex items-center justify-center"
          >
            View All Chains
          </button>
          <button
            @click="$router.push('/modules')"
            class="btn btn-secondary flex items-center justify-center"
          >
            Explore Modules
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../services/api';
import type { Statistics } from '../types';

const stats = ref<Statistics | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const successRate = computed(() => {
  if (!stats.value || stats.value.total_executions === 0) return 0;
  return Math.round((stats.value.successful_executions / stats.value.total_executions) * 100);
});

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

onMounted(async () => {
  try {
    stats.value = await api.getStatistics();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>
