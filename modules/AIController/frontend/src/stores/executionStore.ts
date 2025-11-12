import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import type { ExecutionResult } from '../types';

export const useExecutionStore = defineStore('execution', () => {
  // State
  const executions = ref<ExecutionResult[]>([]);
  const currentExecution = ref<ExecutionResult | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const executionCount = computed(() => executions.value.length);
  const successfulExecutions = computed(() =>
    executions.value.filter((e) => e.success)
  );
  const failedExecutions = computed(() =>
    executions.value.filter((e) => !e.success)
  );
  const successRate = computed(() => {
    if (executions.value.length === 0) return 0;
    return (successfulExecutions.value.length / executions.value.length) * 100;
  });

  // Actions
  async function loadUserExecutions(userId: string, limit: number = 100) {
    loading.value = true;
    error.value = null;
    try {
      executions.value = await api.getUserExecutions(userId, limit);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadChainExecutions(chainId: number, limit: number = 100) {
    loading.value = true;
    error.value = null;
    try {
      executions.value = await api.getChainExecutions(chainId, limit);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadExecution(id: number, userId?: string) {
    loading.value = true;
    error.value = null;
    try {
      currentExecution.value = await api.getExecution(id, userId);
      return currentExecution.value;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function executeChain(
    chainId: number,
    input: Record<string, any>,
    userId: string,
    env?: Record<string, string>
  ) {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.executeChain(chainId, input, userId, env);
      executions.value.unshift(result);
      currentExecution.value = result;
      return result;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function executeAdHocChain(
    userId: string,
    name: string,
    steps: any[],
    input: Record<string, any>,
    outputTemplate?: Record<string, any>,
    env?: Record<string, string>
  ) {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.executeAdHocChain(userId, name, steps, input, outputTemplate, env);
      executions.value.unshift(result);
      currentExecution.value = result;
      return result;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function setCurrentExecution(execution: ExecutionResult | null) {
    currentExecution.value = execution;
  }

  function clearError() {
    error.value = null;
  }

  return {
    // State
    executions,
    currentExecution,
    loading,
    error,
    // Getters
    executionCount,
    successfulExecutions,
    failedExecutions,
    successRate,
    // Actions
    loadUserExecutions,
    loadChainExecutions,
    loadExecution,
    executeChain,
    executeAdHocChain,
    setCurrentExecution,
    clearError,
  };
});
