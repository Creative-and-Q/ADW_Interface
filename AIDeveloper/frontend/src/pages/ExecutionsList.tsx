import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Clock,
  CheckCircle,
  XCircle,
  Link2,
  Filter,
  User,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { chainsAPI } from '../services/api';
import type { ExecutionResult } from '../types/aicontroller';
import { formatDistanceToNow, format } from 'date-fns';

export default function ExecutionsList() {
  const [searchParams] = useSearchParams();
  const chainIdFilter = searchParams.get('chainId');

  const [executions, setExecutions] = useState<ExecutionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [userId] = useState('default-user'); // TODO: Get from auth context

  useEffect(() => {
    loadExecutions();
  }, [chainIdFilter]);

  const loadExecutions = async () => {
    try {
      let response;
      if (chainIdFilter) {
        response = await chainsAPI.getChainExecutions(parseInt(chainIdFilter), 100);
      } else {
        response = await chainsAPI.getUserExecutions(userId, 100);
      }
      setExecutions(response.data.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load executions:', err);
      setError(err.message || 'Failed to load executions');
    } finally {
      setLoading(false);
    }
  };

  const filteredExecutions = executions.filter((execution) => {
    if (statusFilter === 'success') return execution.success;
    if (statusFilter === 'failed') return !execution.success;
    return true;
  });

  const stats = {
    total: executions.length,
    successful: executions.filter((e) => e.success).length,
    failed: executions.filter((e) => !e.success).length,
    avgDuration:
      executions.length > 0
        ? Math.round(
            executions.reduce((sum, e) => sum + e.total_duration_ms, 0) / executions.length
          )
        : 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 sm:px-0">
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-2">
                Failed to Load Executions
              </h3>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              <button onClick={loadExecutions} className="btn btn-secondary">
                Try Again
              </button>
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
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Execution History</h2>
          <p className="mt-1 text-sm text-gray-500">
            {chainIdFilter ? 'Chain execution history' : 'All chain executions'}
          </p>
        </div>
        {chainIdFilter && (
          <Link to="/chains/executions" className="btn btn-secondary">
            View All Executions
          </Link>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Total</h3>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Successful</h3>
              <p className="text-3xl font-bold text-green-600">{stats.successful}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-red-100 rounded-lg">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Failed</h3>
              <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Avg Duration</h3>
              <p className="text-3xl font-bold text-gray-900">{stats.avgDuration}ms</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center space-x-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex space-x-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('success')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'success'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Successful ({stats.successful})
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'failed'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Failed ({stats.failed})
            </button>
          </div>
        </div>
      </div>

      {/* Executions List */}
      {filteredExecutions.length === 0 ? (
        <div className="card text-center py-12">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No executions found</h3>
          <p className="text-gray-600 mb-4">
            {statusFilter !== 'all'
              ? `No ${statusFilter === 'success' ? 'successful' : 'failed'} executions`
              : 'No executions have been run yet'}
          </p>
          <Link to="/chains/list" className="btn btn-primary inline-flex items-center">
            <Link2 className="h-4 w-4 mr-2" />
            View Chains
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExecutions.map((execution) => (
            <Link
              key={execution.id}
              to={`/chains/executions/${execution.id}`}
              className="card hover:shadow-md transition-shadow block"
            >
              <div className="flex items-center justify-between">
                {/* Status & Info */}
                <div className="flex items-center space-x-4 flex-1">
                  {execution.success ? (
                    <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {execution.chain_name || `Chain #${execution.chain_id}`}
                      </h3>
                      {execution.chain_id && (
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          ID: {execution.chain_id}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <User className="h-4 w-4" />
                        <span>{execution.user_id}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Link2 className="h-4 w-4" />
                        <span>{execution.steps.length} steps</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>{execution.total_duration_ms}ms</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>
                          {formatDistanceToNow(new Date(execution.completed_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>

                    {execution.error && (
                      <div className="mt-2 text-sm text-red-600 truncate">
                        Error: {execution.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Timestamp & Arrow */}
                <div className="flex items-center space-x-4 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {format(new Date(execution.completed_at), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(execution.completed_at), 'h:mm a')}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="card bg-gray-50">
        <div className="text-sm text-gray-600">
          Showing {filteredExecutions.length} of {executions.length} execution
          {executions.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
