import { Clock, Cpu, CheckCircle, XCircle, FileText, Terminal } from 'lucide-react';
import { differenceInMilliseconds, parseISO } from 'date-fns';
import { formatDuration } from '../utils/workflowChartUtils';

interface WorkflowDetailMetricsProps {
  workflow: any;
  agents: any[];
  artifacts: any[];
  logs: any[];
  className?: string;
}

export default function WorkflowDetailMetrics({
  workflow,
  agents,
  artifacts,
  logs,
  className = '',
}: WorkflowDetailMetricsProps) {
  // Calculate metrics
  const totalDuration = workflow.completed_at && workflow.created_at
    ? differenceInMilliseconds(parseISO(workflow.completed_at), parseISO(workflow.created_at))
    : null;

  const completedAgents = agents.filter(a => a.status === 'completed').length;
  const failedAgents = agents.filter(a => a.status === 'failed').length;

  const metrics = [
    {
      label: 'Total Duration',
      value: totalDuration ? formatDuration(totalDuration) : 'In Progress',
      icon: Clock,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Agents Executed',
      value: agents.length,
      icon: Cpu,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Agents Completed',
      value: completedAgents,
      icon: CheckCircle,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Agents Failed',
      value: failedAgents,
      icon: XCircle,
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      label: 'Artifacts Generated',
      value: artifacts.length,
      icon: FileText,
      color: 'bg-cyan-500',
      textColor: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
    },
    {
      label: 'Log Entries',
      value: logs.length,
      icon: Terminal,
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
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
