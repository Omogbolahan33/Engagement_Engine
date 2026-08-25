import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { GlobeAltIcon, KeyIcon, BoltIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { SkeletonStatGrid, SkeletonTable } from '../components/common/Skeleton';

export default function SiteDetailPage() {
  const { id } = useParams();

  const { data: site, isLoading } = useQuery({
    queryKey: ['sites', id],
    queryFn: () => api.get(`/sites/${id}`).then((r) => r.data.site),
  });

  const { data: stats } = useQuery({
    queryKey: ['sites', id, 'stats'],
    queryFn: () => api.get(`/sites/${id}/stats`).then((r) => r.data.stats),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonStatGrid count={4} />
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  if (!site) return <div className="card">Site not found</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">{site.name}</h1>
        <p className="text-dark-400 mt-1">{site.url}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <ChartBarIcon className="w-5 h-5 text-blue-400 mb-2" />
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
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Site Details</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-dark-400">Platform</dt>
              <dd className="text-dark-200">{site.platform?.replace(/_/g, ' ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Status</dt>
              <dd className={site.isActive ? 'text-green-400' : 'text-red-400'}>
                {site.isActive ? 'Active' : 'Inactive'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Created</dt>
              <dd className="text-dark-200">{new Date(site.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Quick Stats</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-dark-400">Credentials</dt>
              <dd className="text-dark-200">{site.credentials?.length || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Engagements</dt>
              <dd className="text-dark-200">{site.engagements?.length || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dark-400">Proxies</dt>
              <dd className="text-dark-200">{site.proxyConfigs?.length || 0}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Credentials List */}
      <div className="card">
        <h3 className="text-lg font-semibold text-dark-100 mb-4">Credentials</h3>
        {site.credentials?.length === 0 ? (
          <p className="text-dark-500">No credentials configured</p>
        ) : (
          <div className="space-y-2">
            {site.credentials?.map((cred: any) => (
              <div key={cred.id} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <KeyIcon className="w-4 h-4 text-dark-400" />
                  <div>
                    <p className="text-sm text-dark-200">{cred.name}</p>
                    <p className="text-xs text-dark-500">{cred.authType?.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <span className={cred.isActive ? 'badge-success' : 'badge-neutral'}>
                  {cred.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Engagements List */}
      <div className="card">
        <h3 className="text-lg font-semibold text-dark-100 mb-4">Engagements</h3>
        {site.engagements?.length === 0 ? (
          <p className="text-dark-500">No engagements configured</p>
        ) : (
          <div className="space-y-2">
            {site.engagements?.map((eng: any) => (
              <div key={eng.id} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <BoltIcon className="w-4 h-4 text-dark-400" />
                  <div>
                    <p className="text-sm text-dark-200">{eng.name}</p>
                    <p className="text-xs text-dark-500">{eng.engagementType?.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <span className={`badge-${eng.status === 'ACTIVE' ? 'success' : 'neutral'}`}>
                  {eng.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
