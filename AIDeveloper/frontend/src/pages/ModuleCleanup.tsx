/**
 * ModuleCleanup Page
 * Delete modules and optionally their remote Git repositories
 */

import { useEffect, useState } from 'react';
import { modulesAPI } from '../services/api';
import {
  Trash2,
  Github,
  AlertTriangle,
  Check,
  X,
  Loader2,
  FolderGit2,
  ExternalLink,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Module {
  name: string;
  path: string;
  description?: string;
  version?: string;
  category?: string;
  project?: string;
  hasGit: boolean;
  gitStatus?: {
    branch: string;
    isDirty: boolean;
  };
}

interface RemoteInfo {
  hasRemote: boolean;
  remoteUrl?: string;
  owner?: string;
  repo?: string;
  isGitHub?: boolean;
}

interface ModuleWithRemote extends Module {
  remoteInfo?: RemoteInfo;
  loadingRemote?: boolean;
}

export default function ModuleCleanup() {
  const [modules, setModules] = useState<ModuleWithRemote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [deleteRemoteRepo, setDeleteRemoteRepo] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      setLoading(true);
      const response = await modulesAPI.list();
      const moduleList: ModuleWithRemote[] = response.data.modules || [];
      setModules(moduleList);

      // Load remote info for each module
      for (const module of moduleList) {
        if (module.hasGit) {
          loadRemoteInfo(module.name);
        }
      }
    } catch (error) {
      console.error('Failed to load modules:', error);
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  const loadRemoteInfo = async (moduleName: string) => {
    setModules(prev => prev.map(m =>
      m.name === moduleName ? { ...m, loadingRemote: true } : m
    ));

    try {
      const response = await modulesAPI.getRemoteInfo(moduleName);
      setModules(prev => prev.map(m =>
        m.name === moduleName
          ? { ...m, remoteInfo: response.data.remoteInfo, loadingRemote: false }
          : m
      ));
    } catch (error) {
      console.error(`Failed to load remote info for ${moduleName}:`, error);
      setModules(prev => prev.map(m =>
        m.name === moduleName ? { ...m, loadingRemote: false } : m
      ));
    }
  };

  const handleSelectModule = (name: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedModules.size === modules.length) {
      setSelectedModules(new Set());
    } else {
      setSelectedModules(new Set(modules.map(m => m.name)));
    }
  };

  const handleDeleteModule = async (moduleName: string) => {
    if (confirmDelete !== moduleName) {
      setConfirmDelete(moduleName);
      return;
    }

    setDeleting(moduleName);
    setConfirmDelete(null);

    try {
      const module = modules.find(m => m.name === moduleName);
      const shouldDeleteRemote = deleteRemoteRepo && module?.remoteInfo?.isGitHub;

      if (shouldDeleteRemote && !githubToken) {
        toast.error('GitHub token required to delete remote repository');
        setDeleting(null);
        return;
      }

      const response = await modulesAPI.delete(moduleName, {
        deleteRemoteRepo: shouldDeleteRemote,
        githubToken: shouldDeleteRemote ? githubToken : undefined,
      });

      if (response.data.success) {
        toast.success(response.data.message);
        setModules(prev => prev.filter(m => m.name !== moduleName));
        setSelectedModules(prev => {
          const next = new Set(prev);
          next.delete(moduleName);
          return next;
        });
      } else {
        toast.error(response.data.error || 'Failed to delete module');
      }
    } catch (error: any) {
      console.error('Failed to delete module:', error);
      toast.error(error.response?.data?.error || 'Failed to delete module');
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedModules.size === 0) {
      toast.error('No modules selected');
      return;
    }

    for (const moduleName of selectedModules) {
      setConfirmDelete(moduleName);
      await handleDeleteModule(moduleName);
    }
  };

  const hasGitHubModules = modules.some(m => m.remoteInfo?.isGitHub);
  const selectedHasGitHub = [...selectedModules].some(name => {
    const module = modules.find(m => m.name === name);
    return module?.remoteInfo?.isGitHub;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Trash2 className="w-6 h-6 text-red-400" />
          Module Cleanup
        </h1>
        <p className="text-gray-400">
          Delete modules from your local filesystem and optionally remove their remote Git repositories.
        </p>
      </div>

      {/* Warning Banner */}
      <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-red-400 font-semibold">Danger Zone</h3>
            <p className="text-red-300 text-sm mt-1">
              Deleting modules is irreversible. Make sure you have backups of any important code.
              Deleting remote repositories will permanently remove them from GitHub.
            </p>
          </div>
        </div>
      </div>

      {/* GitHub Token Section */}
      {hasGitHubModules && (
        <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-yellow-400" />
            <h3 className="text-white font-semibold">GitHub Authentication</h3>
          </div>
          <p className="text-gray-400 text-sm mb-3">
            To delete remote repositories, you need a GitHub Personal Access Token with <code className="bg-gray-700 px-1 rounded">delete_repo</code> scope.
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <input
                type={showToken ? 'text' : 'password'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 pr-10"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <a
              href="https://github.com/settings/tokens/new?scopes=delete_repo&description=AIDeveloper%20Module%20Cleanup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
            >
              Create Token <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Delete Options */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteRemoteRepo}
            onChange={(e) => setDeleteRemoteRepo(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-red-500 focus:ring-red-500"
          />
          <div>
            <span className="text-white font-medium">Also delete remote GitHub repository</span>
            <p className="text-gray-400 text-sm">
              This will permanently delete the repository from GitHub. Requires a token with delete_repo scope.
            </p>
          </div>
        </label>
      </div>

      {/* Bulk Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleSelectAll}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {selectedModules.size === modules.length ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-gray-400 text-sm">
            {selectedModules.size} of {modules.length} selected
          </span>
        </div>
        {selectedModules.size > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={!!deleting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected ({selectedModules.size})
          </button>
        )}
      </div>

      {/* Module List */}
      <div className="space-y-3">
        {modules.map((module) => (
          <div
            key={module.name}
            className={`bg-gray-800 rounded-lg p-4 border transition-colors ${
              selectedModules.has(module.name)
                ? 'border-red-500/50 bg-red-900/10'
                : 'border-gray-700'
            } ${confirmDelete === module.name ? 'ring-2 ring-red-500' : ''}`}
          >
            <div className="flex items-start gap-4">
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selectedModules.has(module.name)}
                onChange={() => handleSelectModule(module.name)}
                disabled={!!deleting}
                className="w-4 h-4 mt-1 rounded border-gray-600 bg-gray-900 text-red-500 focus:ring-red-500"
              />

              {/* Module Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FolderGit2 className="w-5 h-5 text-blue-400" />
                  <h3 className="text-white font-semibold">{module.name}</h3>
                  {module.version && (
                    <span className="text-gray-500 text-sm">v{module.version}</span>
                  )}
                  {module.category && (
                    <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded">
                      {module.category}
                    </span>
                  )}
                </div>

                {module.description && (
                  <p className="text-gray-400 text-sm mb-2">{module.description}</p>
                )}

                {/* Git Info */}
                <div className="flex items-center gap-4 text-xs">
                  {module.hasGit && (
                    <>
                      <span className="text-gray-500">
                        Branch: {module.gitStatus?.branch || 'unknown'}
                      </span>
                      {module.gitStatus?.isDirty && (
                        <span className="text-yellow-400">uncommitted changes</span>
                      )}
                    </>
                  )}

                  {module.loadingRemote ? (
                    <span className="text-gray-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading remote...
                    </span>
                  ) : module.remoteInfo?.isGitHub ? (
                    <a
                      href={`https://github.com/${module.remoteInfo.owner}/${module.remoteInfo.repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Github className="w-3 h-3" />
                      {module.remoteInfo.owner}/{module.remoteInfo.repo}
                    </a>
                  ) : module.remoteInfo?.hasRemote ? (
                    <span className="text-gray-500">Remote: {module.remoteInfo.remoteUrl}</span>
                  ) : module.hasGit ? (
                    <span className="text-gray-500">No remote</span>
                  ) : (
                    <span className="text-gray-500">Not a git repo</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {confirmDelete === module.name ? (
                  <>
                    <button
                      onClick={() => handleDeleteModule(module.name)}
                      disabled={!!deleting}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded flex items-center gap-1"
                    >
                      {deleting === module.name ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      disabled={!!deleting}
                      className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleDeleteModule(module.name)}
                    disabled={!!deleting}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white text-sm rounded flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Delete Remote Warning */}
            {confirmDelete === module.name && deleteRemoteRepo && module.remoteInfo?.isGitHub && (
              <div className="mt-3 p-2 bg-red-900/30 border border-red-600/50 rounded text-sm text-red-300">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                This will also delete the GitHub repository: {module.remoteInfo.owner}/{module.remoteInfo.repo}
              </div>
            )}
          </div>
        ))}

        {modules.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No modules found
          </div>
        )}
      </div>
    </div>
  );
}
