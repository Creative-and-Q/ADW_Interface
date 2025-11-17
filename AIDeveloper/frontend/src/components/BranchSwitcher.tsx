import { useState, useEffect } from 'react';
import { systemAPI } from '../services/api';
import toast from 'react-hot-toast';
import { GitBranch, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

export default function BranchSwitcher() {
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const { data } = await systemAPI.listBranches();
      setBranches(data.branches);
      setCurrentBranch(data.currentBranch);
      setSelectedBranch(data.currentBranch);
    } catch (error) {
      console.error('Failed to load branches:', error);
      toast.error('Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchBranch = async () => {
    if (selectedBranch === currentBranch) {
      toast.error('Already on this branch');
      return;
    }

    setSwitching(true);
    const switchToast = toast.loading(
      `Switching to ${selectedBranch} and rebuilding...`
    );

    try {
      const { data } = await systemAPI.switchBranch(selectedBranch);

      if (data.success) {
        toast.success(data.message, { id: switchToast, duration: 5000 });
        setCurrentBranch(selectedBranch);
        setShowModal(false);

        // Reload page after successful switch to load new code
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        toast.error(data.message, { id: switchToast, duration: 8000 });

        // Show detailed error notification
        if (data.error === 'BACKEND_BUILD_FAILED') {
          toast.error('Backend build failed. Check logs for details.', {
            duration: 10000,
            icon: <AlertTriangle className="text-red-500" />,
          });
        } else if (data.error === 'FRONTEND_BUILD_FAILED') {
          toast.error('Frontend build failed. Check logs for details.', {
            duration: 10000,
            icon: <AlertTriangle className="text-red-500" />,
          });
        }

        // Reset to current branch on failure
        setSelectedBranch(currentBranch);
      }
    } catch (error: any) {
      console.error('Branch switch failed:', error);
      const errorMessage = error.response?.data?.message || 'Failed to switch branch';
      toast.error(errorMessage, { id: switchToast, duration: 8000 });
      setSelectedBranch(currentBranch);
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <GitBranch className="h-4 w-4 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          title="Switch branch"
        >
          <GitBranch className="h-4 w-4" />
          <span>{currentBranch}</span>
        </button>
      </div>

      {/* Branch Switch Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <GitBranch className="h-5 w-5 mr-2" />
                Switch Branch
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={switching}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600">
                  Current branch: <strong>{currentBranch}</strong>
                </span>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">Important:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>This will rebuild both backend and frontend</li>
                      <li>If build fails, system will rollback to {currentBranch}</li>
                      <li>Uncommitted changes will prevent branch switch</li>
                    </ul>
                  </div>
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select branch to switch to:
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={switching}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch} {branch === currentBranch ? '(current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={switching}
              >
                Cancel
              </button>
              <button
                onClick={handleSwitchBranch}
                disabled={switching || selectedBranch === currentBranch}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {switching ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Switching & Rebuilding...
                  </>
                ) : (
                  <>
                    <GitBranch className="h-4 w-4 mr-2" />
                    Switch & Rebuild
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
