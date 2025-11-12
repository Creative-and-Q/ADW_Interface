import { useEffect, useState, useRef } from 'react';
import { modulesAPI } from '../services/api';
import { Terminal, Pause, Play, Trash2, RefreshCw } from 'lucide-react';

interface ModuleLogViewerProps {
  moduleName: string;
  isRunning: boolean;
}

export default function ModuleLogViewer({ moduleName, isRunning }: ModuleLogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);

  const loadLogs = async () => {
    if (isPaused || !isRunning) return;

    try {
      const { data } = await modulesAPI.getLogs(moduleName, 100);
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  useEffect(() => {
    if (isRunning && !isPaused) {
      // Load immediately
      loadLogs();

      // Then poll every 2 seconds
      intervalRef.current = window.setInterval(loadLogs, 2000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [moduleName, isRunning, isPaused]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
  };

  const formatLogLine = (line: string, index: number) => {
    // Detect log level and apply color
    const isError = /error|fail|exception/i.test(line);
    const isWarning = /warn|warning/i.test(line);
    const isSuccess = /success|complete|done/i.test(line);
    const isInfo = /info|start|running/i.test(line);

    let className = 'text-gray-700';
    if (isError) className = 'text-red-600';
    else if (isWarning) className = 'text-yellow-600';
    else if (isSuccess) className = 'text-green-600';
    else if (isInfo) className = 'text-blue-600';

    return (
      <div key={index} className={`font-mono text-xs ${className} hover:bg-gray-50 px-2 py-0.5`}>
        <span className="text-gray-400 mr-2">{String(index + 1).padStart(4, ' ')}</span>
        {line}
      </div>
    );
  };

  if (!isRunning) {
    return (
      <div className="card bg-gray-50">
        <div className="text-center py-8 text-gray-500">
          <Terminal className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p>Module is not running. Console logs will appear when the module is started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Terminal className="h-5 w-5 text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-900">Console Logs</h3>
          <div className="flex items-center space-x-1">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-xs text-gray-500">Live</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`btn btn-sm ${autoScroll ? 'btn-primary' : 'btn-secondary'}`}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            <RefreshCw className={`h-3 w-3 ${autoScroll ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`btn btn-sm ${isPaused ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'btn-secondary'}`}
            title={isPaused ? 'Resume updates' : 'Pause updates'}
          >
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>

          <button
            onClick={clearLogs}
            className="btn btn-sm btn-secondary"
            title="Clear logs"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div
        ref={logContainerRef}
        className="bg-gray-900 rounded-lg p-4 overflow-y-auto max-h-96 min-h-64"
        style={{ fontFamily: 'Monaco, Consolas, monospace' }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            <p>No logs yet...</p>
            {isPaused && <p className="text-sm mt-2">Updates paused - click Resume to continue</p>}
          </div>
        ) : (
          <div className="space-y-0.5 bg-white rounded p-2">
            {logs.map((line, index) => formatLogLine(line, index))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>{logs.length} lines</span>
        <span>Updates every 2s {isPaused && '(Paused)'}</span>
      </div>
    </div>
  );
}
