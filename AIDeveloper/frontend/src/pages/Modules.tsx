import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { modulesAPI, moduleProcessesAPI, chainsAPI, modulePluginsAPI } from '../services/api';
import type { ModuleProcessInfo } from '../types/aicontroller';
import ModuleLogViewer from '../components/ModuleLogViewer';
import ImportModuleModal from '../components/ImportModuleModal';
import DeploymentActionModal from '../components/DeploymentActionModal';
import {
  Package,
  GitBranch,
  FileText,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  Square,
  Loader2,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Save,
  Copy,
  Pencil,
  X,
  Lock,
} from 'lucide-react';
import { format } from 'date-fns';

interface Module {
  name: string;
  path: string;
  description?: string;
  version?: string;
  category?: string;
  project?: string;
  tags?: string[];
  hasGit: boolean;
  gitStatus?: {
    branch: string;
    lastCommit?: {
      hash: string;
      message: string;
      date: string;
    };
    isDirty: boolean;
  };
  hasPackageJson: boolean;
  packageInfo?: {
    name: string;
    version: string;
    description?: string;
  };
  hasPrompts: boolean;
  prompts?: string[];
}

type GroupByMode = 'none' | 'category' | 'project';

export default function Modules() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [moduleStats, setModuleStats] = useState<any>(null);
  const [moduleCommits, setModuleCommits] = useState<any[]>([]);
  const [deploymentLoading, setDeploymentLoading] = useState<string | null>(null);
  const [moduleStatus, setModuleStatus] = useState<{ [key: string]: boolean }>({});
  const [moduleProcesses, setModuleProcesses] = useState<ModuleProcessInfo[]>([]);
  const [aiControllerAvailable, setAIControllerAvailable] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);
  const [autoLoadSettings, setAutoLoadSettings] = useState<{ [key: string]: boolean }>({});
  const [groupBy, setGroupBy] = useState<GroupByMode>('project');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [moduleEnvVars, setModuleEnvVars] = useState<any[]>([]);
  const [envVarChanges, setEnvVarChanges] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [savingEnvVars, setSavingEnvVars] = useState(false);
  const [moduleManifest, setModuleManifest] = useState<any>(null);
  const [packageScripts, setPackageScripts] = useState<Record<string, string> | null>(null);
  const [moduleEnvStatus, setModuleEnvStatus] = useState<any>(null);
  const [envEditMode, setEnvEditMode] = useState(false);

  // Deployment action modal state
  const [deploymentModalOpen, setDeploymentModalOpen] = useState(false);
  const [deploymentAction, setDeploymentAction] = useState<string>('');
  const [deploymentModuleName, setDeploymentModuleName] = useState<string>('');
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [deploymentRunning, setDeploymentRunning] = useState(false);
  const [deploymentError, setDeploymentError] = useState<string | undefined>(undefined);
  const [deploymentSuccess, setDeploymentSuccess] = useState(false);
  const deploymentPollInterval = useRef<number | null>(null);

  // Branch switching state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchModalModule, setBranchModalModule] = useState<string>('');
  const [availableBranches, setAvailableBranches] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState(false);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      const { data } = await modulesAPI.list();
      setModules(data.modules);

      // Load auto-load settings for each module
      const autoLoadMap: { [key: string]: boolean } = {};
      for (const module of data.modules) {
        try {
          const autoLoadRes = await modulesAPI.getAutoLoad(module.name);
          autoLoadMap[module.name] = autoLoadRes.data.autoLoad;
        } catch (error) {
          // If error, assume false
          autoLoadMap[module.name] = false;
        }
      }
      setAutoLoadSettings(autoLoadMap);

      // Try to load module processes from AIController
      try {
        const isHealthy = await chainsAPI.health();
        setAIControllerAvailable(isHealthy);

        if (isHealthy) {
          const processesResponse = await moduleProcessesAPI.list();
          setModuleProcesses(processesResponse.data.data);

          // Update module status based on processes
          const statusMap: { [key: string]: boolean } = {};
          processesResponse.data.data.forEach((proc) => {
            statusMap[proc.name] = proc.status === 'running';
          });
          setModuleStatus(statusMap);
        }
      } catch (error) {
        console.error('AIController not available:', error);
        setAIControllerAvailable(false);
      }
    } catch (error) {
      console.error('Failed to load modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModuleDetails = async (module: Module) => {
    setSelectedModule(module);
    // Reset env edit mode when switching modules
    setEnvEditMode(false);
    setEnvVarChanges({});
    setVisibleSecrets(new Set());
    try {
      const [statsRes, commitsRes, statusRes, manifestRes, scriptsRes, envStatusRes] = await Promise.all([
        modulesAPI.getStats(module.name),
        modulesAPI.getCommits(module.name, 10),
        modulesAPI.getStatus(module.name),
        modulePluginsAPI.getManifest(module.name),
        modulesAPI.getScripts(module.name).catch(() => ({ data: { success: false, scripts: null } })),
        modulePluginsAPI.getEnvStatus(module.name).catch(() => ({ data: { success: false, data: null } })),
      ]);
      setModuleStats(statsRes.data.stats);
      setModuleCommits(commitsRes.data.commits);
      setModuleStatus((prev) => ({
        ...prev,
        [module.name]: statusRes.data.isRunning,
      }));

      // Load module manifest (for other module.json info)
      if (manifestRes.data.success) {
        setModuleManifest(manifestRes.data.data);
      } else {
        setModuleManifest(null);
      }

      // Load package.json scripts for deployment actions
      if (scriptsRes.data.success && scriptsRes.data.scripts) {
        setPackageScripts(scriptsRes.data.scripts);
      } else {
        setPackageScripts(null);
      }

      // Load module env status (new per-module env system)
      if (envStatusRes.data.success && envStatusRes.data.data) {
        setModuleEnvStatus(envStatusRes.data.data);
        // Also populate legacy moduleEnvVars for backward compatibility
        setModuleEnvVars(envStatusRes.data.data.envVars.map((ev: any) => ({
          key: ev.key,
          value: ev.value,
          module: module.name,
          definition: {
            description: ev.comment || '',
            required: false,
            secret: ev.key.toLowerCase().includes('key') ||
                    ev.key.toLowerCase().includes('secret') ||
                    ev.key.toLowerCase().includes('password'),
          },
        })));
      } else {
        setModuleEnvStatus(null);
        setModuleEnvVars([]);
      }
    } catch (error) {
      console.error('Failed to load module details:', error);
      setModuleManifest(null);
      setPackageScripts(null);
      setModuleEnvStatus(null);
    }
  };

  const handleBulkAction = async (action: 'start' | 'stop' | 'restart') => {
    try {
      setBulkActionLoading(action);
      const modulesToControl = modules.filter(m => m.hasPackageJson);

      // Separate AIController from other modules
      const aiController = modulesToControl.find(m => m.name === 'AIController');
      const otherModules = modulesToControl.filter(m => m.name !== 'AIController');

      if (action === 'restart') {
        // Stop all (other modules first, then AIController last)
        for (const module of otherModules) {
          if (moduleStatus[module.name]) {
            try {
              await handleDeploymentAction('stop', module.name);
            } catch (error) {
              console.error(`Failed to stop ${module.name}:`, error);
            }
          }
        }

        if (aiController && moduleStatus[aiController.name]) {
          try {
            await handleDeploymentAction('stop', aiController.name);
          } catch (error) {
            console.error(`Failed to stop ${aiController.name}:`, error);
          }
        }

        // Wait for all to stop
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start all (AIController first, then other modules)
        if (aiController) {
          try {
            await handleDeploymentAction('start', aiController.name);
            // Give AIController time to initialize
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (error) {
            console.error(`Failed to start ${aiController.name}:`, error);
          }
        }

        for (const module of otherModules) {
          try {
            await handleDeploymentAction('start', module.name);
          } catch (error) {
            console.error(`Failed to start ${module.name}:`, error);
          }
        }
      } else if (action === 'start') {
        // Start AIController first if not running
        if (aiController && !moduleStatus[aiController.name]) {
          try {
            await handleDeploymentAction('start', aiController.name);
            // Give AIController time to initialize
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (error) {
            console.error(`Failed to start ${aiController.name}:`, error);
          }
        }

        // Start all other modules that aren't running
        for (const module of otherModules) {
          if (!moduleStatus[module.name]) {
            try {
              await handleDeploymentAction('start', module.name);
            } catch (error) {
              console.error(`Failed to start ${module.name}:`, error);
            }
          }
        }
      } else if (action === 'stop') {
        // Stop other modules first
        for (const module of otherModules) {
          if (moduleStatus[module.name]) {
            try {
              await handleDeploymentAction('stop', module.name);
            } catch (error) {
              console.error(`Failed to stop ${module.name}:`, error);
            }
          }
        }

        // Stop AIController last
        if (aiController && moduleStatus[aiController.name]) {
          try {
            await handleDeploymentAction('stop', aiController.name);
          } catch (error) {
            console.error(`Failed to stop ${aiController.name}:`, error);
          }
        }
      }

      // Reload module statuses
      await loadModules();
      toast.success(`Bulk ${action} operation completed. Check individual modules for status.`);
    } catch (error: any) {
      console.error(`Bulk ${action} failed:`, error);
      toast.error(`Error during bulk ${action}: ${error.message}`);
    } finally {
      setBulkActionLoading(null);
    }
  };

  const pollDeploymentLogs = async (moduleName: string) => {
    try {
      const { data } = await modulesAPI.getLogs(moduleName, 200);
      setDeploymentLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to poll deployment logs:', error);
    }
  };

  const startDeploymentModal = (action: string, moduleName: string) => {
    setDeploymentAction(action);
    setDeploymentModuleName(moduleName);
    setDeploymentLogs([]);
    setDeploymentRunning(true);
    setDeploymentError(undefined);
    setDeploymentSuccess(false);
    setDeploymentModalOpen(true);

    // Start polling for logs
    pollDeploymentLogs(moduleName);
    deploymentPollInterval.current = window.setInterval(() => {
      pollDeploymentLogs(moduleName);
    }, 1000);
  };

  const stopDeploymentModal = (success: boolean, error?: string) => {
    setDeploymentRunning(false);
    setDeploymentSuccess(success);
    setDeploymentError(error);

    // Stop polling
    if (deploymentPollInterval.current) {
      clearInterval(deploymentPollInterval.current);
      deploymentPollInterval.current = null;
    }

    // Final log fetch
    pollDeploymentLogs(deploymentModuleName);
  };

  const closeDeploymentModal = () => {
    setDeploymentModalOpen(false);
    if (deploymentPollInterval.current) {
      clearInterval(deploymentPollInterval.current);
      deploymentPollInterval.current = null;
    }
  };

  const handleDeploymentAction = async (
    action: string, // Any script name from module.json
    moduleName: string
  ) => {
    try {
      setDeploymentLoading(action);

      let result;
      let shouldShowModal = !['start', 'stop', 'restart'].includes(action);

      // Show modal for operations that produce logs
      if (shouldShowModal) {
        startDeploymentModal(action, moduleName);
      }

      // Handle restart action
      if (action === 'restart') {
        // First stop the module
        await handleDeploymentAction('stop', moduleName);
        // Wait a moment for the stop to complete
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Then start it again
        await handleDeploymentAction('start', moduleName);
        return;
      }

      // AIController is special - it can't start itself through its own API
      // For AIController, always use the old backend API
      const isAIController = moduleName === 'AIController';

      // Find the module to check its project
      const module = modules.find(m => m.name === moduleName);
      const isExNihiloModule = module?.project === 'Ex Nihilo';

      // Use AIController's process management API for start/stop of Ex Nihilo modules only
      if ((action === 'start' || action === 'stop') && aiControllerAvailable && !isAIController && isExNihiloModule) {
        try {
          if (action === 'start') {
            result = await moduleProcessesAPI.start(moduleName);
          } else {
            result = await moduleProcessesAPI.stop(moduleName);
          }

          if (result.data.success) {
            toast.success(`${action} operation succeeded: ${result.data.message}`);
          } else {
            toast.error(`${action} operation failed: ${result.data.message}`);
          }

          // Reload module processes to get updated status
          const processesResponse = await moduleProcessesAPI.list();
          setModuleProcesses(processesResponse.data.data);

          const statusMap: { [key: string]: boolean} = {};
          processesResponse.data.data.forEach((proc) => {
            statusMap[proc.name] = proc.status === 'running';
          });
          setModuleStatus(statusMap);

          return;
        } catch (error: any) {
          console.error(`Failed to ${action} module via AIController:`, error);
          toast.error(`Error: ${error.response?.data?.error || error.message}`);
          return;
        }
      }

      // Use generic runScript API for all script operations
      if (action === 'start') {
        result = await modulesAPI.start(moduleName);
      } else if (action === 'stop') {
        result = await modulesAPI.stop(moduleName);
      } else {
        // For all other scripts, use the generic runScript endpoint
        result = await modulesAPI.runScript(moduleName, action);
      }

      if (shouldShowModal) {
        // Wait a bit for the operation to complete and logs to be available
        await new Promise(resolve => setTimeout(resolve, 2000));
        stopDeploymentModal(true);
      } else {
        toast.success(`${action} operation started: ${result.data.message}`);
      }

      // Update module status after start/stop
      if (action === 'start' || action === 'stop') {
        const statusRes = await modulesAPI.getStatus(moduleName);
        setModuleStatus((prev) => ({
          ...prev,
          [moduleName]: statusRes.data.isRunning,
        }));
      }
    } catch (error: any) {
      console.error(`Failed to ${action} module:`, error);
      const errorMessage = error.response?.data?.error || error.message;

      if (['install', 'build', 'test', 'typecheck'].includes(action)) {
        stopDeploymentModal(false, errorMessage);
      } else {
        toast.error(`Error: ${errorMessage}`);
      }
    } finally {
      setDeploymentLoading(null);
    }
  };

  const handleToggleAutoLoad = async (moduleName: string) => {
    try {
      const currentSetting = autoLoadSettings[moduleName] || false;
      const newSetting = !currentSetting;

      await modulesAPI.setAutoLoad(moduleName, newSetting);

      setAutoLoadSettings((prev) => ({
        ...prev,
        [moduleName]: newSetting,
      }));

      toast.success(`Auto-load ${newSetting ? 'enabled' : 'disabled'} for ${moduleName}`);
    } catch (error: any) {
      console.error('Failed to toggle auto-load:', error);
      toast.error(`Failed to update auto-load: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleEnvVarChange = (key: string, value: string) => {
    setEnvVarChanges((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSaveEnvVars = async () => {
    if (Object.keys(envVarChanges).length === 0) {
      toast.error('No changes to save');
      return;
    }

    if (!selectedModule) {
      toast.error('No module selected');
      return;
    }

    setSavingEnvVars(true);
    try {
      // Use the new per-module env API
      await modulePluginsAPI.updateModuleEnv(selectedModule.name, envVarChanges);
      toast.success('Environment variables updated successfully');
      setEnvVarChanges({});
      // Reload env status
      const envStatusRes = await modulePluginsAPI.getEnvStatus(selectedModule.name);
      if (envStatusRes.data.success && envStatusRes.data.data) {
        setModuleEnvStatus(envStatusRes.data.data);
        setModuleEnvVars(envStatusRes.data.data.envVars.map((ev: any) => ({
          key: ev.key,
          value: ev.value,
          module: selectedModule.name,
          definition: {
            description: ev.comment || '',
            required: false,
            secret: ev.key.toLowerCase().includes('key') ||
                    ev.key.toLowerCase().includes('secret') ||
                    ev.key.toLowerCase().includes('password'),
          },
        })));
      }
    } catch (error: any) {
      console.error('Failed to save env vars:', error);
      toast.error(error.response?.data?.message || 'Failed to save environment variables');
    } finally {
      setSavingEnvVars(false);
    }
  };

  const getEnvVarValue = (envVar: any): string => {
    if (envVar.key in envVarChanges) {
      return envVarChanges[envVar.key];
    }
    return envVar.value || envVar.definition.defaultValue || '';
  };

  const handleOpenBranchModal = async (moduleName: string) => {
    setBranchModalModule(moduleName);
    setBranchModalOpen(true);
    setLoadingBranches(true);
    try {
      const response = await fetch(`/api/modules/${moduleName}/branches`);
      const data = await response.json();
      setAvailableBranches(data.branches || []);
    } catch (error) {
      console.error('Failed to load branches:', error);
      toast.error('Failed to load branches');
      setAvailableBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleSwitchBranch = async (branch: string) => {
    setSwitchingBranch(true);
    try {
      const response = await fetch(`/api/modules/${branchModalModule}/branches/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.hasUncommittedChanges) {
          toast.error(data.error);
        } else {
          toast.error(data.error || 'Failed to switch branch');
        }
        return;
      }

      toast.success(`Switched to ${branch}`);
      setBranchModalOpen(false);
      // Reload modules to get updated branch info
      await loadModules();
    } catch (error) {
      console.error('Failed to switch branch:', error);
      toast.error('Failed to switch branch');
    } finally {
      setSwitchingBranch(false);
    }
  };

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const groupModules = (): Record<string, Module[]> => {
    if (groupBy === 'none') {
      return { 'All Modules': modules };
    }

    const grouped: Record<string, Module[]> = {};

    modules.forEach((module) => {
      let groupKey: string;

      if (groupBy === 'category') {
        groupKey = module.category || 'Uncategorized';
      } else if (groupBy === 'project') {
        groupKey = module.project || 'No Project';
      } else {
        groupKey = 'All Modules';
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(module);
    });

    // Sort groups alphabetically, but keep "Uncategorized"/"No Project" at the end
    const sortedGroups: Record<string, Module[]> = {};
    const regularGroups = Object.keys(grouped)
      .filter((key) => key !== 'Uncategorized' && key !== 'No Project')
      .sort();
    const specialGroups = Object.keys(grouped)
      .filter((key) => key === 'Uncategorized' || key === 'No Project')
      .sort();

    [...regularGroups, ...specialGroups].forEach((key) => {
      sortedGroups[key] = grouped[key];
    });

    return sortedGroups;
  };

  const groupedModules = groupModules();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Modules</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage ex_nihilo modules and their configurations
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Group By Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="none">None</option>
              <option value="category">Category</option>
              <option value="project">Project</option>
            </select>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Import Module</span>
          </button>
          <div className="bg-primary-100 text-primary-700 px-4 py-2 rounded-full text-sm font-medium">
            {modules.length} Module{modules.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Import Module Modal */}
      <ImportModuleModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => loadModules()}
      />

      {/* Deployment Action Modal */}
      <DeploymentActionModal
        isOpen={deploymentModalOpen}
        onClose={closeDeploymentModal}
        moduleName={deploymentModuleName}
        action={deploymentAction}
        logs={deploymentLogs}
        isRunning={deploymentRunning}
        error={deploymentError}
        success={deploymentSuccess}
      />

      {/* Bulk Actions */}
      {modules.filter(m => m.hasPackageJson).length > 0 && (
        <div className="card bg-gradient-to-r from-primary-50 to-blue-50 border-2 border-primary-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Bulk Actions</h3>
              <p className="text-sm text-gray-600">Control all modules at once</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="text-sm text-gray-600">
                {Object.values(moduleStatus).filter(Boolean).length} / {modules.filter(m => m.hasPackageJson).length} Running
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleBulkAction('start')}
              disabled={bulkActionLoading !== null}
              className="btn btn-primary flex items-center justify-center"
            >
              {bulkActionLoading === 'start' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start All
            </button>

            <button
              onClick={() => handleBulkAction('restart')}
              disabled={bulkActionLoading !== null}
              className="btn bg-orange-500 text-white hover:bg-orange-600 flex items-center justify-center"
            >
              {bulkActionLoading === 'restart' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Restart All
            </button>

            <button
              onClick={() => handleBulkAction('stop')}
              disabled={bulkActionLoading !== null}
              className="btn bg-red-500 text-white hover:bg-red-600 flex items-center justify-center"
            >
              {bulkActionLoading === 'stop' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Stop All
            </button>
          </div>

          <div className="mt-3 p-3 bg-white rounded-lg border border-primary-100">
            <p className="text-xs text-gray-600">
              <strong>Note:</strong> Bulk actions will be performed sequentially on all modules with package.json.
              {aiControllerAvailable && ' AIController will be started first and stopped last.'}
            </p>
          </div>
        </div>
      )}

      {modules.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Modules Found
          </h3>
          <p className="text-gray-500">
            Create modules in the modules directory to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Modules List */}
          <div className="lg:col-span-1 space-y-4">
            {Object.entries(groupedModules).map(([groupName, groupModules]) => {
              const isCollapsed = collapsedGroups.has(groupName);
              const showGroupHeader = groupBy !== 'none';

              return (
                <div key={groupName} className="space-y-2">
                  {/* Group Header */}
                  {showGroupHeader && (
                    <button
                      onClick={() => toggleGroupCollapse(groupName)}
                      className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <Package className="h-4 w-4 text-gray-600" />
                        <span className="font-semibold text-gray-900">{groupName}</span>
                        <span className="text-sm text-gray-500">({groupModules.length})</span>
                      </div>
                      <div className="text-gray-600">
                        {isCollapsed ? '▶' : '▼'}
                      </div>
                    </button>
                  )}

                  {/* Group Modules */}
                  {!isCollapsed && groupModules.map((module) => (
                    <div
                      key={module.name}
                      className={`card cursor-pointer transition-all ${
                        selectedModule?.name === module.name
                          ? 'ring-2 ring-primary-500 shadow-lg'
                          : 'hover:shadow-md'
                      } ${showGroupHeader ? 'ml-2' : ''}`}
                      onClick={() => loadModuleDetails(module)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-primary-100 rounded-lg">
                            <Package className="h-6 w-6 text-primary-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {module.name}
                            </h3>
                            {module.version && (
                              <p className="text-xs text-gray-500">v{module.version}</p>
                            )}
                          </div>
                        </div>
                        {module.gitStatus?.isDirty && (
                          <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-medium">
                            Modified
                          </span>
                        )}
                      </div>

                      {module.description && (
                        <p className="text-sm text-gray-600 mb-3">{module.description}</p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          {module.hasGit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBranchModal(module.name);
                              }}
                              className="flex items-center space-x-1 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Switch branch"
                            >
                              <GitBranch className="h-3 w-3" />
                              <span>{module.gitStatus?.branch || 'main'}</span>
                            </button>
                          )}
                          {module.hasPrompts && (
                            <div className="flex items-center space-x-1">
                              <FileText className="h-3 w-3" />
                              <span>{module.prompts?.length || 0} prompts</span>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAutoLoad(module.name);
                          }}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            autoLoadSettings[module.name]
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title={`Click to ${autoLoadSettings[module.name] ? 'disable' : 'enable'} auto-load`}
                        >
                          {autoLoadSettings[module.name] ? '✓ Auto-load' : 'Auto-load'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Module Details */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedModule ? (
              <div className="card text-center py-12">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  Select a module to view details
                </p>
              </div>
            ) : (
              <>
                {/* Module Info Card */}
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {selectedModule.name}
                  </h3>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Version</p>
                      <p className="font-medium">{selectedModule.version || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Git Branch</p>
                      <p className="font-medium">
                        {selectedModule.gitStatus?.branch || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <div className="flex items-center space-x-2">
                        {selectedModule.gitStatus?.isDirty ? (
                          <>
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                            <span className="font-medium text-yellow-700">
                              Modified
                            </span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="font-medium text-green-700">Clean</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Prompts</p>
                      <p className="font-medium">
                        {selectedModule.prompts?.length || 0}
                      </p>
                    </div>
                  </div>

                  {selectedModule.description && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700">
                        {selectedModule.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Deployment Actions */}
                {selectedModule.hasPackageJson && (
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Deployment Actions
                      </h3>
                      {moduleStatus[selectedModule.name] ? (
                        <div className="flex items-center space-x-2">
                          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
                          <span className="text-sm text-green-600 font-medium">
                            Running
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <div className="h-2 w-2 rounded-full bg-gray-400"></div>
                          <span className="text-sm text-gray-600 font-medium">
                            Stopped
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedModule.name === 'AIController' && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-blue-900 mb-1">
                              Central Process Manager
                            </p>
                            <p className="text-blue-700">
                              AIController manages all other Ex Nihilo modules. Start it first, then use it to control other modules.
                              Start/stop operations for AIController use the backend API.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!aiControllerAvailable && selectedModule.name !== 'AIController' && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-yellow-900 mb-1">
                              AIController Not Running
                            </p>
                            <p className="text-yellow-700">
                              For centralized process management, start AIController first.
                              Otherwise, modules will be managed through the legacy backend API.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {/* Dynamic script buttons from package.json */}
                      {packageScripts ? (
                        <>
                          {/* Install button - always show for modules with package.json */}
                          <button
                            onClick={() => handleDeploymentAction('install', selectedModule.name)}
                            disabled={deploymentLoading !== null}
                            className="btn btn-secondary flex items-center justify-center"
                          >
                            {deploymentLoading === 'install' ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Package className="h-4 w-4 mr-2" />
                            )}
                            Install
                          </button>

                          {/* Regular scripts (exclude start, stop, dev, predev, prestart, install) */}
                          {Object.entries(packageScripts)
                            .filter(([scriptName]) => !['start', 'stop', 'dev', 'predev', 'prestart', 'install'].includes(scriptName))
                            .map(([scriptName]) => {
                              // Capitalize first letter of script name
                              const label = scriptName.charAt(0).toUpperCase() + scriptName.slice(1);

                              return (
                                <button
                                  key={scriptName}
                                  onClick={() => handleDeploymentAction(scriptName, selectedModule.name)}
                                  disabled={deploymentLoading !== null}
                                  className="btn btn-secondary flex items-center justify-center"
                                >
                                  {deploymentLoading === scriptName ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4 mr-2" />
                                  )}
                                  {label}
                                </button>
                              );
                            })}

                          {/* Start/Stop/Restart buttons */}
                          {packageScripts.start && (
                            moduleStatus[selectedModule.name] ? (
                              <>
                                <button
                                  onClick={() => handleDeploymentAction('restart', selectedModule.name)}
                                  disabled={deploymentLoading !== null}
                                  className="btn bg-orange-500 text-white hover:bg-orange-600 flex items-center justify-center"
                                >
                                  {deploymentLoading === 'restart' ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                  )}
                                  Restart Server
                                </button>
                                <button
                                  onClick={() => handleDeploymentAction('stop', selectedModule.name)}
                                  disabled={deploymentLoading !== null}
                                  className="btn bg-red-500 text-white hover:bg-red-600 flex items-center justify-center col-span-2"
                                >
                                  {deploymentLoading === 'stop' ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Square className="h-4 w-4 mr-2" />
                                  )}
                                  Stop Server
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleDeploymentAction('start', selectedModule.name)}
                                disabled={deploymentLoading !== null}
                                className="btn btn-primary flex items-center justify-center col-span-2"
                              >
                                {deploymentLoading === 'start' ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4 mr-2" />
                                )}
                                Start Server
                              </button>
                            )
                          )}
                        </>
                      ) : (
                        /* Error message for modules without package.json */
                        <div className="col-span-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start">
                            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0" />
                            <div>
                              <h4 className="text-sm font-semibold text-yellow-800 mb-1">No package.json scripts</h4>
                              <p className="text-sm text-yellow-700">
                                This module does not have a <code className="px-1 py-0.5 bg-yellow-100 rounded">package.json</code> file with scripts.
                                Deployment actions are read from the package.json scripts section.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700 mb-2">
                        {aiControllerAvailable && selectedModule.project === 'Ex Nihilo'
                          ? 'Start/stop operations are managed by AIController for centralized process management.'
                          : 'Deployment actions execute npm scripts in the module directory. Ports are automatically cleaned up before starting.'}
                      </p>
                      {aiControllerAvailable && selectedModule.project === 'Ex Nihilo' && moduleProcesses.find((p) => p.name === selectedModule.name) && (
                        <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-blue-700">
                          <p className="font-medium mb-1">Process Info:</p>
                          <div className="space-y-1">
                            {(() => {
                              const proc = moduleProcesses.find((p) => p.name === selectedModule.name);
                              if (!proc) return null;
                              return (
                                <>
                                  <p>Port: {proc.port}</p>
                                  <p>Status: {proc.status}</p>
                                  {proc.pid && <p>PID: {proc.pid}</p>}
                                  {proc.restartCount > 0 && <p>Restarts: {proc.restartCount}</p>}
                                  {proc.portConflict?.inUse && (
                                    <p className="text-yellow-700">⚠ Port conflict detected (PID: {proc.portConflict.pid})</p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Module Stats */}
                {moduleStats && (
                  <div className="card">
                    <div className="flex items-center space-x-2 mb-4">
                      <BarChart3 className="h-5 w-5 text-primary-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Statistics
                      </h3>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-sm text-blue-600 font-medium">
                          Total Files
                        </p>
                        <p className="text-2xl font-bold text-blue-700">
                          {moduleStats.totalFiles}
                        </p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <p className="text-sm text-green-600 font-medium">
                          Total Lines
                        </p>
                        <p className="text-2xl font-bold text-green-700">
                          {moduleStats.totalLines.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <p className="text-sm text-purple-600 font-medium">
                          File Types
                        </p>
                        <p className="text-2xl font-bold text-purple-700">
                          {Object.keys(moduleStats.filesByType).length}
                        </p>
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        File Distribution
                      </p>
                      <div className="space-y-2">
                        {Object.entries(moduleStats.filesByType)
                          .sort(([, a]: any, [, b]: any) => b - a)
                          .slice(0, 5)
                          .map(([type, count]: any) => (
                            <div key={type} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">.{type}</span>
                              <span className="font-medium text-gray-900">{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Commits */}
                {moduleCommits.length > 0 && (
                  <div className="card">
                    <div className="flex items-center space-x-2 mb-4">
                      <Clock className="h-5 w-5 text-primary-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Recent Commits
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {moduleCommits.map((commit) => (
                        <div
                          key={commit.hash}
                          className="border-l-4 border-primary-500 pl-4 py-2"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">
                                {commit.message}
                              </p>
                              <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                                <span className="font-mono">{commit.shortHash}</span>
                                <span>•</span>
                                <span>{commit.author}</span>
                                <span>•</span>
                                <span>
                                  {format(new Date(commit.date), 'MMM d, yyyy HH:mm')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Console Logs */}
                <ModuleLogViewer
                  moduleName={selectedModule.name}
                  isRunning={moduleStatus[selectedModule.name] || false}
                />

                {/* Environment Variables - Compact Secure View */}
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Lock className="h-4 w-4 text-gray-500" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Environment Variables
                      </h3>
                      {moduleEnvVars.length > 0 && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {moduleEnvVars.length} var{moduleEnvVars.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Sync from example button */}
                      {moduleEnvStatus?.missingFromExample?.length > 0 && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await modulePluginsAPI.syncEnvExample(selectedModule.name);
                              if (res.data.success) {
                                toast.success(res.data.message);
                                const envStatusRes = await modulePluginsAPI.getEnvStatus(selectedModule.name);
                                if (envStatusRes.data.success) {
                                  setModuleEnvStatus(envStatusRes.data.data);
                                  setModuleEnvVars(envStatusRes.data.data.envVars.map((ev: any) => ({
                                    key: ev.key,
                                    value: ev.value,
                                    module: selectedModule.name,
                                    definition: {
                                      description: ev.comment || '',
                                      required: false,
                                      secret: ev.key.toLowerCase().includes('key') ||
                                              ev.key.toLowerCase().includes('secret') ||
                                              ev.key.toLowerCase().includes('password'),
                                    },
                                  })));
                                }
                              }
                            } catch (error: any) {
                              toast.error(error.response?.data?.message || 'Failed to sync');
                            }
                          }}
                          className="text-xs px-2 py-1 text-orange-600 hover:bg-orange-50 rounded"
                          title="Add missing variables from .env.example"
                        >
                          +{moduleEnvStatus.missingFromExample.length} missing
                        </button>
                      )}
                      {/* Edit/Cancel button */}
                      {moduleEnvVars.length > 0 && (
                        envEditMode ? (
                          <div className="flex items-center space-x-2">
                            {Object.keys(envVarChanges).length > 0 && (
                              <button
                                onClick={handleSaveEnvVars}
                                disabled={savingEnvVars}
                                className="text-xs px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 flex items-center"
                              >
                                {savingEnvVars ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3 mr-1" />
                                )}
                                Save
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setEnvEditMode(false);
                                setEnvVarChanges({});
                                setVisibleSecrets(new Set());
                              }}
                              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded flex items-center"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEnvEditMode(true)}
                            className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded flex items-center"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Status bar */}
                  {moduleEnvStatus && (
                    <div className="mb-3 flex items-center space-x-3 text-xs text-gray-500">
                      <span className={moduleEnvStatus.hasEnvFile ? 'text-green-600' : 'text-yellow-600'}>
                        {moduleEnvStatus.hasEnvFile ? '● .env' : '○ no .env'}
                      </span>
                      {moduleEnvStatus.hasEnvExample && (
                        <span className="text-gray-400">● .env.example</span>
                      )}
                    </div>
                  )}

                  {/* Copy example prompt */}
                  {moduleEnvStatus && !moduleEnvStatus.hasEnvFile && moduleEnvStatus.hasEnvExample && (
                    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm flex items-center justify-between">
                      <span className="text-yellow-800">No .env file. Copy from example?</span>
                      <button
                        onClick={async () => {
                          try {
                            const res = await modulePluginsAPI.copyEnvExample(selectedModule.name);
                            if (res.data.success) {
                              toast.success('Copied .env.example to .env');
                              const envStatusRes = await modulePluginsAPI.getEnvStatus(selectedModule.name);
                              if (envStatusRes.data.success) {
                                setModuleEnvStatus(envStatusRes.data.data);
                                setModuleEnvVars(envStatusRes.data.data.envVars.map((ev: any) => ({
                                  key: ev.key,
                                  value: ev.value,
                                  module: selectedModule.name,
                                  definition: {
                                    description: ev.comment || '',
                                    required: false,
                                    secret: ev.key.toLowerCase().includes('key') ||
                                            ev.key.toLowerCase().includes('secret') ||
                                            ev.key.toLowerCase().includes('password'),
                                  },
                                })));
                              }
                            }
                          } catch (error: any) {
                            toast.error(error.response?.data?.message || 'Failed to copy');
                          }
                        }}
                        className="text-xs px-2 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 flex items-center"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </button>
                    </div>
                  )}

                  {/* Compact variable list */}
                  {moduleEnvVars.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                          {moduleEnvVars.map((envVar) => {
                            const value = getEnvVarValue(envVar);
                            const isSecret = envVar.definition.secret;
                            const isVisible = visibleSecrets.has(envVar.key);
                            const hasChanged = envVar.key in envVarChanges;

                            // Mask the value for display
                            const displayValue = isSecret && !isVisible
                              ? (value ? '••••••••' : '')
                              : value;

                            return (
                              <tr key={envVar.key} className={`${hasChanged ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-2 font-mono text-xs text-gray-700 whitespace-nowrap w-1/3">
                                  {envVar.key}
                                  {isSecret && <Lock className="h-3 w-3 inline ml-1 text-gray-400" />}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {envEditMode ? (
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type={isSecret && !isVisible ? 'password' : 'text'}
                                        value={value}
                                        onChange={(e) => handleEnvVarChange(envVar.key, e.target.value)}
                                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                                        placeholder="Enter value..."
                                      />
                                      {isSecret && (
                                        <button
                                          type="button"
                                          onClick={() => toggleSecretVisibility(envVar.key)}
                                          className="text-gray-400 hover:text-gray-600 p-1"
                                        >
                                          {isVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <span className={`font-mono text-xs ${!value ? 'text-gray-400 italic' : ''}`}>
                                      {displayValue || '(empty)'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs py-2">No environment variables in .env file.</p>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Quick Actions
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedModule.hasPrompts && (
                      <button
                        onClick={() =>
                          navigate(`/modules/${selectedModule.name}/prompts`)
                        }
                        className="btn btn-secondary flex items-center justify-center"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Prompts
                      </button>
                    )}
                    <button
                      onClick={() =>
                        navigate(`/modules/${selectedModule.name}/commits`)
                      }
                      className="btn btn-secondary flex items-center justify-center"
                    >
                      <GitBranch className="h-4 w-4 mr-2" />
                      View History
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Branch Switcher Modal */}
      {branchModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center">
                <GitBranch className="h-5 w-5 mr-2" />
                Switch Branch - {branchModalModule}
              </h3>
              <button
                onClick={() => setBranchModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingBranches ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableBranches.map((branch) => (
                  <button
                    key={branch.name}
                    onClick={() => !branch.isCurrent && handleSwitchBranch(branch.name)}
                    disabled={branch.isCurrent || switchingBranch}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      branch.isCurrent
                        ? 'bg-blue-50 border-blue-200 cursor-default'
                        : switchingBranch
                        ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                        : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <GitBranch className={`h-4 w-4 ${branch.isCurrent ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className={`font-medium ${branch.isCurrent ? 'text-blue-600' : 'text-gray-900'}`}>
                          {branch.name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {branch.isCurrent && (
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                        )}
                        {branch.isLocal && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            Local
                          </span>
                        )}
                        {branch.isRemote && !branch.isLocal && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            Remote
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {availableBranches.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No branches available</p>
                )}
              </div>
            )}

            {switchingBranch && (
              <div className="mt-4 flex items-center justify-center space-x-2 text-blue-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Switching branch...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
