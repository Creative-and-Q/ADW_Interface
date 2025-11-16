import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
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

function CreateWorkflowModal({ onClose, onSuccess }: any) {
  const [workflowType, setWorkflowType] = useState('feature');
  const [targetModule, setTargetModule] = useState('AIDeveloper');
  const [taskDescription, setTaskDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modules, setModules] = useState<string[]>(['AIDeveloper']);
  const [loadingModules, setLoadingModules] = useState(true);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      const { data } = await modulesAPI.list();
      const moduleNames = data.modules.map((m: any) => m.name);
      setModules(['AIDeveloper', ...moduleNames]);
    } catch (error) {
      console.error('Failed to load modules:', error);
      toast.error('Failed to load modules');
    } finally {
      setLoadingModules(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await workflowsAPI.create({ workflowType, targetModule, taskDescription });
      toast.success('Workflow created successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to create workflow:', error);
      toast.error('Failed to create workflow');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Create New Workflow
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
            </select>
          </div>
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
          <div className="flex justify-end space-x-3">
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
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
