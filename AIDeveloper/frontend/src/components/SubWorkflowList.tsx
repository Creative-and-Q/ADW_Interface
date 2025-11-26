import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { CheckCircle, XCircle, Clock, GitBranch, ArrowRight, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface SubWorkflow {
  id: number;
  type: string;
  status: string;
  executionOrder: number;
  createdAt: string;
  completedAt?: string;
  payload?: any;
}

interface SubWorkflowListProps {
  parentWorkflowId: number;
  subWorkflows: SubWorkflow[];
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

export default function SubWorkflowList({ 
  parentWorkflowId, 
  subWorkflows, 
  queueStatus,
  className = '' 
}: SubWorkflowListProps) {
  if (!subWorkflows || subWorkflows.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'failed':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'running':
      case 'in_progress':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'pending':
        return 'bg-gray-50 border-gray-200 text-gray-600';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600';
    }
  };

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <GitBranch className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Sub-Workflows
          </h3>
          <span className="text-sm text-gray-500">
            ({subWorkflows.length} tasks)
          </span>
        </div>
        
        {queueStatus && (
          <div className="text-sm">
            <span className="text-green-600 font-medium">{queueStatus.completed}</span>
            {' / '}
            <span className="text-gray-600">{queueStatus.total}</span>
            {' completed'}
          </div>
        )}
      </div>

      {queueStatus && (
        <div className="mb-4 bg-gray-100 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-600">Progress</span>
            <span className="text-gray-700 font-medium">
              {Math.round((queueStatus.completed / queueStatus.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-green-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(queueStatus.completed / queueStatus.total) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
            <span>Pending: {queueStatus.pending}</span>
            <span>In Progress: {queueStatus.inProgress}</span>
            <span>Failed: {queueStatus.failed}</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {subWorkflows.map((subWorkflow, index) => (
          <div key={subWorkflow.id}>
            {index > 0 && (
              <div className="flex justify-center py-1">
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </div>
            )}
            
            <Link
              to={`/workflows/${subWorkflow.id}`}
              className={clsx(
                'block border rounded-lg p-4 transition-all hover:shadow-md',
                getStatusColor(subWorkflow.status)
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className="mt-0.5">
                    {getStatusIcon(subWorkflow.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-xs font-mono px-2 py-0.5 bg-white rounded">
                        #{subWorkflow.id}
                      </span>
                      <span className="text-xs font-medium uppercase">
                        {subWorkflow.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        Step {subWorkflow.executionOrder + 1}
                      </span>
                    </div>
                    
                    <p className="text-sm font-medium truncate">
                      {subWorkflow.payload?.taskDescription || subWorkflow.payload?.title || 'Sub-task'}
                    </p>
                    
                    <div className="flex items-center space-x-3 mt-2 text-xs text-gray-600">
                      <span>
                        Created {formatDistanceToNow(parseISO(subWorkflow.createdAt), { addSuffix: true })}
                      </span>
                      {subWorkflow.completedAt && (
                        <span>
                          Completed {formatDistanceToNow(parseISO(subWorkflow.completedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="ml-3">
                  <span className={clsx(
                    'text-xs font-semibold uppercase px-2 py-1 rounded',
                    subWorkflow.status === 'completed' && 'bg-green-100 text-green-800',
                    subWorkflow.status === 'failed' && 'bg-red-100 text-red-800',
                    (subWorkflow.status === 'running' || subWorkflow.status === 'in_progress') && 'bg-blue-100 text-blue-800',
                    subWorkflow.status === 'pending' && 'bg-gray-100 text-gray-600'
                  )}>
                    {subWorkflow.status}
                  </span>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
        <p className="text-xs text-indigo-700">
          <strong>Hierarchical Workflows:</strong> Each sub-workflow is a focused task that executes sequentially.
          All changes are made on the same branch and can be reviewed together.
        </p>
      </div>
    </div>
  );
}


