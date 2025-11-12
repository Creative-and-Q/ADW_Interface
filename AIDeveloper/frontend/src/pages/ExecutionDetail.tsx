import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Link2,
  User,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Play,
  Code,
} from 'lucide-react';
import { chainsAPI } from '../services/api';
import type { ExecutionResult } from '../types/aicontroller';
import { format } from 'date-fns';

export default function ExecutionDetail() {
  const { id } = useParams<{ id: string }>();
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (id) {
      loadExecution(parseInt(id));
    }
  }, [id]);

  const loadExecution = async (executionId: number) => {
    try {
      const response = await chainsAPI.getExecution(executionId);
      setExecution(response.data.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load execution:', err);
      setError(err.message || 'Failed to load execution');
    } finally {
      setLoading(false);
    }
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (execution) {
      if (expandedSteps.size === execution.steps.length) {
        setExpandedSteps(new Set());
      } else {
        setExpandedSteps(new Set(execution.steps.map((s) => s.step_id)));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div className="px-4 sm:px-0">
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-2">Execution Not Found</h3>
              <p className="text-sm text-red-700 mb-4">{error || 'Execution not found'}</p>
              <Link to="/chains/executions" className="btn btn-secondary">
                Back to Executions
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/chains/executions" className="btn btn-secondary btn-sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              {execution.chain_name || `Chain #${execution.chain_id}`}
            </h2>
            <p className="mt-1 text-sm text-gray-500">Execution #{execution.id}</p>
          </div>
        </div>
        {execution.success ? (
          <CheckCircle className="h-8 w-8 text-green-600" />
        ) : (
          <XCircle className="h-8 w-8 text-red-600" />
        )}
      </div>

      {/* Summary Card */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
            <div className="flex items-center space-x-2">
              {execution.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-600">Success</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-600">Failed</span>
                </>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Duration</h3>
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-400" />
              <span className="font-semibold text-gray-900">{execution.total_duration_ms}ms</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Steps</h3>
            <div className="flex items-center space-x-2">
              <Link2 className="h-5 w-5 text-gray-400" />
              <span className="font-semibold text-gray-900">
                {execution.steps.length} step{execution.steps.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">User</h3>
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-gray-400" />
              <span className="font-semibold text-gray-900">{execution.user_id}</span>
            </div>
          </div>
        </div>

        {execution.error && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-red-900 mb-1">Error</h3>
                <p className="text-sm text-red-700">{execution.error}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
          <button onClick={toggleAll} className="text-sm text-primary-600 hover:text-primary-700">
            {expandedSteps.size === execution.steps.length ? 'Collapse All' : 'Expand All'}
          </button>
        </div>

        <div className="space-y-3">
          {execution.steps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.step_id);
            const isLast = index === execution.steps.length - 1;

            return (
              <div key={step.step_id} className="relative">
                {/* Timeline connector */}
                {!isLast && (
                  <div className="absolute left-4 top-12 w-0.5 h-full bg-gray-200"></div>
                )}

                {/* Step Card */}
                <div
                  className={`border rounded-lg p-4 ${
                    step.success
                      ? 'border-gray-200 bg-white'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => toggleStep(step.step_id)}
                  >
                    <div className="flex items-start space-x-3 flex-1">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {step.success ? (
                          <CheckCircle className="h-6 w-6 text-green-600" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-600" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-1">
                          <h4 className="font-semibold text-gray-900">
                            Step {index + 1}: {step.step_name || step.step_id}
                          </h4>
                          {step.step_type === 'chain_call' && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                              Chain Call
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          {step.module && (
                            <span className="capitalize">{step.module}</span>
                          )}
                          {step.endpoint && <span>{step.endpoint}</span>}
                          {step.method && (
                            <span className="font-mono text-xs">{step.method}</span>
                          )}
                          <span>{step.duration_ms}ms</span>
                        </div>

                        {step.error && (
                          <div className="mt-2 text-sm text-red-600">{step.error}</div>
                        )}
                      </div>
                    </div>

                    {/* Expand Toggle */}
                    <button className="flex-shrink-0 ml-2 p-1 hover:bg-gray-100 rounded">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                      {/* Request */}
                      {step.request && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <Play className="h-4 w-4 text-gray-400" />
                            <h5 className="text-sm font-medium text-gray-700">Request</h5>
                          </div>
                          <div className="bg-gray-50 rounded p-3 text-xs font-mono overflow-x-auto">
                            <pre>{JSON.stringify(step.request, null, 2)}</pre>
                          </div>
                        </div>
                      )}

                      {/* Response */}
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Code className="h-4 w-4 text-gray-400" />
                          <h5 className="text-sm font-medium text-gray-700">Response</h5>
                        </div>
                        <div className="bg-gray-50 rounded p-3 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
                          <pre>{JSON.stringify(step.response, null, 2)}</pre>
                        </div>
                      </div>

                      {/* Routing Info */}
                      {step.routing_evaluated && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <Link2 className="h-4 w-4 text-gray-400" />
                            <h5 className="text-sm font-medium text-gray-700">Routing</h5>
                          </div>
                          <div className="bg-blue-50 rounded p-3 text-sm">
                            {step.routing_matched ? (
                              <div>
                                <p className="text-blue-900 font-medium">
                                  Routing rule matched
                                </p>
                                <p className="text-blue-700">
                                  Action: {step.routing_action_taken}
                                </p>
                              </div>
                            ) : (
                              <p className="text-blue-700">No routing rules matched</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Output */}
      {execution.output && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Output</h3>
          <div className="bg-gray-50 rounded p-4 text-sm font-mono overflow-x-auto">
            <pre>{JSON.stringify(execution.output, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Started:</span>
            <span className="ml-2 font-medium text-gray-900">
              {format(new Date(execution.started_at), 'MMM d, yyyy h:mm:ss a')}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Completed:</span>
            <span className="ml-2 font-medium text-gray-900">
              {format(new Date(execution.completed_at), 'MMM d, yyyy h:mm:ss a')}
            </span>
          </div>
          {execution.chain_id && (
            <div>
              <span className="text-gray-500">Chain ID:</span>
              <Link
                to={`/chains/builder/${execution.chain_id}`}
                className="ml-2 font-medium text-primary-600 hover:text-primary-700"
              >
                #{execution.chain_id}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
