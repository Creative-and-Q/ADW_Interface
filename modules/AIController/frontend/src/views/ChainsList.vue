<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-3xl font-bold">Saved Chains</h1>
      <button @click="$router.push('/builder')" class="btn btn-primary">
        + New Chain
      </button>
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading chains...</div>
    </div>

    <div v-else-if="error" class="card bg-red-50 border-red-200">
      <p class="text-red-800">Error: {{ error }}</p>
    </div>

    <div v-else-if="chains.length === 0" class="card text-center py-12">
      <p class="text-gray-500 mb-4">No chains yet. Create your first chain!</p>
      <button @click="$router.push('/builder')" class="btn btn-primary">
        + Create Chain
      </button>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="chain in chains"
        :key="chain.id"
        class="card hover:shadow-md transition-shadow cursor-pointer"
        @click="viewChain(chain.id!)"
      >
        <div class="flex items-start justify-between mb-3">
          <h3 class="text-lg font-bold text-gray-900">{{ chain.name }}</h3>
          <button
            @click.stop="deleteChain(chain.id!)"
            class="text-red-500 hover:text-red-700"
            title="Delete"
          >
            ✕
          </button>
        </div>

        <p v-if="chain.description" class="text-sm text-gray-600 mb-3">
          {{ chain.description }}
        </p>

        <div class="flex items-center space-x-2 mb-3">
          <span class="badge bg-gray-100 text-gray-800">{{ chain.steps.length }} steps</span>
          <span
            v-for="module in getModules(chain)"
            :key="module"
            :class="`badge badge-${module}`"
          >
            {{ module }}
          </span>
        </div>

        <div class="text-xs text-gray-500">
          Created {{ formatDate(chain.created_at!) }}
        </div>

        <div class="mt-4 flex space-x-2">
          <button
            @click.stop="editChain(chain.id!)"
            class="btn btn-secondary btn-sm flex-1"
          >
            Edit
          </button>
          <button
            @click.stop="executeChain(chain.id!)"
            class="btn btn-primary btn-sm flex-1"
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useChainStore } from '../stores/chainStore';
import type { ChainConfiguration } from '../types';

const router = useRouter();
const chainStore = useChainStore();

const chains = computed(() => chainStore.sortedChains);
const loading = computed(() => chainStore.loading);
const error = computed(() => chainStore.error);

function getModules(chain: ChainConfiguration): string[] {
  const modules = new Set(chain.steps.map((s) => s.module));
  return Array.from(modules);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

function viewChain(id: number) {
  router.push(`/builder/${id}`);
}

function editChain(id: number) {
  router.push(`/builder/${id}`);
}

async function deleteChain(id: number) {
  if (confirm('Are you sure you want to delete this chain?')) {
    try {
      await chainStore.deleteChain(id, 'admin');
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  }
}

function executeChain(id: number) {
  // TODO: Open execution modal
  alert('Execution feature coming soon!');
}

onMounted(async () => {
  await chainStore.loadUserChains('admin');
});
</script>
