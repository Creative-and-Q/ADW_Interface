import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { differenceInSeconds, parseISO } from 'date-fns';
import { getStatusColor } from '../utils/workflowChartUtils';

interface AgentExecutionChartProps {
  agents: any[];
  className?: string;
}

export default function AgentExecutionChart({ agents, className = '' }: AgentExecutionChartProps) {
  // Transform agent data for the chart
  const chartData = agents
    .filter(agent => agent.started_at) // Only include agents that have started
    .map(agent => {
      const duration = agent.completed_at && agent.started_at
        ? differenceInSeconds(parseISO(agent.completed_at), parseISO(agent.started_at))
        : agent.started_at
        ? differenceInSeconds(new Date(), parseISO(agent.started_at))
        : 0;

      return {
        name: agent.agent_type.charAt(0).toUpperCase() + agent.agent_type.slice(1),
        duration: Math.max(0, duration), // Duration in seconds
        status: agent.status,
        id: agent.id,
      };
    });

  if (chartData.length === 0) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Execution Duration</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          No agent execution data available yet
        </div>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Execution Duration</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: 'Duration (seconds)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          />
          <Tooltip
            formatter={(value: number) => formatDuration(value)}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
          />
          <Legend />
          <Bar dataKey="duration" name="Execution Time" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: getStatusColor('completed') }} />
          <span className="text-gray-600">Completed</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: getStatusColor('running') }} />
          <span className="text-gray-600">Running</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: getStatusColor('failed') }} />
          <span className="text-gray-600">Failed</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: getStatusColor('pending') }} />
          <span className="text-gray-600">Pending</span>
        </div>
      </div>
    </div>
  );
}
