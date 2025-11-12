import { useEffect, useState } from 'react';
import { errorsAPI } from '../services/api';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  XCircle,
  Clock,
  FileText,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';

export default function Errors() {
  const [errors, setErrors] = useState<any>({ workflows: [], agents: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'workflows' | 'agents'>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadErrors();
  }, []);

  const loadErrors = async () => {
    try {
      const { data } = await errorsAPI.list();
      setErrors(data);
    } catch (error) {
      console.error('Failed to load errors:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const filteredWorkflows =
    filter === 'all' || filter === 'workflows' ? errors.workflows : [];
  const filteredAgents =
    filter === 'all' || filter === 'agents' ? errors.agents : [];

  const totalErrors = errors.workflows.length + errors.agents.length;

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
          <h2 className="text-3xl font-bold text-gray-900">Errors & Issues</h2>
          <p className="mt-1 text-sm text-gray-500">
            Track and debug workflow and agent failures
          </p>
        </div>
        <button
          onClick={loadErrors}
          className="btn btn-secondary flex items-center"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card bg-red-50 border-2 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-900">Total Errors</p>
              <p className="text-3xl font-bold text-red-600">{totalErrors}</p>
            </div>
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
        </div>
        <div className="card bg-orange-50 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-900">
                Failed Workflows
              </p>
              <p className="text-3xl font-bold text-orange-600">
                {errors.workflows.length}
              </p>
            </div>
            <XCircle className="h-10 w-10 text-orange-400" />
          </div>
        </div>
        <div className="card bg-yellow-50 border-2 border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-900">
                Failed Agents
              </p>
              <p className="text-3xl font-bold text-yellow-600">
                {errors.agents.length}
              </p>
            </div>
            <Clock className="h-10 w-10 text-yellow-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-2">
        <Filter className="h-5 w-5 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Filter:</span>
        {(['all', 'workflows', 'agents'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {totalErrors === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-green-100 p-4 mb-4">
            <AlertCircle className="h-12 w-12 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No errors found
          </h3>
          <p className="text-gray-500 text-center max-w-md">
            All workflows and agents are running smoothly. This page will
            display any failures or issues as they occur.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Failed Workflows */}
          {filteredWorkflows.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <XCircle className="h-5 w-5 mr-2 text-red-600" />
                Failed Workflows ({filteredWorkflows.length})
              </h3>
              <div className="space-y-3">
                {filteredWorkflows.map((workflow: any) => (
                  <div
                    key={`workflow-${workflow.id}`}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <div
                      className="bg-gray-50 p-4 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => toggleExpand(`workflow-${workflow.id}`)}
                    >
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="flex-shrink-0 mt-1">
                          {expandedItems.has(`workflow-${workflow.id}`) ? (
                            <ChevronDown className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3">
                            <h4 className="font-semibold text-gray-900">
                              Workflow #{workflow.id}
                            </h4>
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              Failed
                            </span>
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize">
                              {workflow.workflow_type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Failed on{' '}
                            {format(
                              new Date(workflow.updated_at),
                              'MMM d, yyyy HH:mm:ss'
                            )}
                          </p>
                          {workflow.task_description && (
                            <p className="text-sm text-gray-700 mt-2">
                              {workflow.task_description}
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/workflows/${workflow.id}`}
                          className="text-primary-600 hover:text-primary-900 text-sm font-medium flex items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Details
                          <FileText className="h-4 w-4 ml-1" />
                        </Link>
                      </div>
                    </div>
                    {expandedItems.has(`workflow-${workflow.id}`) && (
                      <div className="bg-white p-4 border-t border-gray-200">
                        <h5 className="text-sm font-medium text-gray-900 mb-2">
                          Error Details:
                        </h5>
                        <pre className="text-xs bg-red-50 text-red-900 p-3 rounded-md overflow-x-auto border border-red-200">
                          {workflow.error || 'No error message available'}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Agents */}
          {filteredAgents.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Clock className="h-5 w-5 mr-2 text-yellow-600" />
                Failed Agents ({filteredAgents.length})
              </h3>
              <div className="space-y-3">
                {filteredAgents.map((agent: any) => (
                  <div
                    key={`agent-${agent.id}`}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <div
                      className="bg-gray-50 p-4 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => toggleExpand(`agent-${agent.id}`)}
                    >
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="flex-shrink-0 mt-1">
                          {expandedItems.has(`agent-${agent.id}`) ? (
                            <ChevronDown className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3">
                            <h4 className="font-semibold text-gray-900 capitalize">
                              {agent.agent_type} Agent
                            </h4>
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              Failed
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Workflow #{agent.workflow_id} • Failed on{' '}
                            {format(
                              new Date(agent.updated_at),
                              'MMM d, yyyy HH:mm:ss'
                            )}
                          </p>
                          {agent.summary && (
                            <p className="text-sm text-gray-700 mt-2">
                              {agent.summary}
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/workflows/${agent.workflow_id}`}
                          className="text-primary-600 hover:text-primary-900 text-sm font-medium flex items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Workflow
                          <FileText className="h-4 w-4 ml-1" />
                        </Link>
                      </div>
                    </div>
                    {expandedItems.has(`agent-${agent.id}`) && (
                      <div className="bg-white p-4 border-t border-gray-200">
                        <h5 className="text-sm font-medium text-gray-900 mb-2">
                          Error Details:
                        </h5>
                        <pre className="text-xs bg-red-50 text-red-900 p-3 rounded-md overflow-x-auto border border-red-200">
                          {agent.error || 'No error message available'}
                        </pre>
                        {agent.output && (
                          <>
                            <h5 className="text-sm font-medium text-gray-900 mb-2 mt-4">
                              Agent Output:
                            </h5>
                            <pre className="text-xs bg-gray-50 text-gray-900 p-3 rounded-md overflow-x-auto border border-gray-200 max-h-64">
                              {agent.output}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Banner */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">
              About Error Tracking
            </h4>
            <p className="text-sm text-blue-700 mt-1">
              This page displays all failed workflows and agent executions.
              Click on any item to expand and view detailed error messages.
              Failed workflows can be retried from their detail pages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
