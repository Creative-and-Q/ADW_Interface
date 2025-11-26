import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, GitBranch, CheckCircle, XCircle } from 'lucide-react';
import { chainsAPI } from '../services/api';
import type { Statistics } from '../types/aicontroller';

export default function AIControllerStatsWidget() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const isHealthy = await chainsAPI.health();
      if (!isHealthy) {
        throw new Error('AIController not running');
      }
      const response = await chainsAPI.getStats();
      setStats(response.data.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load stats');
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
      <div className="flex items-center justify-center h-24">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <XCircle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
        <p className="text-sm text-gray-500">AIController not available</p>
        <Link to="/modules" className="text-xs text-primary-600 hover:underline">
          Start module
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Link2 className="h-4 w-4 text-primary-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Chains</p>
            <p className="text-lg font-bold">{stats?.total_chains || 0}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <GitBranch className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Executions</p>
            <p className="text-lg font-bold">{stats?.total_executions || 0}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm text-gray-600">Success Rate</span>
        </div>
        <span className="text-lg font-bold text-green-600">{successRate}%</span>
      </div>
      <Link
        to="/chains"
        className="block text-center text-sm text-primary-600 hover:text-primary-700"
      >
        View AI Chains →
      </Link>
    </div>
  );
}
