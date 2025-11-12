<template>
  <div>
    <h1 class="text-3xl font-bold mb-8">Module Control</h1>

    <div v-if="processLoading && !moduleProcesses.length" class="text-center py-12">
      <div class="text-gray-500">Loading module status...</div>
    </div>

    <div v-else-if="error" class="card bg-red-50 border-red-200 mb-6">
      <p class="text-red-800">Error: {{ error }}</p>
      <button @click="refresh" class="btn btn-secondary mt-4">
        Retry
      </button>
    </div>

    <div v-else class="space-y-6">
      <!-- Control Panel Header -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold">Module Servers</h2>
            <p class="text-gray-600 text-sm mt-1">
              Start, stop, and restart microservice modules
            </p>
          </div>
          <div class="flex space-x-3">
            <button
              @click="startAllModules"
              class="btn btn-primary flex items-center"
              :disabled="processLoading || startAllLoading"
            >
              <span class="mr-2">🚀</span>
              {{ startAllLoading ? 'Starting...' : 'Start All' }}
            </button>
            <button
              @click="refresh"
              class="btn btn-secondary flex items-center"
              :disabled="processLoading"
            >
              <span class="mr-2">🔄</span>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <!-- Module Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          v-for="module in moduleProcesses"
          :key="module.name"
          class="card"
          :class="{
            'border-green-300 bg-green-50': module.status === 'running' && module.healthy,
            'border-yellow-300 bg-yellow-50': module.status === 'running' && !module.healthy,
            'border-gray-300': module.status === 'stopped',
            'border-red-300 bg-red-50': module.status === 'error',
          }"
        >
          <!-- Module Header -->
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-xl font-bold">{{ module.name }}</h3>
              <div class="flex items-center space-x-2 mt-1">
                <span
                  class="badge text-xs"
                  :class="{
                    'bg-green-100 text-green-800': module.status === 'running',
                    'bg-gray-100 text-gray-800': module.status === 'stopped',
                    'bg-blue-100 text-blue-800': module.status === 'starting',
                    'bg-orange-100 text-orange-800': module.status === 'stopping',
                    'bg-red-100 text-red-800': module.status === 'error',
                  }"
                >
                  {{ module.status.toUpperCase() }}
                </span>
                <span
                  v-if="module.status === 'running'"
                  class="badge text-xs"
                  :class="{
                    'bg-green-100 text-green-800': module.healthy,
                    'bg-yellow-100 text-yellow-800': !module.healthy,
                  }"
                >
                  {{ module.healthy ? 'HEALTHY' : 'UNHEALTHY' }}
                </span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm text-gray-600">Port: {{ module.port }}</div>
              <div v-if="module.pid" class="text-xs text-gray-500">PID: {{ module.pid }}</div>
            </div>
          </div>

          <!-- Module Info -->
          <div class="space-y-2 mb-4 text-sm">
            <div v-if="module.startedAt" class="flex justify-between">
              <span class="text-gray-600">Started:</span>
              <span class="font-medium">{{ formatDate(module.startedAt) }}</span>
            </div>
            <div v-if="module.uptime !== undefined" class="flex justify-between">
              <span class="text-gray-600">Uptime:</span>
              <span class="font-medium">{{ formatUptime(module.uptime) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Restart Count:</span>
              <span class="font-medium">{{ module.restartCount }}</span>
            </div>
          </div>

          <!-- Port Conflict Warning -->
          <div
            v-if="module.portConflict?.inUse && module.status === 'stopped'"
            class="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded"
          >
            <p class="text-xs text-yellow-900">
              <strong>⚠️ Port Conflict:</strong> Port {{ module.port }} is in use
              <span v-if="module.portConflict.pid"> by process {{ module.portConflict.pid }}</span>.
              <br />
              Click "Start" to force kill the conflicting process.
            </p>
          </div>

          <!-- Error Message -->
          <div v-if="module.lastError" class="mb-4 p-3 bg-red-100 border border-red-200 rounded">
            <p class="text-xs text-red-800">
              <strong>Last Error:</strong> {{ module.lastError }}
            </p>
          </div>

          <!-- Control Buttons -->
          <div class="flex space-x-2">
            <button
              @click="handleStart(module.name)"
              :disabled="
                processLoading ||
                module.status === 'running' ||
                module.status === 'starting'
              "
              class="btn btn-primary flex-1"
            >
              <span class="mr-1">▶️</span>
              Start
            </button>
            <button
              @click="handleStop(module.name)"
              :disabled="
                processLoading ||
                module.status === 'stopped' ||
                module.status === 'stopping'
              "
              class="btn btn-secondary flex-1"
            >
              <span class="mr-1">⏹️</span>
              Stop
            </button>
            <button
              @click="handleRestart(module.name)"
              :disabled="processLoading"
              class="btn btn-secondary flex-1"
            >
              <span class="mr-1">🔄</span>
              Restart
            </button>
          </div>
        </div>
      </div>

      <!-- Instructions -->
      <div class="card bg-blue-50 border-blue-200">
        <h3 class="text-lg font-bold mb-2">Instructions</h3>
        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li><strong>Start:</strong> Launch a module server process</li>
          <li><strong>Stop:</strong> Gracefully shutdown a running module</li>
          <li><strong>Restart:</strong> Stop and start a module (useful after code changes)</li>
          <li><strong>Status:</strong> Green = running & healthy, Yellow = running but unhealthy, Gray = stopped</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useModuleStore } from '../stores/moduleStore';
import type { ModuleName } from '../types';

const moduleStore = useModuleStore();

const moduleProcesses = computed(() => moduleStore.moduleProcesses);
const processLoading = computed(() => moduleStore.processLoading);
const error = computed(() => moduleStore.error);
const startAllLoading = ref(false);

let refreshInterval: number | null = null;

// Load module processes on mount
onMounted(async () => {
  await refresh();

  // Auto-refresh every 5 seconds
  refreshInterval = window.setInterval(() => {
    if (!processLoading.value) {
      moduleStore.loadModuleProcesses().catch(() => {
        // Silently fail for background refreshes
      });
    }
  }, 5000);
});

// Clear interval on unmount
onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

async function refresh() {
  try {
    await moduleStore.loadModuleProcesses();
    moduleStore.clearError();
  } catch (e: any) {
    console.error('Failed to load module processes:', e);
  }
}

async function startAllModules() {
  try {
    startAllLoading.value = true;
    moduleStore.clearError();

    // Make API call to start all modules
    const response = await fetch('/api/module-processes/start-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ forceKillPorts: true }),
    });

    const data = await response.json();

    if (data.success) {
      // Show success message
      const { successful, failed, total } = data.data.summary;
      if (successful === total) {
        alert(`✅ All ${total} modules started successfully!`);
      } else if (successful > 0) {
        alert(`⚠️ Started ${successful}/${total} modules. ${failed} failed.`);
      } else {
        alert(`❌ Failed to start any modules.`);
      }
    } else {
      throw new Error(data.error || 'Failed to start modules');
    }

    // Refresh status after a delay
    setTimeout(() => refresh(), 3000);
  } catch (e: any) {
    console.error('Failed to start all modules:', e);
    alert(`Error starting modules: ${e.message}`);
  } finally {
    startAllLoading.value = false;
  }
}

async function handleStart(name: ModuleName) {
  try {
    await moduleStore.startModule(name, false);
    // Wait a bit then refresh to get updated status
    setTimeout(() => refresh(), 2000);
  } catch (e: any) {
    // Check if it's a port conflict error
    if (e.portConflict) {
      try {
        await moduleStore.startModule(name, true);
        setTimeout(() => refresh(), 2000);
      } catch (retryError: any) {
        alert(`Failed to force start ${name}: ${retryError.message}`);
      }
    } else {
      alert(`Failed to start ${name}: ${e.message}`);
    }
  }
}

async function handleStop(name: ModuleName) {
  try {
    await moduleStore.stopModule(name);
    // Refresh after stopping
    setTimeout(() => refresh(), 1000);
  } catch (e: any) {
    alert(`Failed to stop ${name}: ${e.message}`);
  }
}

async function handleRestart(name: ModuleName) {
  if (!confirm(`Are you sure you want to restart ${name}?`)) {
    return;
  }

  try {
    await moduleStore.restartModule(name);
    // Refresh after restarting
    setTimeout(() => refresh(), 2000);
  } catch (e: any) {
    alert(`Failed to restart ${name}: ${e.message}`);
  }
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

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
</script>
