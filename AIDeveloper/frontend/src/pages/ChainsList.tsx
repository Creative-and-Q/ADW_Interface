import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Link2,
  Search,
  Plus,
  Trash2,
  Eye,
  Play,
  Clock,
  User,
  AlertCircle,
} from 'lucide-react';
import { chainsAPI } from '../services/api';
import type { ChainConfiguration } from '../types/aicontroller';
import { formatDistanceToNow } from 'date-fns';

export default function ChainsList() {
  const [chains, setChains] = useState<ChainConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    loadChains();
  }, []);

  const loadChains = async () => {
    try {
      const response = await chainsAPI.list();
      setChains(response.data.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load chains:', err);
      setError(err.message || 'Failed to load chains');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (chainId: number) => {
    if (deleteConfirm !== chainId) {
      setDeleteConfirm(chainId);
      return;
    }

    try {
      await chainsAPI.delete(chainId);
      setChains(chains.filter((c) => c.id !== chainId));
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error('Failed to delete chain:', err);
      alert(`Failed to delete chain: ${err.message}`);
    }
  };

  const filteredChains = chains.filter(
    (chain) =>
      chain.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chain.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chain.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                Failed to Load Chains
              </h3>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              <button onClick={loadChains} className="btn btn-secondary">
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
          <h2 className="text-3xl font-bold text-gray-900">Chains</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage all AI workflow chains
          </p>
        </div>
        <Link to="/chains/builder" className="btn btn-primary flex items-center">
          <Plus className="h-4 w-4 mr-2" />
          Create Chain
        </Link>
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search chains by name, description, or user..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Chains List */}
      {filteredChains.length === 0 ? (
        <div className="card text-center py-12">
          <Link2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {searchTerm ? 'No chains found' : 'No chains yet'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchTerm
              ? 'Try adjusting your search terms'
              : 'Create your first AI workflow chain to get started'}
          </p>
          {!searchTerm && (
            <Link to="/chains/builder" className="btn btn-primary inline-flex items-center">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Chain
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredChains.map((chain) => (
            <div key={chain.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                {/* Chain Info */}
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <Link2 className="h-5 w-5 text-primary-600" />
                    <Link
                      to={`/chains/builder/${chain.id}`}
                      className="text-lg font-semibold text-gray-900 hover:text-primary-600"
                    >
                      {chain.name}
                    </Link>
                  </div>

                  {chain.description && (
                    <p className="text-sm text-gray-600 mb-3">{chain.description}</p>
                  )}

                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <User className="h-4 w-4" />
                      <span>{chain.user_id}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Link2 className="h-4 w-4" />
                      <span>{chain.steps.length} steps</span>
                    </div>
                    {chain.created_at && (
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>
                          Created {formatDistanceToNow(new Date(chain.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 ml-4">
                  <Link
                    to={`/chains/executions?chainId=${chain.id}`}
                    className="btn btn-secondary btn-sm flex items-center"
                    title="View executions"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    History
                  </Link>
                  <Link
                    to={`/chains/builder/${chain.id}`}
                    className="btn btn-secondary btn-sm flex items-center"
                    title="Edit chain"
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(chain.id!)}
                    className={`btn btn-sm flex items-center ${
                      deleteConfirm === chain.id
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'btn-secondary'
                    }`}
                    title={deleteConfirm === chain.id ? 'Click again to confirm' : 'Delete chain'}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    {deleteConfirm === chain.id ? 'Confirm' : 'Delete'}
                  </button>
                </div>
              </div>

              {/* Steps Preview */}
              {chain.steps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-xs text-gray-500 mb-2">Steps:</div>
                  <div className="flex flex-wrap gap-2">
                    {chain.steps.slice(0, 5).map((step, index) => (
                      <div
                        key={step.id}
                        className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700"
                      >
                        {index + 1}. {step.name || step.id}
                        {step.type === 'chain_call' && ' (chain)'}
                      </div>
                    ))}
                    {chain.steps.length > 5 && (
                      <div className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-500">
                        +{chain.steps.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="card bg-gray-50">
        <div className="text-sm text-gray-600">
          Showing {filteredChains.length} of {chains.length} chain
          {chains.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
