import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import clsx from 'clsx';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function MetricsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'runs' | 'failures'>('overview');
  const [filters, setFilters] = useState({
    siteId: '',
    engagementType: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.engagementType) params.set('engagementType', filters.engagementType);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      return api.get(`/metrics?${params.toString()}`).then((r) => r.data.metrics);
    },
  });

  // Fetch run history
  const { data: runsData } = useQuery({
    queryKey: ['metrics', 'runs', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.engagementType) params.set('engagementType', filters.engagementType);
      params.set('limit', '100');
      return api.get(`/metrics/runs?${params.toString()}`).then((r) => r.data);
    },
  });

  // Fetch failure analysis
  const { data: failureAnalysis } = useQuery({
    queryKey: ['metrics', 'failures', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      return api.get(`/metrics/failures?${params.toString()}`).then((r) => r.data.analysis);
    },
  });

  // Fetch run detail
  const { data: runDetail } = useQuery({
    queryKey: ['metrics', 'run', selectedRun],
    queryFn: () => api.get(`/metrics/runs/${selectedRun}`).then((r) => r.data.run),
    enabled: !!selectedRun,
  });

  // Fetch sites for filter
  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.sites),
  });

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'runs' as const, label: 'Run History' },
    { id: 'failures' as const, label: 'Failure Analysis' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Metrics & Logs</h1>
        <p className="text-dark-400 mt-1">Detailed engagement execution metrics, logs, and failure analysis</p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="label">Site</label>
            <select
              value={filters.siteId}
              onChange={(e) => setFilters({ ...filters, siteId: e.target.value })}
              className="input w-full text-sm"
            >
              <option value="">All sites</option>
              {sites?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input w-full text-sm"
            >
              <option value="">All statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="RUNNING">Running</option>
              <option value="PENDING">Pending</option>
              <option value="RETRYING">Retrying</option>
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="input w-full text-sm"
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="input w-full text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setFilters({ siteId: '', engagementType: '', status: '', dateFrom: '', dateTo: '' })}
              className="btn-secondary w-full text-sm"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-900 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'text-dark-400 hover:text-dark-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && metrics && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: 'Total Runs', value: metrics.totalRuns, color: 'text-dark-100' },
              { label: 'Successful', value: metrics.successfulRuns, color: 'text-green-400' },
              { label: 'Failed', value: metrics.failedRuns, color: 'text-red-400' },
              { label: 'Success Rate', value: `${metrics.successRate?.toFixed(1)}%`, color: 'text-blue-400' },
              { label: 'Avg Response', value: `${metrics.avgResponseTimeMs}ms`, color: 'text-dark-100' },
              { label: 'P50', value: `${metrics.p50ResponseTimeMs}ms`, color: 'text-dark-100' },
              { label: 'P95', value: `${metrics.p95ResponseTimeMs}ms`, color: 'text-yellow-400' },
              { label: 'P99', value: `${metrics.p99ResponseTimeMs}ms`, color: 'text-red-400' },
            ].map((stat) => (
              <div key={stat.label} className="stat-card">
                <span className={clsx('text-2xl font-bold', stat.color)}>{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Timeline */}
            <div className="card">
              <h3 className="text-lg font-semibold text-dark-100 mb-4">30-Day Timeline</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeline || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="successful" stroke="#22c55e" strokeWidth={2} name="Success" />
                    <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} name="Failed" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* By Type */}
            <div className="card">
              <h3 className="text-lg font-semibold text-dark-100 mb-4">By Engagement Type</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.runsByEngagementType || []}
                      dataKey="total"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ type, percent }) => `${(type as string)?.replace(/_/g, ' ')} ${(percent * 100).toFixed(0)}%`}
                      fontSize={10}
                    >
                      {(metrics.runsByEngagementType || []).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Errors */}
          {metrics.topErrors?.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-dark-100 mb-4">Top Errors</h3>
              <div className="space-y-2">
                {metrics.topErrors.map((err: any, i: number) => (
                  <div key={i} className="flex items-center gap-4 p-3 bg-dark-800 rounded-lg">
                    <span className="text-red-400 font-mono text-sm">{err.count}x</span>
                    <span className="text-dark-300 text-sm flex-1 truncate">{err.error}</span>
                    <span className="text-dark-600 text-xs">
                      Last: {new Date(err.last_occurred).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Runs Tab */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Engagement</th>
                  <th>Type</th>
                  <th>Site</th>
                  <th>Duration</th>
                  <th>HTTP</th>
                  <th>Error</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {runsData?.runs?.map((run: any) => (
                  <tr
                    key={run.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedRun(run.id)}
                  >
                    <td>
                      <span className={run.status === 'SUCCESS' ? 'badge-success' : run.status === 'FAILED' ? 'badge-error' : 'badge-warning'}>
                        {run.status}
                      </span>
                    </td>
                    <td className="font-medium text-dark-100">{run.engagementName}</td>
                    <td className="text-dark-400 text-xs">{run.engagementType?.replace(/_/g, ' ')}</td>
                    <td className="text-dark-400">{run.siteName}</td>
                    <td className="text-dark-400">{run.durationMs ? `${run.durationMs}ms` : '-'}</td>
                    <td className="text-dark-400">{run.httpStatusCode || '-'}</td>
                    <td className="text-red-400 text-xs max-w-[200px] truncate">{run.errorMessage || '-'}</td>
                    <td className="text-dark-500 text-xs">{new Date(run.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Run Detail Modal */}
          {selectedRun && runDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedRun(null)}>
              <div className="card w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-dark-100">Run Detail</h2>
                  <button onClick={() => setSelectedRun(null)} className="btn-ghost">✕</button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-dark-800 rounded-lg p-3">
                    <p className="text-xs text-dark-500">Status</p>
                    <p className={runDetail.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}>{runDetail.status}</p>
                  </div>
                  <div className="bg-dark-800 rounded-lg p-3">
                    <p className="text-xs text-dark-500">Duration</p>
                    <p className="text-dark-200">{runDetail.durationMs ? `${runDetail.durationMs}ms` : 'N/A'}</p>
                  </div>
                  <div className="bg-dark-800 rounded-lg p-3">
                    <p className="text-xs text-dark-500">HTTP Status</p>
                    <p className="text-dark-200">{runDetail.httpStatusCode || 'N/A'}</p>
                  </div>
                  <div className="bg-dark-800 rounded-lg p-3">
                    <p className="text-xs text-dark-500">Error Category</p>
                    <p className="text-dark-200">{runDetail.errorCategory || 'N/A'}</p>
                  </div>
                  <div className="bg-dark-800 rounded-lg p-3">
                    <p className="text-xs text-dark-500">Request</p>
                    <p className="text-dark-200 font-mono text-sm">{runDetail.requestMethod} {runDetail.requestUrl}</p>
                  </div>
                  <div className="bg-dark-800 rounded-lg p-3">
                    <p className="text-xs text-dark-500">Credential</p>
                    <p className="text-dark-200">{runDetail.credentialName || 'None'} ({runDetail.credentialAuthType || 'N/A'})</p>
                  </div>
                </div>

                {runDetail.errorMessage && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-dark-300 mb-1">Error Message</h4>
                    <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3">
                      <p className="text-red-400 text-sm font-mono">{runDetail.errorMessage}</p>
                    </div>
                  </div>
                )}

                {runDetail.requestBody && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-dark-300 mb-1">Request Body</h4>
                    <pre className="bg-dark-950 rounded-lg p-3 text-sm font-mono text-dark-400 overflow-x-auto">
                      {JSON.stringify(runDetail.requestBody, null, 2)}
                    </pre>
                  </div>
                )}

                {runDetail.responseBody && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-dark-300 mb-1">Response Body</h4>
                    <pre className="bg-dark-950 rounded-lg p-3 text-sm font-mono text-dark-400 overflow-x-auto max-h-48 overflow-y-auto">
                      {JSON.stringify(runDetail.responseBody, null, 2)}
                    </pre>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium text-dark-300 mb-1">Full Metadata</h4>
                  <pre className="bg-dark-950 rounded-lg p-3 text-xs font-mono text-dark-500 overflow-x-auto max-h-48 overflow-y-auto">
                    {JSON.stringify(runDetail.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Failures Tab */}
      {activeTab === 'failures' && failureAnalysis && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="card">
            <h3 className="text-lg font-semibold text-dark-100 mb-4">
              Failure Summary — {failureAnalysis.totalFailures} total failures
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {failureAnalysis.byCategory?.map((cat: any) => (
                <div key={cat.category} className="bg-dark-800 rounded-lg p-4">
                  <p className="text-2xl font-bold text-red-400">{cat.count}</p>
                  <p className="text-sm text-dark-400">{cat.category}</p>
                  <p className="text-xs text-dark-600">{cat.percentage?.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* By Error Code */}
          <div className="card">
            <h3 className="text-lg font-semibold text-dark-100 mb-4">By Error Code</h3>
            <div className="space-y-2">
              {failureAnalysis.byErrorCode?.map((err: any, i: number) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-dark-800 rounded-lg">
                  <span className="badge-error">{err.code}</span>
                  <span className="text-dark-300 text-sm flex-1">{err.sample_message}</span>
                  <span className="text-dark-500 text-sm">{err.count} occurrences</span>
                  <span className="text-dark-600 text-xs">
                    Last: {new Date(err.last_occurred).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* By Platform */}
          <div className="card">
            <h3 className="text-lg font-semibold text-dark-100 mb-4">By Platform</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={failureAnalysis.byPlatform || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="platform" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                  <Legend />
                  <Bar dataKey="failures" fill="#ef4444" name="Failures" />
                  <Bar dataKey="total" fill="#3b82f6" name="Total" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Failures */}
          <div className="card">
            <h3 className="text-lg font-semibold text-dark-100 mb-4">Recent Failures</h3>
            <div className="space-y-2">
              {failureAnalysis.recentFailures?.map((run: any) => (
                <div
                  key={run.id}
                  className="flex items-center gap-4 p-3 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700"
                  onClick={() => {
                    setSelectedRun(run.id);
                    setActiveTab('runs');
                  }}
                >
                  <span className="badge-error">{run.errorCategory}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-dark-200">{run.engagementName}</p>
                    <p className="text-xs text-dark-500">{run.siteName} • {run.engagementType?.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="text-red-400 text-xs max-w-[200px] truncate">{run.errorMessage}</span>
                  <span className="text-dark-600 text-xs">{new Date(run.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
