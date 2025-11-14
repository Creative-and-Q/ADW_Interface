import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { modulesAPI, moduleProcessesAPI, chainsAPI } from '../services/api';
import type { ModuleProcessInfo } from '../types/aicontroller';
import ModuleLogViewer from '../components/ModuleLogViewer';
import {
  Package,
  GitBranch,
  FileText,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  Hammer,
  TestTube,
  Play,
  Square,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';

interface Module {
  name: string;
  path: string;
  description?: string;
  version?: string;
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

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      const { data } = await modulesAPI.list();
      setModules(data.modules);

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
    try {
      const [statsRes, commitsRes, statusRes] = await Promise.all([
        modulesAPI.getStats(module.name),
        modulesAPI.getCommits(module.name, 10),
        modulesAPI.getStatus(module.name),
      ]);
      setModuleStats(statsRes.data.stats);
      setModuleCommits(commitsRes.data.commits);
      setModuleStatus((prev) => ({
        ...prev,
        [module.name]: statusRes.data.isRunning,
      }));
    } catch (error) {
      console.error('Failed to load module details:', error);
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

  const handleDeploymentAction = async (
    action: 'install' | 'build' | 'test' | 'start' | 'stop' | 'restart',
    moduleName: string
  ) => {
    try {
      setDeploymentLoading(action);

      let result;

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

      // Use AIController's process management API for start/stop of OTHER modules
      if ((action === 'start' || action === 'stop') && aiControllerAvailable && !isAIController) {
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

      // Fall back to old API for other operations
      switch (action) {
        case 'install':
          result = await modulesAPI.install(moduleName);
          break;
        case 'build':
          result = await modulesAPI.build(moduleName);
          break;
        case 'test':
          result = await modulesAPI.test(moduleName);
          break;
        case 'start':
          result = await modulesAPI.start(moduleName);
          break;
        case 'stop':
          result = await modulesAPI.stop(moduleName);
          break;
      }

      toast.success(`${action} operation started: ${result.data.message}`);

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
      toast.error(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeploymentLoading(null);
    }
  };

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
          <div className="bg-primary-100 text-primary-700 px-4 py-2 rounded-full text-sm font-medium">
            {modules.length} Module{modules.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

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
            {modules.map((module) => (
              <div
                key={module.name}
                className={`card cursor-pointer transition-all ${
                  selectedModule?.name === module.name
                    ? 'ring-2 ring-primary-500 shadow-lg'
                    : 'hover:shadow-md'
                }`}
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

                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  {module.hasGit && (
                    <div className="flex items-center space-x-1">
                      <GitBranch className="h-3 w-3" />
                      <span>{module.gitStatus?.branch || 'main'}</span>
                    </div>
                  )}
                  {module.hasPrompts && (
                    <div className="flex items-center space-x-1">
                      <FileText className="h-3 w-3" />
                      <span>{module.prompts?.length || 0} prompts</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
                      <button
                        onClick={() =>
                          handleDeploymentAction('install', selectedModule.name)
                        }
                        disabled={deploymentLoading !== null}
                        className="btn btn-secondary flex items-center justify-center"
                      >
                        {deploymentLoading === 'install' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Install Dependencies
                      </button>

                      <button
                        onClick={() =>
                          handleDeploymentAction('build', selectedModule.name)
                        }
                        disabled={deploymentLoading !== null}
                        className="btn btn-secondary flex items-center justify-center"
                      >
                        {deploymentLoading === 'build' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Hammer className="h-4 w-4 mr-2" />
                        )}
                        Build Module
                      </button>

                      <button
                        onClick={() =>
                          handleDeploymentAction('test', selectedModule.name)
                        }
                        disabled={deploymentLoading !== null}
                        className="btn btn-secondary flex items-center justify-center"
                      >
                        {deploymentLoading === 'test' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4 mr-2" />
                        )}
                        Run Tests
                      </button>

                      {moduleStatus[selectedModule.name] ? (
                        <>
                          <button
                            onClick={() =>
                              handleDeploymentAction('restart', selectedModule.name)
                            }
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
                            onClick={() =>
                              handleDeploymentAction('stop', selectedModule.name)
                            }
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
                          onClick={() =>
                            handleDeploymentAction('start', selectedModule.name)
                          }
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
                      )}
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700 mb-2">
                        {aiControllerAvailable
                          ? 'Start/stop operations are managed by AIController for centralized process management.'
                          : 'Deployment actions execute npm scripts in the module directory. Ports are automatically cleaned up before starting.'}
                      </p>
                      {aiControllerAvailable && moduleProcesses.find((p) => p.name === selectedModule.name) && (
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
                {moduleStatus[selectedModule.name] && (
                  <ModuleLogViewer
                    moduleName={selectedModule.name}
                    isRunning={moduleStatus[selectedModule.name]}
                  />
                )}

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
    </div>
  );
}
