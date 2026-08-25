import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  GlobeAltIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SkeletonStatGrid, SkeletonChart } from '../components/common/Skeleton';

export default function DashboardPage() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.get('/analytics/overview').then((r) => r.data.overview),
  });

  const { data: runsData } = useQuery({
    queryKey: ['analytics', 'runs-over-time'],
    queryFn: () => api.get('/analytics/runs-over-time?days=14').then((r) => r.data.runs),
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['analytics', 'recent-activity'],
    queryFn: () => api.get('/analytics/recent-activity?limit=10').then((r) => r.data.activity),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonStatGrid count={4} />
        <SkeletonChart />
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Sites',
      value: overview?.sites?.total || 0,
      icon: GlobeAltIcon,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
    },
    {
      label: 'Active Engagements',
      value: overview?.engagements?.active || 0,
      icon: BoltIcon,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10',
    },
    {
      label: 'Successful Runs',
      value: overview?.runs?.successful || 0,
      icon: CheckCircleIcon,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
    },
    {
      label: 'Failed Runs',
      value: overview?.runs?.failed || 0,
      icon: XCircleIcon,
      color: 'text-red-400',
      bgColor: 'bg-red-400/10',
    },
    {
      label: 'Runs Today',
      value: overview?.runs?.today || 0,
      icon: ClockIcon,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
    },
    {
      label: 'Success Rate',
      value: `${overview?.runs?.successRate || '0'}%`,
      icon: ArrowTrendingUpIcon,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Dashboard</h1>
        <p className="text-dark-400 mt-1">Overview of your engagement platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className={`w-10 h-10 ${stat.bgColor} rounded-lg flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Runs Over Time */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Runs Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={runsData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="successful"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#22c55e20"
                  name="Successful"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#ef444420"
                  name="Failed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Recent Activity</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {recentActivity?.map((run: any) => (
              <div
                key={run.id}
                className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    run.status === 'SUCCESS' ? 'bg-green-400' : 'bg-red-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dark-200 truncate">
                    {run.engagement?.name || 'Unknown engagement'}
                  </p>
                  <p className="text-xs text-dark-500">
                    {run.site?.name} • {run.engagement?.engagementType}
                  </p>
                </div>
                <span className="text-xs text-dark-500">
                  {new Date(run.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {(!recentActivity || recentActivity.length === 0) && (
              <p className="text-center text-dark-500 py-8">No recent activity</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
