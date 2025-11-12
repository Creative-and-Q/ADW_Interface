import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import type { ModuleMetadata, ModuleType, ModuleProcessInfo, ModuleName } from '../types';

export const useModuleStore = defineStore('module', () => {
  // State
  const modules = ref<ModuleMetadata[]>([]);
  const moduleProcesses = ref<ModuleProcessInfo[]>([]);
  const loading = ref(false);
  const processLoading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const moduleCount = computed(() => modules.value.length);
  const modulesByType = computed(() => {
    const map = new Map<ModuleType, ModuleMetadata>();
    modules.value.forEach((m) => map.set(m.type, m));
    return map;
  });

  // Actions
  async function loadModules() {
    loading.value = true;
    error.value = null;
    try {
      modules.value = await api.getModules();
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadModule(type: string) {
    loading.value = true;
    error.value = null;
    try {
      const module = await api.getModule(type);
      const index = modules.value.findIndex((m) => m.type === type);
      if (index !== -1) {
        modules.value[index] = module;
      } else {
        modules.value.push(module);
      }
      return module;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function getModule(type: ModuleType): ModuleMetadata | undefined {
    return modulesByType.value.get(type);
  }

  function clearError() {
    error.value = null;
  }

  // Module Process Control Actions
  async function loadModuleProcesses() {
    processLoading.value = true;
    error.value = null;
    try {
      moduleProcesses.value = await api.getModuleProcesses();
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      processLoading.value = false;
    }
  }

  async function loadModuleProcess(name: ModuleName) {
    processLoading.value = true;
    error.value = null;
    try {
      const process = await api.getModuleProcess(name);
      const index = moduleProcesses.value.findIndex((m) => m.name === name);
      if (index !== -1) {
        moduleProcesses.value[index] = process;
      } else {
        moduleProcesses.value.push(process);
      }
      return process;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      processLoading.value = false;
    }
  }

  async function startModule(name: ModuleName, forceKillPort: boolean = false) {
    processLoading.value = true;
    error.value = null;
    try {
      const process = await api.startModule(name, forceKillPort);
      // Update the process in the list
      const index = moduleProcesses.value.findIndex((m) => m.name === name);
      if (index !== -1) {
        moduleProcesses.value[index] = process;
      } else {
        moduleProcesses.value.push(process);
      }
      return process;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      processLoading.value = false;
    }
  }

  async function stopModule(name: ModuleName) {
    processLoading.value = true;
    error.value = null;
    try {
      const process = await api.stopModule(name);
      // Update the process in the list
      const index = moduleProcesses.value.findIndex((m) => m.name === name);
      if (index !== -1) {
        moduleProcesses.value[index] = process;
      }
      return process;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      processLoading.value = false;
    }
  }

  async function restartModule(name: ModuleName) {
    processLoading.value = true;
    error.value = null;
    try {
      const process = await api.restartModule(name);
      // Update the process in the list
      const index = moduleProcesses.value.findIndex((m) => m.name === name);
      if (index !== -1) {
        moduleProcesses.value[index] = process;
      }
      return process;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      processLoading.value = false;
    }
  }

  function getModuleProcess(name: ModuleName): ModuleProcessInfo | undefined {
    return moduleProcesses.value.find((m) => m.name === name);
  }

  return {
    // State
    modules,
    moduleProcesses,
    loading,
    processLoading,
    error,
    // Getters
    moduleCount,
    modulesByType,
    // Actions
    loadModules,
    loadModule,
    getModule,
    clearError,
    // Process Control Actions
    loadModuleProcesses,
    loadModuleProcess,
    startModule,
    stopModule,
    restartModule,
    getModuleProcess,
  };
});
