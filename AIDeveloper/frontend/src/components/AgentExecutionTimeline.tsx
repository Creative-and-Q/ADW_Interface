import { format, parseISO, formatDistanceToNow, differenceInSeconds } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Clock,
  Play,
  FileText,
  Code,
  TestTube,
  Search,
  FileCode,
  Zap,
} from 'lucide-react';
import { getStatusColor, formatDuration } from '../utils/workflowChartUtils';
import clsx from 'clsx';

interface AgentExecutionTimelineProps {
  agents: any[];
  className?: string;
}

export default function AgentExecutionTimeline({ agents, className = '' }: AgentExecutionTimelineProps) {
  const getAgentIcon = (type: string) => {
    const icons: Record<string, any> = {
      plan: FileText,
      code: Code,
      test: TestTube,
      review: Search,
      document: FileCode,
    };
    return icons[type] || Zap;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'failed':
        return XCircle;
      case 'running':
        return Play;
      case 'pending':
        return Clock;
      default:
        return Clock;
    }
  };

  const calculateDuration = (agent: any) => {
    if (!agent.started_at) return null;

    const endTime = agent.completed_at
      ? parseISO(agent.completed_at)
      : new Date();

    const durationMs = differenceInSeconds(endTime, parseISO(agent.started_at)) * 1000;
    return formatDuration(durationMs);
  };

  if (agents.length === 0) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Execution Timeline</h3>
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Play className="h-12 w-12 mb-3 text-gray-400" />
          <p>No agent executions yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Agent Execution Timeline</h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

        {/* Agent executions */}
        <div className="space-y-6">
          {agents.map((agent) => {
            const AgentIcon = getAgentIcon(agent.agent_type);
            const StatusIcon = getStatusIcon(agent.status);
            const statusColor = getStatusColor(agent.status);
            const duration = calculateDuration(agent);

            return (
              <div key={agent.id} className="relative flex items-start">
                {/* Timeline marker with agent icon */}
                <div className="relative z-10 flex-shrink-0">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow-lg"
                    style={{ backgroundColor: statusColor }}
                  >
                    <AgentIcon className="h-5 w-5 text-white" />
                  </div>
                  {/* Status badge */}
                  <div
                    className="absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full border-2 border-white"
                    style={{ backgroundColor: statusColor }}
                  >
                    <StatusIcon className="h-3 w-3 text-white" />
                  </div>
                </div>

                {/* Agent content */}
                <div className="ml-6 flex-1">
                  <div
                    className={clsx(
                      'p-5 rounded-lg border-2 transition-all duration-200',
                      agent.status === 'running'
                        ? 'border-blue-300 bg-blue-50 shadow-md'
                        : agent.status === 'failed'
                        ? 'border-red-200 bg-red-50'
                        : agent.status === 'completed'
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 bg-gray-50',
                      'hover:shadow-lg'
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-base font-bold text-gray-900 capitalize">
                            {agent.agent_type} Agent
                          </h4>
                          <span
                            className="px-2 py-1 text-xs font-semibold rounded-full"
                            style={{
                              backgroundColor: statusColor + '20',
                              color: statusColor,
                            }}
                          >
                            {agent.status}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          {agent.started_at && (
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3.5 w-3.5" />
                              <span>
                                Started {formatDistanceToNow(parseISO(agent.started_at), { addSuffix: true })}
                              </span>
                            </div>
                          )}
                          {duration && (
                            <div className="flex items-center space-x-1">
                              <Zap className="h-3.5 w-3.5" />
                              <span className="font-medium">{duration}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {agent.started_at && (
                        <time className="text-xs text-gray-500 font-mono">
                          {format(parseISO(agent.started_at), 'MMM d, HH:mm:ss')}
                        </time>
                      )}
                    </div>

                    {/* Summary */}
                    {agent.summary && (
                      <div className="mb-3 p-3 bg-white bg-opacity-60 rounded-md">
                        <p className="text-sm text-gray-700 leading-relaxed">{agent.summary}</p>
                      </div>
                    )}

                    {/* Error */}
                    {agent.error && (
                      <div className="p-3 bg-red-100 border border-red-200 rounded-md">
                        <p className="text-sm font-semibold text-red-900 mb-1">Error:</p>
                        <p className="text-sm text-red-700 font-mono">{agent.error}</p>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center space-x-4">
                        {agent.started_at && (
                          <span>
                            <span className="font-medium">Started:</span>{' '}
                            {format(parseISO(agent.started_at), 'HH:mm:ss')}
                          </span>
                        )}
                        {agent.completed_at && (
                          <span>
                            <span className="font-medium">Completed:</span>{' '}
                            {format(parseISO(agent.completed_at), 'HH:mm:ss')}
                          </span>
                        )}
                      </div>
                      <span className="font-mono">ID: {agent.id}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
