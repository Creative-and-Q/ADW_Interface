import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import type { ChainConfiguration, ChainStep } from '../types';

export const useChainStore = defineStore('chain', () => {
  // State
  const chains = ref<ChainConfiguration[]>([]);
  const currentChain = ref<ChainConfiguration | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const chainCount = computed(() => chains.value.length);
  const sortedChains = computed(() =>
    [...chains.value].sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    })
  );

  // Actions
  async function loadUserChains(userId: string) {
    loading.value = true;
    error.value = null;
    try {
      chains.value = await api.getUserChains(userId);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadAllChains() {
    loading.value = true;
    error.value = null;
    try {
      chains.value = await api.getAllChains();
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadChain(id: number, userId?: string) {
    loading.value = true;
    error.value = null;
    try {
      currentChain.value = await api.getChain(id, userId);
      return currentChain.value;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createChain(chain: Partial<ChainConfiguration>) {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.createChain(chain);
      chains.value.push(created);
      currentChain.value = created;
      return created;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateChain(
    id: number,
    updates: Partial<ChainConfiguration>,
    userId?: string
  ) {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.updateChain(id, updates, userId);
      const index = chains.value.findIndex((c) => c.id === id);
      if (index !== -1) {
        chains.value[index] = updated;
      }
      if (currentChain.value?.id === id) {
        currentChain.value = updated;
      }
      return updated;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteChain(id: number, userId?: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteChain(id, userId);
      chains.value = chains.value.filter((c) => c.id !== id);
      if (currentChain.value?.id === id) {
        currentChain.value = null;
      }
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function setCurrentChain(chain: ChainConfiguration | null) {
    currentChain.value = chain;
  }

  function clearError() {
    error.value = null;
  }

  return {
    // State
    chains,
    currentChain,
    loading,
    error,
    // Getters
    chainCount,
    sortedChains,
    // Actions
    loadUserChains,
    loadAllChains,
    loadChain,
    createChain,
    updateChain,
    deleteChain,
    setCurrentChain,
    clearError,
  };
});
