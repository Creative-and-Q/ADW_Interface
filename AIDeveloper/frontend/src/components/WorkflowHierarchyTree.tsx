import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  GitBranch,
  AlertTriangle,
  Layers,
  ArrowDownRight,
} from 'lucide-react';
import clsx from 'clsx';

interface WorkflowNode {
  id: number;
  type: string;
  status: string;
  executionOrder: number;
  createdAt: string;
  completedAt?: string;
  payload?: any;
  task_description?: string;
  target_module?: string;
  parentWorkflowId?: number;
  workflowDepth?: number;
  children?: WorkflowNode[];
}

interface WorkflowHierarchyTreeProps {
  parentWorkflow: {
    id: number;
    type: string;
    status: string;
    createdAt: string;
    completedAt?: string;
    task_description?: string;
    target_module?: string;
  };
  subWorkflows: WorkflowNode[];
  queueStatus?: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  className?: string;
}

const statusConfig = {
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
    borderColor: 'border-green-500',
    lightBg: 'bg-green-50',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500',
    borderColor: 'border-red-500',
    lightBg: 'bg-red-50',
    label: 'Failed',
  },
  running: {
    icon: Play,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    borderColor: 'border-blue-500',
    lightBg: 'bg-blue-50',
    label: 'Running',
  },
  in_progress: {
    icon: Play,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    borderColor: 'border-blue-500',
    lightBg: 'bg-blue-50',
    label: 'In Progress',
  },
  pending: {
    icon: Clock,
    color: 'text-gray-400',
    bgColor: 'bg-gray-400',
    borderColor: 'border-gray-400',
    lightBg: 'bg-gray-50',
    label: 'Pending',
  },
  pending_fix: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
    borderColor: 'border-yellow-500',
    lightBg: 'bg-yellow-50',
    label: 'Pending Fix',
  },
};

function getStatusConfig(status: string) {
  return statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
}

function WorkflowTreeNode({
  workflow,
  isLast,
  depth = 0,
}: {
  workflow: WorkflowNode;
  isLast: boolean;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const config = getStatusConfig(workflow.status);
  const StatusIcon = config.icon;
  const hasChildren = workflow.children && workflow.children.length > 0;
  const isRunning = workflow.status === 'running' || workflow.status === 'in_progress';

  const description =
    workflow.task_description ||
    workflow.payload?.taskDescription ||
    workflow.payload?.title ||
    workflow.payload?.description ||
    'Sub-task';

  return (
    <div className="relative">
      {/* Vertical line from parent */}
      {depth > 0 && (
        <div
          className={clsx(
            'absolute left-4 w-0.5 bg-gray-300',
            isLast ? 'h-6' : 'h-full'
          )}
          style={{ top: '-12px' }}
        />
      )}

      {/* Horizontal connector line */}
      {depth > 0 && (
        <div className="absolute left-4 top-6 w-4 h-0.5 bg-gray-300" />
      )}

      {/* Node content */}
      <div className={clsx('relative', depth > 0 && 'ml-8')}>
        <Link
          to={`/workflows/${workflow.id}`}
          className={clsx(
            'block rounded-lg border-2 p-4 transition-all hover:shadow-lg',
            config.borderColor,
            config.lightBg,
            isRunning && 'ring-2 ring-blue-300 ring-offset-2'
          )}
        >
          <div className="flex items-start gap-3">
            {/* Status indicator with pulse for running */}
            <div className="relative flex-shrink-0">
              <div
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  config.bgColor,
                  isRunning && 'animate-pulse'
                )}
              >
                <StatusIcon className="h-5 w-5 text-white" />
              </div>
              {/* Execution order badge */}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center font-bold">
                {workflow.executionOrder + 1}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
                  #{workflow.id}
                </span>
                <span
                  className={clsx(
                    'text-xs font-semibold uppercase px-2 py-0.5 rounded',
                    config.lightBg,
                    config.color
                  )}
                >
                  {workflow.type}
                </span>
                {workflow.target_module && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {workflow.target_module}
                  </span>
                )}
              </div>

              <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
                {description}
              </p>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(parseISO(workflow.createdAt), { addSuffix: true })}
                </span>
                {workflow.completedAt && (
                  <span className="text-green-600">
                    Completed {format(parseISO(workflow.completedAt), 'HH:mm:ss')}
                  </span>
                )}
              </div>
            </div>

            {/* Expand/collapse for children */}
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setIsExpanded(!isExpanded);
                }}
                className="p-1 hover:bg-white rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
              </button>
            )}
          </div>
        </Link>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-3 space-y-3">
            {workflow.children!.map((child, index) => (
              <WorkflowTreeNode
                key={child.id}
                workflow={child}
                isLast={index === workflow.children!.length - 1}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowHierarchyTree({
  parentWorkflow,
  subWorkflows,
  queueStatus,
  className = '',
}: WorkflowHierarchyTreeProps) {
  if (!subWorkflows || subWorkflows.length === 0) {
    return null;
  }

  const parentConfig = getStatusConfig(parentWorkflow.status);
  const ParentStatusIcon = parentConfig.icon;

  // Calculate progress
  const progressPercent = queueStatus
    ? Math.round((queueStatus.completed / queueStatus.total) * 100)
    : 0;

  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Layers className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Workflow Hierarchy
              </h3>
              <p className="text-sm text-indigo-200">
                {subWorkflows.length} sub-workflow{subWorkflows.length !== 1 && 's'} in execution tree
              </p>
            </div>
          </div>

          {queueStatus && (
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{progressPercent}%</div>
              <div className="text-xs text-indigo-200">
                {queueStatus.completed} / {queueStatus.total} complete
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {queueStatus && (
          <div className="mt-4">
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-white h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-indigo-200">
              <span>{queueStatus.pending} pending</span>
              <span>{queueStatus.inProgress} running</span>
              <span>{queueStatus.failed} failed</span>
            </div>
          </div>
        )}
      </div>

      {/* Tree visualization */}
      <div className="p-6">
        {/* Parent workflow node */}
        <div className="mb-6">
          <Link
            to={`/workflows/${parentWorkflow.id}`}
            className={clsx(
              'block rounded-xl border-2 p-5 transition-all hover:shadow-lg',
              parentConfig.borderColor,
              'bg-gradient-to-r from-gray-50 to-white'
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={clsx(
                  'w-14 h-14 rounded-xl flex items-center justify-center',
                  parentConfig.bgColor
                )}
              >
                <ParentStatusIcon className="h-7 w-7 text-white" />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                    #{parentWorkflow.id}
                  </span>
                  <span className="text-sm font-semibold uppercase text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                    {parentWorkflow.type}
                  </span>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-medium">
                    PARENT
                  </span>
                </div>
                <p className="text-base font-medium text-gray-900">
                  {parentWorkflow.task_description || parentWorkflow.target_module || 'Parent Workflow'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-gray-400" />
                <span className={clsx('font-semibold', parentConfig.color)}>
                  {parentConfig.label}
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Connector to children */}
        <div className="flex items-center gap-2 mb-4 ml-7">
          <div className="w-0.5 h-6 bg-gray-300" />
          <ArrowDownRight className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Sub-workflows
          </span>
        </div>

        {/* Sub-workflow tree */}
        <div className="space-y-4 ml-4">
          {subWorkflows.map((workflow, index) => (
            <WorkflowTreeNode
              key={workflow.id}
              workflow={workflow}
              isLast={index === subWorkflows.length - 1}
              depth={0}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <p className="text-xs text-gray-500 flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Sub-workflows execute sequentially on the same branch. Click any node to view details.
        </p>
      </div>
    </div>
  );
}
