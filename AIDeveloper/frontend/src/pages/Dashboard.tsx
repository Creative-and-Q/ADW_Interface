import { useEffect, useState } from 'react';
import { statsAPI } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Zap,
} from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { socket, connected } = useWebSocket();

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('stats:updated', () => {
        loadStats();
      });
      socket.on('workflows:updated', () => {
        loadStats();
      });
    }
  }, [socket]);

  const loadStats = async () => {
    try {
      const { data } = await statsAPI.get();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const workflowStatusData = [
    { name: 'Completed', value: stats?.workflows?.completed || 0, color: '#10b981' },
    { name: 'Failed', value: stats?.workflows?.failed || 0, color: '#ef4444' },
    { name: 'In Progress', value: stats?.workflows?.in_progress || 0, color: '#f59e0b' },
    { name: 'Pending', value: stats?.workflows?.pending || 0, color: '#6b7280' },
  ];

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">
            Real-time overview of your AI development workflows
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`h-3 w-3 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            } animate-pulse-slow`}
          ></div>
          <span className="text-sm font-medium text-gray-600">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Workflows"
          value={stats?.workflows?.total || 0}
          icon={Activity}
          color="blue"
          trend="+12%"
        />
        <StatCard
          title="Completed"
          value={stats?.workflows?.completed || 0}
          icon={CheckCircle2}
          color="green"
          trend="+8%"
        />
        <StatCard
          title="Failed"
          value={stats?.workflows?.failed || 0}
          icon={XCircle}
          color="red"
          trend="-3%"
        />
        <StatCard
          title="In Progress"
          value={stats?.workflows?.in_progress || 0}
          icon={Clock}
          color="yellow"
          trend="0%"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-primary-600" />
              Activity (24h)
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats?.recentActivity || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="hour"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={{ fill: '#0ea5e9', r: 4 }}
                activeDot={{ r: 6 }}
                name="Workflows"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Workflow Status Distribution */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Zap className="h-5 w-5 mr-2 text-primary-600" />
              Workflow Status
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={workflowStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {workflowStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {workflowStatusData.map((item) => (
              <div key={item.name} className="flex items-center space-x-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                ></div>
                <span className="text-sm text-gray-600">
                  {item.name}: {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Artifacts Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Artifacts by Type
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats?.artifacts || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="type" stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Agent Stats */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Agent Executions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-blue-900">Total</p>
              <p className="text-2xl font-bold text-blue-600">
                {stats?.agents?.total || 0}
              </p>
            </div>
            <Activity className="h-8 w-8 text-blue-400" />
          </div>
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-green-900">Completed</p>
              <p className="text-2xl font-bold text-green-600">
                {stats?.agents?.completed || 0}
              </p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
          <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-yellow-900">Running</p>
              <p className="text-2xl font-bold text-yellow-600">
                {stats?.agents?.running || 0}
              </p>
            </div>
            <Clock className="h-8 w-8 text-yellow-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend }: any) {
  const colors = {
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-900',
      value: 'text-blue-600',
      icon: 'text-blue-400',
      border: 'border-blue-200',
    },
    green: {
      bg: 'bg-green-50',
      text: 'text-green-900',
      value: 'text-green-600',
      icon: 'text-green-400',
      border: 'border-green-200',
    },
    red: {
      bg: 'bg-red-50',
      text: 'text-red-900',
      value: 'text-red-600',
      icon: 'text-red-400',
      border: 'border-red-200',
    },
    yellow: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-900',
      value: 'text-yellow-600',
      icon: 'text-yellow-400',
      border: 'border-yellow-200',
    },
  };

  const colorScheme = colors[color as keyof typeof colors];

  return (
    <div
      className={`card ${colorScheme.bg} border-2 ${colorScheme.border} hover:shadow-lg transition-shadow`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={`text-sm font-medium ${colorScheme.text}`}>{title}</p>
          <div className="flex items-baseline space-x-2">
            <p className={`text-3xl font-bold ${colorScheme.value}`}>{value}</p>
            {trend && (
              <span className="text-xs font-medium text-gray-500">{trend}</span>
            )}
          </div>
        </div>
        <Icon className={`h-10 w-10 ${colorScheme.icon}`} />
      </div>
    </div>
  );
}

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: any) {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize="12px"
      fontWeight="bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}
