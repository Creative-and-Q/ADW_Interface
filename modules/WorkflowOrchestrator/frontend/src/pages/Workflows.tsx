import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
// Import from AIDeveloper frontend (shared dependencies)
// Path: from modules/WorkflowOrchestrator/frontend/pages/ to AIDeveloper/frontend/src/
// @ts-ignore - Dynamic import path resolved at build time
import { workflowsAPI, modulesAPI } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  Plus,
  RefreshCw,
  BarChart3,
  LayoutGrid,
  AlertCircle,
} from 'lucide-react';
import WorkflowMetrics from '../components/WorkflowMetrics';
import WorkflowCharts from '../components/WorkflowCharts';
import WorkflowCard from '../components/WorkflowCard';

type ViewMode = 'overview' | 'grid';

export default function Workflows() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { socket } = useWebSocket();

  useEffect(() => {
    loadWorkflows();
  }, [filter]);

  useEffect(() => {
    if (socket) {
      socket.on('workflows:updated', () => {
        loadWorkflows();
      });
    }
  }, [socket]);

  const loadWorkflows = async () => {
    try {
      let params: any = {};
      if (filter === 'ongoing') {
        const { data } = await workflowsAPI.list({});
        const ongoingStatuses = ['planning', 'coding', 'testing', 'reviewing', 'documenting'];
        setWorkflows(data.workflows.filter((w: any) => ongoingStatuses.includes(w.status)));
      } else {
        params = filter !== 'all' ? { status: filter } : {};
        const { data } = await workflowsAPI.list(params);
        setWorkflows(data.workflows);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and manage all development workflows with real-time insights
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={loadWorkflows}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex space-x-1">
          <button
            onClick={() => setViewMode('overview')}
            className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview & Analytics
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'grid'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            All Workflows
          </button>
        </div>

        {/* Filters (only show in grid view) */}
        {viewMode === 'grid' && (
          <div className="flex space-x-2">
            {['all', 'ongoing', 'pending', 'completed', 'failed'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'ongoing' && filter === f && (
                  <span className="ml-1 inline-block h-2 w-2 rounded-full bg-white animate-pulse"></span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content based on view mode */}
      {viewMode === 'overview' ? (
        <div className="space-y-6">
          {/* Metrics Cards */}
          <WorkflowMetrics workflows={workflows} />

          {/* Charts */}
          <WorkflowCharts workflows={workflows} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Workflow Grid */}
          {workflows.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500">No workflows found</p>
              <p className="text-sm text-gray-400 mt-1">
                Create a new workflow to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {workflows.map((workflow) => (
                <WorkflowCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWorkflowModal onClose={() => setShowCreateModal(false)} onSuccess={loadWorkflows} />
      )}
    </div>
  );
}

interface ModulePortInfo {
  name: string;
  port?: number;
  frontendPort?: number;
}

function CreateWorkflowModal({ onClose, onSuccess }: any) {
  const [workflowType, setWorkflowType] = useState('feature');
  const [targetModule, setTargetModule] = useState('AIDeveloper');
  const [taskDescription, setTaskDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modules, setModules] = useState<string[]>(['AIDeveloper']);
  const [modulePortInfo, setModulePortInfo] = useState<ModulePortInfo[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);

  // New Module specific fields
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleDescription, setNewModuleDescription] = useState('');
  const [newModuleType, setNewModuleType] = useState<'service' | 'library'>('library');
  const [newModulePort, setNewModulePort] = useState('');
  const [newModuleHasFrontend, setNewModuleHasFrontend] = useState(false);
  const [newModuleFrontendPort, setNewModuleFrontendPort] = useState('');
  const [newModuleRelated, setNewModuleRelated] = useState<string[]>([]);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      const { data } = await modulesAPI.list();
      const moduleNames = data.modules.map((m: any) => m.name);
      setModules(['AIDeveloper', ...moduleNames]);

      // Extract port information from modules
      const portInfo: ModulePortInfo[] = [
        { name: 'AIDeveloper', port: 3000, frontendPort: 5173 }
      ];
      data.modules.forEach((m: any) => {
        if (m.port || m.frontend?.port) {
          portInfo.push({
            name: m.name,
            port: m.port,
            frontendPort: m.frontend?.port
          });
        }
      });
      setModulePortInfo(portInfo);
    } catch (error) {
      console.error('Failed to load modules:', error);
      toast.error('Failed to load modules');
    } finally {
      setLoadingModules(false);
    }
  };

  // Check for port conflicts
  const getPortConflict = (port: string, type: 'service' | 'frontend'): string | null => {
    if (!port) return null;
    const portNum = parseInt(port);
    if (isNaN(portNum)) return null;

    for (const module of modulePortInfo) {
      if (type === 'service' && module.port === portNum) {
        return module.name;
      }
      if (type === 'frontend' && module.frontendPort === portNum) {
        return module.name;
      }
      // Also check cross-conflicts (service port matching frontend port)
      if (type === 'service' && module.frontendPort === portNum) {
        return `${module.name} (frontend)`;
      }
      if (type === 'frontend' && module.port === portNum) {
        return `${module.name} (service)`;
      }
    }
    return null;
  };

  const servicePortConflict = getPortConflict(newModulePort, 'service');
  const frontendPortConflict = getPortConflict(newModuleFrontendPort, 'frontend');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (workflowType === 'new_module') {
        // Call the new module creation endpoint
        await workflowsAPI.createNewModule({
          moduleName: newModuleName,
          description: newModuleDescription,
          moduleType: newModuleType,
          port: newModulePort ? parseInt(newModulePort) : undefined,
          hasFrontend: newModuleHasFrontend,
          frontendPort: newModuleFrontendPort ? parseInt(newModuleFrontendPort) : undefined,
          relatedModules: newModuleRelated,
          taskDescription: taskDescription || undefined,
        });
        toast.success(`Module ${newModuleName} created successfully`);
      } else {
        await workflowsAPI.create({ workflowType, targetModule, taskDescription });
        toast.success('Workflow created successfully');
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create workflow:', error);
      toast.error(error.response?.data?.error || 'Failed to create workflow');
    } finally {
      setSubmitting(false);
    }
  };

  const isNewModule = workflowType === 'new_module';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-lg w-full p-6 ${isNewModule ? 'max-w-2xl' : 'max-w-md'}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {isNewModule ? 'Create New Module' : 'Create New Workflow'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Type
            </label>
            <select
              value={workflowType}
              onChange={(e) => setWorkflowType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="feature">Feature</option>
              <option value="bugfix">Bugfix</option>
              <option value="refactor">Refactor</option>
              <option value="documentation">Documentation</option>
              <option value="review">Review</option>
              <option value="new_module">New Module</option>
            </select>
          </div>

          {isNewModule ? (
            <>
              {/* New Module specific fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Module Name *
                  </label>
                  <input
                    type="text"
                    value={newModuleName}
                    onChange={(e) => setNewModuleName(e.target.value)}
                    required
                    placeholder="DataProcessor"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">PascalCase (e.g., DataProcessor)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Module Type *
                  </label>
                  <select
                    value={newModuleType}
                    onChange={(e) => setNewModuleType(e.target.value as 'service' | 'library')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="library">Library (importable)</option>
                    <option value="service">Service (runs standalone)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Module Description *
                </label>
                <input
                  type="text"
                  value={newModuleDescription}
                  onChange={(e) => setNewModuleDescription(e.target.value)}
                  required
                  placeholder="Processes and transforms data for analysis"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {newModuleType === 'service' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Service Port
                  </label>
                  <input
                    type="number"
                    value={newModulePort}
                    onChange={(e) => setNewModulePort(e.target.value)}
                    placeholder="3050"
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      servicePortConflict
                        ? 'border-red-300 focus:ring-red-500 bg-red-50'
                        : 'border-gray-300 focus:ring-blue-500'
                    }`}
                  />
                  {servicePortConflict && (
                    <p className="mt-1 text-xs text-red-600">
                      Port conflict with {servicePortConflict}
                    </p>
                  )}
                  {/* Used ports reference */}
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <p className="font-medium text-gray-700 mb-1">Used service ports:</p>
                    <div className="flex flex-wrap gap-1">
                      {modulePortInfo.filter(m => m.port).map(m => (
                        <span key={m.name} className="px-2 py-0.5 bg-gray-200 rounded text-gray-600">
                          {m.port} ({m.name})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newModuleHasFrontend}
                    onChange={(e) => setNewModuleHasFrontend(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Include Frontend</span>
                </label>
                {newModuleHasFrontend && (
                  <div>
                    <input
                      type="number"
                      value={newModuleFrontendPort}
                      onChange={(e) => setNewModuleFrontendPort(e.target.value)}
                      placeholder="Frontend port (e.g., 5180)"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        frontendPortConflict
                          ? 'border-red-300 focus:ring-red-500 bg-red-50'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {frontendPortConflict && (
                      <p className="mt-1 text-xs text-red-600">
                        Port conflict with {frontendPortConflict}
                      </p>
                    )}
                    {/* Used frontend ports reference */}
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                      <p className="font-medium text-gray-700 mb-1">Used frontend ports:</p>
                      <div className="flex flex-wrap gap-1">
                        {modulePortInfo.filter(m => m.frontendPort).map(m => (
                          <span key={m.name} className="px-2 py-0.5 bg-gray-200 rounded text-gray-600">
                            {m.frontendPort} ({m.name})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Related Modules
                </label>
                <select
                  multiple
                  value={newModuleRelated}
                  onChange={(e) => setNewModuleRelated(Array.from(e.target.selectedOptions, o => o.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  size={3}
                >
                  {modules.map((module) => (
                    <option key={module} value={module}>{module}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Hold Ctrl/Cmd to select multiple</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Task (optional)
                </label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="After creating the module scaffold, implement..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  If provided, a follow-up feature workflow will be queued
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Standard workflow fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Module
                </label>
                <select
                  value={targetModule}
                  onChange={(e) => setTargetModule(e.target.value)}
                  disabled={loadingModules}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {modules.map((module) => (
                    <option key={module} value={module}>
                      {module}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Agents will only be allowed to edit files in this module
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Description
                </label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={4}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what you want the AI to build..."
                />
              </div>
            </>
          )}

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                (servicePortConflict || frontendPortConflict)
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              disabled={submitting || !!(servicePortConflict || frontendPortConflict)}
            >
              {submitting ? 'Creating...' : isNewModule ? 'Create Module' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

