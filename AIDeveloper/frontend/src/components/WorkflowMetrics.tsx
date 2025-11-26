import { TrendingUp, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';
import { calculateWorkflowStats } from '../utils/workflowChartUtils';

interface WorkflowMetricsProps {
  workflows: any[];
  className?: string;
}

export default function WorkflowMetrics({ workflows, className = '' }: WorkflowMetricsProps) {
  const stats = calculateWorkflowStats(workflows);

  const metrics = [
    {
      label: 'Total Workflows',
      value: stats.total,
      icon: Activity,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Completed',
      value: stats.completed,
      icon: CheckCircle,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Failed',
      value: stats.failed,
      icon: XCircle,
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      label: 'In Progress',
      value: stats.ongoing,
      icon: Clock,
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Success Rate',
      value: `${stats.successRate}%`,
      icon: TrendingUp,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Avg Duration',
      value: stats.avgDurationFormatted,
      icon: Clock,
      color: 'bg-cyan-500',
      textColor: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
    },
  ];

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 ${className}`}>
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <div
            key={index}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">{metric.label}</p>
                <p className={`text-2xl font-bold ${metric.textColor}`}>
                  {metric.value}
                </p>
              </div>
              <div className={`${metric.bgColor} p-3 rounded-full`}>
                <Icon className={`h-6 w-6 ${metric.textColor}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


