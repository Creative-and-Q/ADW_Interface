import { Link } from 'react-router-dom';
import { format, formatDistanceToNow, parseISO, differenceInMilliseconds } from 'date-fns';
import { CheckCircle, XCircle, Clock, Play, ExternalLink, GitBranch } from 'lucide-react';
import { getStatusColor, formatDuration } from '../utils/workflowChartUtils';
import clsx from 'clsx';

interface WorkflowCardProps {
  workflow: any;
  className?: string;
}

export default function WorkflowCard({ workflow, className = '' }: WorkflowCardProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'failed':
        return XCircle;
      case 'pending':
        return Clock;
      default:
        return Play;
    }
  };

  const StatusIcon = getStatusIcon(workflow.status);
  const statusColor = getStatusColor(workflow.status);

  // Calculate duration if completed
  let duration = null;
  if (workflow.completed_at && workflow.created_at) {
    try {
      const durationMs = differenceInMilliseconds(
        parseISO(workflow.completed_at),
        parseISO(workflow.created_at)
      );
      duration = formatDuration(durationMs);
    } catch (error) {
      console.warn('Failed to calculate duration:', error);
    }
  }

  // Format status for display
  const formatStatus = (status: string) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Get task description from payload
  const getTaskDescription = () => {
    try {
      if (typeof workflow.payload === 'string') {
        const parsed = JSON.parse(workflow.payload);
        return parsed.customData?.taskDescription || parsed.description || 'No description';
      }
      return workflow.payload?.customData?.taskDescription || workflow.payload?.description || 'No description';
    } catch {
      return 'No description';
    }
  };

  const taskDescription = getTaskDescription();

  return (
    <Link
      to={`/workflows/${workflow.id}`}
      className={clsx(
        "block bg-white rounded-lg border border-gray-200 hover:border-gray-300",
        "hover:shadow-lg transition-all duration-200 p-5",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3 flex-1">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full"
            style={{ backgroundColor: statusColor + '20' }}
          >
            <StatusIcon className="h-5 w-5" style={{ color: statusColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-gray-900">
                Workflow #{workflow.id}
              </h3>
              <span
                className="px-2 py-1 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: statusColor + '20',
                  color: statusColor,
                }}
              >
                {formatStatus(workflow.status)}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1 capitalize">
              {workflow.workflow_type}
            </p>
          </div>
        </div>
        <ExternalLink className="h-5 w-5 text-gray-400" />
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 mb-4 line-clamp-2">
        {taskDescription}
      </p>

      {/* Branch info */}
      {workflow.branch_name && (
        <div className="flex items-center text-sm text-gray-600 mb-4">
          <GitBranch className="h-4 w-4 mr-2" />
          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
            {workflow.branch_name}
          </code>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-500 border-t border-gray-100 pt-4">
        <div className="flex items-center space-x-4">
          <div>
            <span className="font-medium">Created:</span>{' '}
            {formatDistanceToNow(parseISO(workflow.created_at), { addSuffix: true })}
          </div>
          {duration && (
            <div>
              <span className="font-medium">Duration:</span> {duration}
            </div>
          )}
        </div>
        {workflow.completed_at && (
          <time className="text-xs text-gray-400 font-mono">
            {format(parseISO(workflow.completed_at), 'MMM d, HH:mm')}
          </time>
        )}
      </div>

      {/* Progress bar for ongoing workflows */}
      {!['completed', 'failed', 'cancelled', 'pending'].includes(workflow.status) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>In Progress</span>
            <span>
              {workflow.status === 'planning' && '20%'}
              {workflow.status === 'coding' && '40%'}
              {workflow.status === 'testing' && '60%'}
              {workflow.status === 'reviewing' && '80%'}
              {workflow.status === 'documenting' && '90%'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: statusColor,
                width: `${
                  workflow.status === 'planning' ? 20 :
                  workflow.status === 'coding' ? 40 :
                  workflow.status === 'testing' ? 60 :
                  workflow.status === 'reviewing' ? 80 :
                  workflow.status === 'documenting' ? 90 : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}


