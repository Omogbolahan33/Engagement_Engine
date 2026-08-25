import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function AnalyticsPage() {
  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.get('/analytics/overview').then((r) => r.data.overview),
  });

  const { data: runsData } = useQuery({
    queryKey: ['analytics', 'runs-over-time'],
    queryFn: () => api.get('/analytics/runs-over-time?days=30').then((r) => r.data.runs),
  });

  const { data: byType } = useQuery({
    queryKey: ['analytics', 'by-type'],
    queryFn: () => api.get('/analytics/by-type').then((r) => r.data.breakdown),
  });

  const { data: sitePerformance } = useQuery({
    queryKey: ['analytics', 'site-performance'],
    queryFn: () => api.get('/analytics/site-performance').then((r) => r.data.performance),
  });

  const { data: auditLogs } = useQuery({
    queryKey: ['analytics', 'audit-logs'],
    queryFn: () => api.get('/analytics/audit-logs?limit=20').then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Analytics</h1>
        <p className="text-dark-400 mt-1">Insights into your engagement performance</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <span className="stat-value">{overview?.runs?.total || 0}</span>
          <span className="stat-label">Total Runs</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-green-400">{overview?.runs?.successful || 0}</span>
          <span className="stat-label">Successful</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-red-400">{overview?.runs?.failed || 0}</span>
          <span className="stat-label">Failed</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{overview?.runs?.successRate || '0'}%</span>
          <span className="stat-label">Success Rate</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Runs Over Time */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Runs Over Time (30 days)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={runsData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                <Legend />
                <Line type="monotone" dataKey="successful" stroke="#22c55e" strokeWidth={2} name="Successful" />
                <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} name="Failed" />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Total" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Engagement Type */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">By Engagement Type</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byType || []}
                  dataKey="total"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ type, percent }) => `${type?.replace(/_/g, ' ')} ${(percent * 100).toFixed(0)}%`}
                  fontSize={11}
                >
                  {(byType || []).map((_: any, index: number) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Site Performance */}
      <div className="card">
        <h3 className="text-lg font-semibold text-dark-100 mb-4">Site Performance</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sitePerformance || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Legend />
              <Bar dataKey="successful" fill="#22c55e" name="Successful" />
              <Bar dataKey="failed" fill="#ef4444" name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="card">
        <h3 className="text-lg font-semibold text-dark-100 mb-4">Audit Logs</h3>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Resource</th>
                <th>User</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs?.logs?.map((log: any) => (
                <tr key={log.id}>
                  <td className="font-mono text-xs">{log.action}</td>
                  <td className="text-dark-400">{log.resource}</td>
                  <td className="text-dark-400">{log.user?.email || 'System'}</td>
                  <td className="text-dark-500 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
