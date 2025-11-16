import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Terminal, ChevronDown, ChevronRight, AlertCircle, Info, AlertTriangle, Bug } from 'lucide-react';
import clsx from 'clsx';

interface ExecutionLogsProps {
  logs: any[];
  agents: any[];
  selectedAgentLogs: number | null;
  onLoadLogs: (agentExecutionId?: number) => void;
  className?: string;
}

export default function ExecutionLogs({
  logs,
  agents,
  selectedAgentLogs,
  onLoadLogs,
  className = '',
}: ExecutionLogsProps) {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  const getLevelIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return AlertCircle;
      case 'warn':
        return AlertTriangle;
      case 'debug':
        return Bug;
      default:
        return Info;
    }
  };

  const getLevelStyle = (level: string) => {
    const styles: Record<string, string> = {
      debug: 'bg-gray-50 text-gray-700 border-l-gray-400',
      info: 'bg-blue-50 text-blue-700 border-l-blue-500',
      warn: 'bg-amber-50 text-amber-700 border-l-amber-500',
      error: 'bg-red-50 text-red-700 border-l-red-500',
    };
    return styles[level.toLowerCase()] || styles.info;
  };

  const toggleLog = (logId: number) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  // Group logs by level for stats
  const logStats = logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Terminal className="h-6 w-6 text-gray-700" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Execution Logs</h3>
            <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
              {Object.entries(logStats).map(([level, count]) => {
                const levelColorClass =
                  level === 'error' ? 'bg-red-500' :
                  level === 'warn' ? 'bg-amber-500' :
                  level === 'info' ? 'bg-blue-500' :
                  'bg-gray-500';

                return (
                  <span key={level} className="flex items-center space-x-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${levelColorClass}`} />
                    <span className="capitalize">{level}: {String(count)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onLoadLogs()}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              selectedAgentLogs === null
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            All Logs
          </button>
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onLoadLogs(agent.id)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors',
                selectedAgentLogs === agent.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              {agent.agent_type}
            </button>
          ))}
        </div>
      </div>

      {/* Logs list */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Terminal className="h-12 w-12 mb-3 text-gray-400" />
          <p>No logs available yet</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {logs.map((log) => {
            const isExpanded = expandedLogs.has(log.id);
            const LevelIcon = getLevelIcon(log.level);
            const levelStyle = getLevelStyle(log.level);

            return (
              <div
                key={log.id}
                className={clsx(
                  'border-l-4 rounded-r-lg transition-all duration-200',
                  levelStyle,
                  isExpanded ? 'shadow-md' : 'hover:shadow-sm'
                )}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => toggleLog(log.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <LevelIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {/* Log header */}
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {log.level}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs font-medium opacity-80">
                            {log.eventType}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <time className="text-xs font-mono opacity-75">
                            {format(parseISO(log.timestamp), 'HH:mm:ss.SSS')}
                          </time>
                        </div>
                        {/* Log message */}
                        <p className="text-sm font-medium leading-relaxed">{log.message}</p>
                      </div>
                    </div>
                    <button className="ml-3 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (log.data || log.stackTrace) && (
                    <div className="mt-4 space-y-3 pl-7">
                      {log.data && (
                        <div className="bg-white bg-opacity-80 p-3 rounded-md border border-gray-200">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Data:</p>
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.stackTrace && (
                        <div className="bg-red-100 bg-opacity-80 p-3 rounded-md border border-red-300">
                          <p className="text-xs font-semibold text-red-900 mb-2">Stack Trace:</p>
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap text-red-800">
                            {log.stackTrace}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
