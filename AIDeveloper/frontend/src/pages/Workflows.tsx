import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { workflowsAPI } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';

export default function Workflows() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
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
      // Handle "ongoing" filter specially - includes multiple statuses
      let params: any = {};
      if (filter === 'ongoing') {
        // Filter on client side for ongoing workflows
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

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      completed: { icon: CheckCircle, class: 'badge-success', label: 'Completed' },
      failed: { icon: XCircle, class: 'badge-error', label: 'Failed' },
      pending: { icon: Clock, class: 'badge-gray', label: 'Pending' },
      planning: { icon: Play, class: 'badge-info', label: 'Planning' },
      coding: { icon: Play, class: 'badge-info', label: 'Coding' },
      testing: { icon: Play, class: 'badge-info', label: 'Testing' },
      reviewing: { icon: Play, class: 'badge-info', label: 'Reviewing' },
      documenting: { icon: Play, class: 'badge-info', label: 'Documenting' },
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`badge ${config.class} inline-flex items-center`}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </span>
    );
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
          <h2 className="text-3xl font-bold text-gray-900">Workflows</h2>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and manage all development workflows
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={loadWorkflows}
            className="btn btn-secondary flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-2">
        {['all', 'ongoing', 'pending', 'completed', 'failed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            } ${f === 'ongoing' ? 'border-blue-500 border-2' : ''}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'ongoing' && (
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
            )}
          </button>
        ))}
      </div>

      {/* Workflows List */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workflows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <AlertCircle className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                    <p>No workflows found</p>
                  </td>
                </tr>
              ) : (
                workflows.map((workflow) => (
                  <tr key={workflow.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{workflow.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="capitalize">{workflow.workflow_type}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(workflow.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(workflow.created_at), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link
                        to={`/workflows/${workflow.id}`}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWorkflowModal onClose={() => setShowCreateModal(false)} onSuccess={loadWorkflows} />
      )}
    </div>
  );
}

function CreateWorkflowModal({ onClose, onSuccess }: any) {
  const [workflowType, setWorkflowType] = useState('feature');
  const [taskDescription, setTaskDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await workflowsAPI.create({ workflowType, taskDescription });
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              Task Description
            </label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={4}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Describe what you want the AI to build..."
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
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
