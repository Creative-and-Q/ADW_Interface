import { format, parseISO } from 'date-fns';
import { CheckCircle, XCircle, Clock, Play } from 'lucide-react';
import { getStatusColor } from '../utils/workflowChartUtils';
import clsx from 'clsx';

interface WorkflowTimelineProps {
  workflow: any;
  className?: string;
}

export default function WorkflowTimeline({ workflow, className = '' }: WorkflowTimelineProps) {
  // Create timeline events from workflow data
  const events = [];

  // Workflow created
  events.push({
    id: 'created',
    title: 'Workflow Created',
    description: `Type: ${workflow.workflow_type}`,
    timestamp: workflow.created_at,
    status: 'pending',
  });

  // Add status transitions based on current status
  const statusFlow = ['planning', 'coding', 'testing', 'reviewing', 'documenting'];
  const currentStatusIndex = statusFlow.indexOf(workflow.status);

  statusFlow.forEach((status, index) => {
    if (index <= currentStatusIndex || workflow.status === 'completed' || workflow.status === 'failed') {
      events.push({
        id: status,
        title: status.charAt(0).toUpperCase() + status.slice(1),
        description: `${status.charAt(0).toUpperCase() + status.slice(1)} stage`,
        timestamp: workflow.updated_at, // Using updated_at as approximation
        status: index < currentStatusIndex ? 'completed' : status,
      });
    }
  });

  // Workflow completion or failure
  if (workflow.completed_at) {
    events.push({
      id: workflow.status,
      title: workflow.status === 'completed' ? 'Completed Successfully' : 'Failed',
      description: workflow.status === 'completed'
        ? 'All stages completed'
        : 'Workflow execution failed',
      timestamp: workflow.completed_at,
      status: workflow.status,
    });
  }

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

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Execution Timeline</h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        {/* Events */}
        <div className="space-y-6">
          {events.map((event, index) => {
            const Icon = getStatusIcon(event.status);
            const color = getStatusColor(event.status);

            return (
              <div key={event.id} className="relative flex items-start">
                {/* Timeline marker */}
                <div
                  className="absolute left-0 flex items-center justify-center w-8 h-8 rounded-full border-4 border-white shadow-md z-10"
                  style={{ backgroundColor: color }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </div>

                {/* Event content */}
                <div className="ml-12 flex-1">
                  <div className={clsx(
                    "p-4 rounded-lg border transition-all duration-200",
                    index === events.length - 1 ? "border-gray-300 bg-gray-50" : "border-gray-200 hover:shadow-md"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">{event.title}</h4>
                      <time className="text-xs text-gray-500 font-mono">
                        {format(parseISO(event.timestamp), 'MMM d, HH:mm:ss')}
                      </time>
                    </div>
                    <p className="text-sm text-gray-600">{event.description}</p>
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
