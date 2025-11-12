import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { modulesAPI } from '../services/api';
import { ArrowLeft, GitBranch, Clock, User, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export default function ModuleHistory() {
  const { moduleName } = useParams();
  const navigate = useNavigate();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (moduleName) {
      loadCommits();
    }
  }, [moduleName, limit]);

  const loadCommits = async () => {
    try {
      const { data } = await modulesAPI.getCommits(moduleName!, limit);
      setCommits(data.commits);
    } catch (error) {
      console.error('Failed to load commits:', error);
    } finally {
      setLoading(false);
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
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/modules')}
            className="btn btn-secondary flex items-center"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Modules
          </button>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              {moduleName} History
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Commit history for this module
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="25">Last 25 commits</option>
            <option value="50">Last 50 commits</option>
            <option value="100">Last 100 commits</option>
            <option value="200">Last 200 commits</option>
          </select>
        </div>
      </div>

      {commits.length === 0 ? (
        <div className="card text-center py-12">
          <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Commit History
          </h3>
          <p className="text-gray-500">
            This module doesn't have any commits yet.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Commits ({commits.length})
            </h3>
          </div>

          <div className="space-y-4">
            {commits.map((commit, index) => (
              <div
                key={commit.hash}
                className="border-l-4 border-primary-500 pl-6 py-4 relative"
              >
                {/* Timeline dot */}
                <div className="absolute left-0 top-6 w-4 h-4 -ml-2 bg-primary-500 rounded-full border-4 border-white"></div>

                {/* Timeline line */}
                {index < commits.length - 1 && (
                  <div className="absolute left-0 top-10 w-0.5 h-full -ml-0.25 bg-gray-200"></div>
                )}

                {/* Commit Content */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h4 className="font-semibold text-gray-900 text-lg">
                      {commit.message}
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center space-x-2 text-gray-600">
                      <Hash className="h-4 w-4" />
                      <span className="font-mono text-xs">{commit.shortHash}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(commit.hash)}
                        className="text-primary-600 hover:text-primary-700 text-xs"
                        title="Copy full hash"
                      >
                        Copy
                      </button>
                    </div>

                    <div className="flex items-center space-x-2 text-gray-600">
                      <User className="h-4 w-4" />
                      <span>{commit.author}</span>
                    </div>

                    <div className="flex items-center space-x-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      <span>
                        {format(new Date(commit.date), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {commits.length >= limit && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setLimit(limit + 50)}
                className="btn btn-secondary"
              >
                Load More Commits
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
