import { format, parseISO, differenceInMilliseconds } from 'date-fns';

export interface TimeSeriesDataPoint {
  date: string;
  count: number;
  label: string;
}

export interface StatusDistributionDataPoint {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  status: string;
  duration?: string;
  type?: string;
}

/**
 * Status color mapping for consistent visualization
 */
export const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  planning: '#3b82f6',
  coding: '#f59e0b',
  testing: '#8b5cf6',
  reviewing: '#06b6d4',
  documenting: '#10b981',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280',
};

/**
 * Formats duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Transforms workflows into time series data for trend charts
 */
export function transformToTimeSeries(
  workflows: any[],
  groupBy: 'day' | 'week' | 'month' = 'day'
): TimeSeriesDataPoint[] {
  if (!workflows || workflows.length === 0) {
    return [];
  }

  const grouped = new Map<string, number>();

  workflows.forEach(workflow => {
    try {
      const date = parseISO(workflow.created_at);
      let key: string;

      switch (groupBy) {
        case 'day':
          key = format(date, 'yyyy-MM-dd');
          break;
        case 'week':
          key = format(date, 'yyyy-\'W\'ww');
          break;
        case 'month':
          key = format(date, 'yyyy-MM');
          break;
        default:
          key = format(date, 'yyyy-MM-dd');
      }

      grouped.set(key, (grouped.get(key) || 0) + 1);
    } catch (error) {
      console.warn('Invalid date in workflow:', workflow.id);
    }
  });

  return Array.from(grouped.entries())
    .map(([date, count]) => ({
      date,
      count,
      label: formatDateLabel(date, groupBy),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDateLabel(date: string, groupBy: 'day' | 'week' | 'month'): string {
  try {
    switch (groupBy) {
      case 'day':
        return format(parseISO(date), 'MMM d');
      case 'week':
        return format(parseISO(date), '\'Week\' w');
      case 'month':
        return format(parseISO(date), 'MMM yyyy');
      default:
        return date;
    }
  } catch {
    return date;
  }
}

/**
 * Transforms workflows into status distribution data for pie/donut charts
 */
export function transformToStatusDistribution(
  workflows: any[]
): StatusDistributionDataPoint[] {
  if (!workflows || workflows.length === 0) {
    return [];
  }

  const statusCounts = new Map<string, number>();

  workflows.forEach(workflow => {
    const status = workflow.status;
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });

  const total = workflows.length;

  return Array.from(statusCounts.entries())
    .map(([status, count]) => ({
      name: formatStatusName(status),
      value: count,
      percentage: Math.round((count / total) * 100),
      color: STATUS_COLORS[status] || '#6b7280',
    }))
    .sort((a, b) => b.value - a.value);
}

function formatStatusName(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Calculate workflow statistics
 */
export function calculateWorkflowStats(workflows: any[]) {
  const total = workflows.length;
  const completed = workflows.filter(w => w.status === 'completed').length;
  const failed = workflows.filter(w => w.status === 'failed').length;
  const ongoing = workflows.filter(w =>
    ['planning', 'coding', 'testing', 'reviewing', 'documenting'].includes(w.status)
  ).length;
  const pending = workflows.filter(w => w.status === 'pending').length;

  // Calculate average duration for completed workflows
  const completedWorkflows = workflows.filter(w =>
    w.status === 'completed' && w.created_at && w.completed_at
  );

  let avgDuration = 0;
  if (completedWorkflows.length > 0) {
    const totalDuration = completedWorkflows.reduce((sum, w) => {
      try {
        const duration = differenceInMilliseconds(
          parseISO(w.completed_at),
          parseISO(w.created_at)
        );
        return sum + duration;
      } catch {
        return sum;
      }
    }, 0);
    avgDuration = totalDuration / completedWorkflows.length;
  }

  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    failed,
    ongoing,
    pending,
    avgDuration,
    avgDurationFormatted: formatDuration(avgDuration),
    successRate,
  };
}

/**
 * Get status color for visualization
 */
export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || '#6b7280';
}

