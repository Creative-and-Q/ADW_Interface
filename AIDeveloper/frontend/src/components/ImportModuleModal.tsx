/**
 * Import Module Modal
 * Form to import a module from a Git repository
 */

import { useState } from 'react';
import { X, Download, Tag, FolderGit2 } from 'lucide-react';
import { modulesAPI } from '../services/api';
import toast from 'react-hot-toast';

interface ImportModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportModuleModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportModuleModalProps) {
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [project, setProject] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [autoInstall, setAutoInstall] = useState(true);
  const [importing, setImporting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      toast.error('Git URL is required');
      return;
    }

    setImporting(true);

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const response = await modulesAPI.import({
        url: url.trim(),
        category: category.trim() || undefined,
        project: project.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        autoInstall,
      });

      if (response.data.success) {
        toast.success(response.data.message);
        onSuccess();
        handleClose();
      } else {
        toast.error(response.data.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import failed:', error);
      toast.error(error.response?.data?.error || 'Failed to import module');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (!importing) {
      setUrl('');
      setCategory('');
      setProject('');
      setTagsInput('');
      setAutoInstall(true);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Download className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Import Module</h2>
              <p className="text-sm text-gray-500">Clone a module from a Git repository</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={importing}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Git URL */}
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
              Git URL <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FolderGit2 className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                disabled={importing}
                required
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Supports HTTPS and SSH Git URLs
            </p>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <input
              type="text"
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., AI Agents, Controllers, Game Systems"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={importing}
            />
            <p className="mt-1 text-xs text-gray-500">
              Functional grouping for organizing modules
            </p>
          </div>

          {/* Project */}
          <div>
            <label htmlFor="project" className="block text-sm font-medium text-gray-700 mb-2">
              Project
            </label>
            <input
              type="text"
              id="project"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g., AIDeveloper, Ex Nihilo"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={importing}
            />
            <p className="mt-1 text-xs text-gray-500">
              Project ownership for grouping by project
            </p>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Tag className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="ai, automation, integration"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                disabled={importing}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Comma-separated tags for searchability
            </p>
          </div>

          {/* Auto Install */}
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="autoInstall"
              checked={autoInstall}
              onChange={(e) => setAutoInstall(e.target.checked)}
              disabled={importing}
              className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <div className="flex-1">
              <label htmlFor="autoInstall" className="text-sm font-medium text-gray-700">
                Auto-install dependencies
              </label>
              <p className="text-xs text-gray-500">
                Run <code className="bg-gray-100 px-1 py-0.5 rounded">npm install</code> after cloning if package.json exists
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Download className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Import Process:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Clone the repository to the modules directory</li>
                  <li>Create or update module.json with provided metadata</li>
                  <li>Optionally install npm dependencies</li>
                  <li>Module will appear in the modules list</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleClose}
              disabled={importing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importing || !url.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Import Module</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
