import { useEffect, useState, useRef } from 'react';
import { X, Terminal, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface DeploymentActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleName: string;
  action: string;
  logs: string[];
  isRunning: boolean;
  error?: string;
  success?: boolean;
}

export default function DeploymentActionModal({
  isOpen,
  onClose,
  moduleName,
  action,
  logs,
  isRunning,
  error,
  success,
}: DeploymentActionModalProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const formatLogLine = (line: string, index: number) => {
    // Detect log level and apply color
    const isError = /error|fail|exception|ERR!/i.test(line);
    const isWarning = /warn|warning|WARN/i.test(line);
    const isSuccess = /success|complete|done|✓|successfully/i.test(line);
    const isInfo = /info|start|running/i.test(line);

    let className = 'text-gray-300';
    if (isError) className = 'text-red-400';
    else if (isWarning) className = 'text-yellow-400';
    else if (isSuccess) className = 'text-green-400';
    else if (isInfo) className = 'text-blue-400';

    return (
      <div key={index} className={`font-mono text-xs ${className} hover:bg-gray-800 px-2 py-0.5`}>
        <span className="text-gray-600 mr-2">{String(index + 1).padStart(4, ' ')}</span>
        {line}
      </div>
    );
  };

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      install: 'Installing Dependencies',
      build: 'Building Module',
      test: 'Running Tests',
      typecheck: 'Type Checking',
      start: 'Starting Server',
      stop: 'Stopping Server',
      restart: 'Restarting Server',
      dev: 'Starting Dev Server',
    };
    return labels[action] || action;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={!isRunning ? onClose : undefined}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <Terminal className="h-6 w-6 text-primary-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {getActionLabel(action)}
                </h3>
                <p className="text-sm text-gray-500">{moduleName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Status Indicator */}
              {isRunning ? (
                <div className="flex items-center space-x-2 text-blue-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">Running...</span>
                </div>
              ) : success ? (
                <div className="flex items-center space-x-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Completed</span>
                </div>
              ) : error ? (
                <div className="flex items-center space-x-2 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Failed</span>
                </div>
              ) : null}

              {/* Close Button */}
              <button
                onClick={onClose}
                disabled={isRunning}
                className={`p-2 rounded-lg transition-colors ${
                  isRunning
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={isRunning ? 'Please wait for action to complete' : 'Close'}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Log Output */}
          <div className="flex-1 p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">Console Output</span>
                <div className="flex items-center space-x-1">
                  <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-blue-400 animate-pulse' : 'bg-gray-400'}`}></div>
                  <span className="text-xs text-gray-500">
                    {logs.length} lines
                  </span>
                </div>
              </div>

              <label className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>Auto-scroll</span>
              </label>
            </div>

            <div
              ref={logContainerRef}
              className="bg-gray-900 rounded-lg p-4 overflow-y-auto"
              style={{
                fontFamily: 'Monaco, Consolas, monospace',
                height: 'calc(80vh - 300px)',
                minHeight: '300px',
              }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  <p className="text-sm">Waiting for output...</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {logs.map((line, index) => formatLogLine(line, index))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium mb-1">Action Failed</p>
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {isRunning ? (
                  <span>Action in progress - please wait...</span>
                ) : (
                  <span>Action completed</span>
                )}
              </div>
              <button
                onClick={onClose}
                disabled={isRunning}
                className={`btn ${
                  isRunning
                    ? 'btn-secondary cursor-not-allowed opacity-50'
                    : 'btn-primary'
                }`}
              >
                {isRunning ? 'Please Wait...' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
