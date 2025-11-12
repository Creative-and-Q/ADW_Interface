import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Link2,
  GitBranch,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  List,
  Bot,
} from 'lucide-react';
import { chainsAPI } from '../services/api';
import type { Statistics } from '../types/aicontroller';
import { formatDistanceToNow } from 'date-fns';

export default function Chains() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiControllerAvailable, setAIControllerAvailable] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Check if AIController is running
      const isHealthy = await chainsAPI.health();
      setAIControllerAvailable(isHealthy);

      if (!isHealthy) {
        throw new Error('AIController backend is not running');
      }

      // Load statistics
      const response = await chainsAPI.getStats();
      setStats(response.data.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load chain statistics:', err);
      setError(err.message || 'Failed to connect to AIController');
      setAIControllerAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  const successRate = stats
    ? stats.total_executions > 0
      ? Math.round((stats.successful_executions / stats.total_executions) * 100)
      : 0
    : 0;

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
          <h2 className="text-3xl font-bold text-gray-900">AI Chains</h2>
          <p className="mt-1 text-sm text-gray-500">
            Create and execute multi-step AI workflows with conditional logic
          </p>
        </div>
        {aiControllerAvailable && (
          <Link to="/chains/builder" className="btn btn-primary flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            Create Chain
          </Link>
        )}
      </div>

      {error ? (
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-start space-x-3">
            <XCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                AIController Not Running
              </h3>
              <p className="text-sm text-yellow-700 mb-4">
                The AIController module needs to be running to view chain statistics and
                manage workflows.
              </p>
              <div className="space-y-2">
                <p className="text-sm text-yellow-700">To start AIController:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-700 ml-4">
                  <li>Go to the Modules page</li>
                  <li>Select AIController</li>
                  <li>Click "Start Server" in the Deployment Actions section</li>
                  <li>Wait for the server to start (check running status indicator)</li>
                  <li>Return to this page and refresh</li>
                </ol>
              </div>
              <Link
                to="/modules"
                className="btn btn-secondary mt-4 inline-flex items-center"
              >
                Go to Modules Page
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-primary-100 rounded-lg">
                  <Link2 className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Total Chains</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats?.total_chains || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <GitBranch className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Total Executions</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats?.total_executions || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
                  <p className="text-3xl font-bold text-green-600 mt-1">{successRate}%</p>
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
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats?.average_duration_ms || 0}ms
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* About AIController */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              About AI Chains
            </h3>
            <p className="text-gray-700 mb-4">
              AI Chains allow you to create complex workflows that chain together multiple
              module operations. Each chain consists of steps that execute sequentially or
              conditionally based on previous results.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Chain Builder</h4>
                <p className="text-sm text-gray-600">
                  Visual interface for creating and editing workflow chains with drag-and-drop
                  step management and variable templating.
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Execution History</h4>
                <p className="text-sm text-gray-600">
                  Track all chain executions, view detailed logs, and analyze performance
                  metrics for debugging and optimization.
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Module Integration</h4>
                <p className="text-sm text-gray-600">
                  Seamlessly integrate with all Ex Nihilo modules including CharacterController,
                  ItemController, SceneController, and more.
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">AI Agent</h4>
                <p className="text-sm text-gray-600">
                  Natural language interface for creating chains. Describe your workflow in
                  plain English and let AI build the chain for you.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Link
                to="/chains/list"
                className="btn btn-secondary flex items-center justify-center"
              >
                <List className="h-4 w-4 mr-2" />
                View All Chains
              </Link>
              <Link
                to="/chains/builder"
                className="btn btn-secondary flex items-center justify-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Chain
              </Link>
              <Link
                to="/chains/executions"
                className="btn btn-secondary flex items-center justify-center"
              >
                <Clock className="h-4 w-4 mr-2" />
                Execution History
              </Link>
              <Link
                to="/chains/ai-agent"
                className="btn btn-secondary flex items-center justify-center"
              >
                <Bot className="h-4 w-4 mr-2" />
                AI Agent
              </Link>
            </div>
          </div>

          {/* Recent Executions */}
          {stats?.recent_executions && stats.recent_executions.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Recent Executions</h3>
                <Link
                  to="/chains/executions"
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  View All →
                </Link>
              </div>
              <div className="space-y-2">
                {stats.recent_executions.slice(0, 5).map((execution) => (
                  <Link
                    key={execution.id}
                    to={`/chains/executions/${execution.id}`}
                    className="block p-3 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {execution.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{execution.chain_name}</p>
                          <p className="text-sm text-gray-500">
                            {execution.steps.length} steps • {execution.total_duration_ms}ms
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">
                          {formatDistanceToNow(new Date(execution.completed_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
