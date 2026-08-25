import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { PlusIcon, BoltIcon, PlayIcon, PauseIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { SkeletonTable } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { VirtualTable } from '../components/common/VirtualList';
import { SelectCheckbox, BulkActionBar } from '../components/common/BulkSelect';
import { useBulkSelection } from '../hooks/useBulkSelection';

const ENGAGEMENT_TYPES = [
  'LIKE', 'DISLIKE', 'UPVOTE', 'DOWNVOTE', 'LOVE',
  'CREATE_POST', 'CREATE_COMMENT', 'REPLY_TO_COMMENT', 'CREATE_THREAD', 'CREATE_REVIEW',
  'SHARE_POST', 'RETWEET', 'REPOST', 'QUOTE_POST', 'BOOKMARK',
  'FOLLOW_USER', 'UNFOLLOW_USER', 'JOIN_GROUP', 'SUBSCRIBE_CHANNEL',
  'FLAG_CONTENT', 'REPORT_CONTENT', 'BLOCK_USER',
  'SEND_MESSAGE', 'SEND_DM',
  'CREATE_ACCOUNT', 'UPDATE_PROFILE',
  'SCRAPE_CONTENT', 'SCRAPE_USER_DATA', 'MONITOR_MENTIONS',
];

export default function EngagementsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    siteId: '',
    name: '',
    engagementType: 'LIKE',
    targetConfig: '{}',
    frequency: {
      maxPerMinute: 1,
      maxPerHour: 10,
      maxPerDay: 100,
    },
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const {
    data: engagements,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['engagements'],
    queryFn: () => api.get('/engagements').then((r) => r.data.engagements),
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.sites),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/engagements', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      setShowCreate(false);
      toast.success('Engagement created');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Failed to create'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/engagements/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      toast.success('Engagement activated');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.post(`/engagements/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      toast.success('Engagement paused');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/engagements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      toast.success('Engagement deleted');
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/engagements/${id}/execute`),
    onSuccess: () => toast.success('Engagement queued for execution'),
    onError: (error: any) => toast.error(error.response?.data?.error || 'Failed to execute'),
  });

  const rows: any[] = engagements ?? [];
  const selection = useBulkSelection<any>(rows, (engagement) => engagement.id);

  /**
   * Bulk actions run sequentially against the per-item endpoints rather than in
   * parallel: these hit rate-limited third-party platforms, and a burst of
   * simultaneous activations is exactly what the per-engagement limiter exists
   * to prevent.
   */
  const runBulk = async (
    label: string,
    action: (id: string) => Promise<unknown>
  ) => {
    const ids = selection.selectedIds;
    let succeeded = 0;

    for (const id of ids) {
      try {
        await action(id);
        succeeded++;
      } catch {
        // Keep going — one failure should not abandon the rest.
      }
    }

    queryClient.invalidateQueries({ queryKey: ['engagements'] });
    selection.clear();

    if (succeeded === ids.length) {
      toast.success(`${label} ${succeeded} engagement${succeeded === 1 ? '' : 's'}`);
    } else {
      toast.error(`${label} ${succeeded} of ${ids.length} — ${ids.length - succeeded} failed`);
    }
  };

  const statusColors: Record<string, string> = {
    DRAFT: 'badge-neutral',
    SCHEDULED: 'badge-info',
    ACTIVE: 'badge-success',
    PAUSED: 'badge-warning',
    COMPLETED: 'badge-info',
    FAILED: 'badge-error',
    EXPIRED: 'badge-neutral',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Engagements</h1>
          <p className="text-dark-400 mt-1">Manage your engagement automations</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          New Engagement
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-dark-100 mb-4">Create Engagement</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  ...form,
                  targetConfig: JSON.parse(form.targetConfig),
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="label">Site</label>
                <select
                  value={form.siteId}
                  onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">Select a site</option>
                  {sites?.map((site: any) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input w-full"
                  placeholder="Like top posts"
                  required
                />
              </div>
              <div>
                <label className="label">Type</label>
                <select
                  value={form.engagementType}
                  onChange={(e) => setForm({ ...form, engagementType: e.target.value })}
                  className="input w-full"
                >
                  {ENGAGEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Target Config (JSON)</label>
                <textarea
                  value={form.targetConfig}
                  onChange={(e) => setForm({ ...form, targetConfig: e.target.value })}
                  className="input w-full font-mono text-sm"
                  rows={4}
                  placeholder='{"postId": "123"}'
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Per Minute</label>
                  <input
                    type="number"
                    value={form.frequency.maxPerMinute}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        frequency: { ...form.frequency, maxPerMinute: +e.target.value },
                      })
                    }
                    className="input w-full"
                    min={1}
                  />
                </div>
                <div>
                  <label className="label">Per Hour</label>
                  <input
                    type="number"
                    value={form.frequency.maxPerHour}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        frequency: { ...form.frequency, maxPerHour: +e.target.value },
                      })
                    }
                    className="input w-full"
                    min={1}
                  />
                </div>
                <div>
                  <label className="label">Per Day</label>
                  <input
                    type="number"
                    value={form.frequency.maxPerDay}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        frequency: { ...form.frequency, maxPerDay: +e.target.value },
                      })
                    }
                    className="input w-full"
                    min={1}
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Engagements Table */}
      {isLoading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : error ? (
        <ErrorState error={error} resource="engagements" onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <div className="card text-center py-12">
          <BoltIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-dark-300">No engagements yet</h3>
          <p className="text-dark-500 mt-1">Create your first engagement to get started</p>
        </div>
      ) : (
        <>
          <VirtualTable
            items={rows}
            columnCount={7}
            label="Engagements"
            getKey={(engagement) => engagement.id}
            header={
              <tr>
                <th scope="col" className="w-12">
                  <SelectCheckbox
                    checked={selection.allSelected}
                    indeterminate={selection.indeterminate}
                    onChange={selection.toggleAll}
                    label={selection.allSelected ? 'Deselect all' : 'Select all'}
                  />
                </th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Site</th>
                <th scope="col">Status</th>
                <th scope="col">Runs</th>
                <th scope="col">Actions</th>
              </tr>
            }
            renderRow={(eng: any) => {
              const selected = selection.isSelected(eng.id);

              return (
                <tr
                  className={clsx('cursor-pointer', selected && 'bg-primary-600/10')}
                  onClick={() => navigate(`/engagements/${eng.id}`)}
                  // Rows are clickable, so they must also be reachable and
                  // actionable from the keyboard.
                  tabIndex={0}
                  role="row"
                  aria-selected={selected}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') navigate(`/engagements/${eng.id}`);
                    if (event.key === ' ') {
                      event.preventDefault();
                      selection.toggle(eng.id);
                    }
                  }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <SelectCheckbox
                      checked={selected}
                      onChange={(event) =>
                        selection.toggle(eng.id, event as React.MouseEvent)
                      }
                      label={`Select ${eng.name}`}
                    />
                  </td>
                  <td className="font-medium text-dark-100">{eng.name}</td>
                  <td>
                    <span className="badge-info">{eng.engagementType?.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="text-dark-400">{eng.site?.name}</td>
                  <td>
                    <span className={statusColors[eng.status] || 'badge-neutral'}>{eng.status}</span>
                  </td>
                  <td className="text-dark-400">{eng._count?.runs || 0}</td>
                  <td>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {eng.status !== 'ACTIVE' ? (
                        <button
                          onClick={() => activateMutation.mutate(eng.id)}
                          className="btn-ghost text-xs text-green-400"
                          aria-label={`Activate ${eng.name}`}
                          title="Activate"
                        >
                          <PlayIcon className="w-4 h-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          onClick={() => pauseMutation.mutate(eng.id)}
                          className="btn-ghost text-xs text-yellow-400"
                          aria-label={`Pause ${eng.name}`}
                          title="Pause"
                        >
                          <PauseIcon className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        onClick={() => executeMutation.mutate(eng.id)}
                        className="btn-ghost text-xs text-blue-400"
                        aria-label={`Execute ${eng.name} now`}
                        title="Execute Now"
                      >
                        <PlayIcon className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${eng.name}"?`)) deleteMutation.mutate(eng.id);
                        }}
                        className="btn-ghost text-xs text-red-400"
                        aria-label={`Delete ${eng.name}`}
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }}
          />

          <BulkActionBar count={selection.selectedCount} onClear={selection.clear}>
            <button
              type="button"
              className="btn-ghost text-sm text-green-400"
              onClick={() =>
                runBulk('Activated', (id) => api.post(`/engagements/${id}/activate`))
              }
            >
              Activate
            </button>
            <button
              type="button"
              className="btn-ghost text-sm text-yellow-400"
              onClick={() => runBulk('Paused', (id) => api.post(`/engagements/${id}/pause`))}
            >
              Pause
            </button>
            <button
              type="button"
              className="btn-ghost text-sm text-red-400"
              onClick={() => {
                if (
                  confirm(
                    `Delete ${selection.selectedCount} engagement${
                      selection.selectedCount === 1 ? '' : 's'
                    }? This cannot be undone.`
                  )
                ) {
                  runBulk('Deleted', (id) => api.delete(`/engagements/${id}`));
                }
              }}
            >
              Delete
            </button>
          </BulkActionBar>
        </>
      )}
    </div>
  );
}
