import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { BoltIcon, PlayIcon, PauseIcon, ClockIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { SkeletonStatGrid, SkeletonTable } from '../components/common/Skeleton';

export default function EngagementDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data: engagement, isLoading } = useQuery({
    queryKey: ['engagements', id],
    queryFn: () => api.get(`/engagements/${id}`).then((r) => r.data.engagement),
  });

  const { data: stats } = useQuery({
    queryKey: ['engagements', id, 'stats'],
    queryFn: () => api.get(`/engagements/${id}/stats`).then((r) => r.data.stats),
  });

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/engagements/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagements', id] });
      toast.success('Activated');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/engagements/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagements', id] });
      toast.success('Paused');
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => api.post(`/engagements/${id}/execute`),
    onSuccess: () => toast.success('Queued for execution'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonStatGrid count={4} />
        <SkeletonTable rows={5} columns={5} />
      </div>
    );
  }

  if (!engagement) return <div className="card">Engagement not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">{engagement.name}</h1>
          <p className="text-dark-400 mt-1">
            {engagement.engagementType?.replace(/_/g, ' ')} • {engagement.site?.name}
          </p>
        </div>
        <div className="flex gap-2">
          {engagement.status !== 'ACTIVE' ? (
            <button onClick={() => activateMutation.mutate()} className="btn-primary flex items-center gap-2">
              <PlayIcon className="w-4 h-4" />
              Activate
            </button>
          ) : (
            <button onClick={() => pauseMutation.mutate()} className="btn-secondary flex items-center gap-2">
              <PauseIcon className="w-4 h-4" />
              Pause
            </button>
          )}
          <button onClick={() => executeMutation.mutate()} className="btn-secondary flex items-center gap-2">
            <PlayIcon className="w-4 h-4" />
            Execute Now
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <span className="stat-value">{stats?.totalRuns || 0}</span>
          <span className="stat-label">Total Runs</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-green-400">{stats?.successfulRuns || 0}</span>
          <span className="stat-label">Successful</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-red-400">{stats?.failedRuns || 0}</span>
          <span className="stat-label">Failed</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats?.successRate?.toFixed(1) || 0}%</span>
          <span className="stat-label">Success Rate</span>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Configuration</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-dark-400">Status</dt>
              <dd className="text-dark-200">{engagement.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Priority</dt>
              <dd className="text-dark-200">{engagement.priority}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Max/Min</dt>
              <dd className="text-dark-200">{(engagement.frequency as any)?.maxPerMinute || 1}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Max/Hour</dt>
              <dd className="text-dark-200">{(engagement.frequency as any)?.maxPerHour || 10}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Max/Day</dt>
              <dd className="text-dark-200">{(engagement.frequency as any)?.maxPerDay || 100}</dd>
            </div>
            {engagement.expiresAt && (
              <div className="flex justify-between">
                <dt className="text-dark-400">Expires</dt>
                <dd className="text-dark-200">{new Date(engagement.expiresAt).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Target Config</h3>
          <pre className="bg-dark-800 rounded-lg p-4 text-sm text-dark-300 overflow-x-auto">
            {JSON.stringify(engagement.targetConfig, null, 2)}
          </pre>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="card">
        <h3 className="text-lg font-semibold text-dark-100 mb-4">Recent Runs</h3>
        {engagement.runs?.length === 0 ? (
          <p className="text-dark-500">No runs yet</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {engagement.runs?.map((run: any) => (
                  <tr key={run.id}>
                    <td>
                      <span className={run.status === 'SUCCESS' ? 'badge-success' : 'badge-error'}>
                        {run.status}
                      </span>
                    </td>
                    <td className="text-dark-400">
                      {run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}
                    </td>
                    <td className="text-dark-400">
                      {run.completedAt && run.startedAt
                        ? `${new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()}ms`
                        : '-'}
                    </td>
                    <td className="text-red-400 text-xs max-w-xs truncate">
                      {run.errorMessage || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="card">
        <h3 className="text-lg font-semibold text-dark-100 mb-4">Logs</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {engagement.logs?.map((log: any) => (
            <div key={log.id} className="flex items-start gap-3 p-2 text-sm">
              <span
                className={`badge-${log.level === 'ERROR' ? 'error' : log.level === 'WARN' ? 'warning' : 'info'} flex-shrink-0`}
              >
                {log.level}
              </span>
              <span className="text-dark-300">{log.message}</span>
              <span className="text-dark-600 text-xs ml-auto flex-shrink-0">
                {new Date(log.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {(!engagement.logs || engagement.logs.length === 0) && (
            <p className="text-dark-500 text-center py-4">No logs</p>
          )}
        </div>
      </div>
    </div>
  );
}
