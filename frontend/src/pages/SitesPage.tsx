import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { PlusIcon, GlobeAltIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { SkeletonCardGrid } from '../components/common/Skeleton';

const PLATFORM_GROUPS = [
  {
    label: 'Social Media',
    platforms: ['TWITTER', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'REDDIT', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'THREADS', 'MASTODON', 'BLUESKY', 'MINDS', 'WEIBO', 'VK'],
  },
  {
    label: 'Forums & Communities',
    platforms: ['NAIRALAND', 'REDDIT', 'QUORA', 'STACKOVERFLOW', 'DISCOURSE', 'PHPBB', 'VBBULLETIN', 'NODEBB', 'FLARUM', 'LEMMY', 'STEEMIT', 'FOURCHAN'],
  },
  {
    label: 'Content & Blogging',
    platforms: ['WORDPRESS', 'MEDIUM', 'SUBSTACK', 'GHOST', 'DEVTO', 'HASHNODE', 'BLOGGER', 'TUMBLR'],
  },
  {
    label: 'Review Sites',
    platforms: ['TRUSTPILOT', 'GLASSDOOR', 'YELP', 'G2', 'CAPTERRA', 'PRODUCTHUNT'],
  },
  {
    label: 'E-commerce',
    platforms: ['AMAZON', 'EBAY', 'SHOPIFY', 'ETSY', 'ALIEXPRESS'],
  },
  {
    label: 'News & Discussion',
    platforms: ['HACKERNEWS', 'SLASHDOT', 'DIGG'],
  },
  {
    label: 'Messaging',
    platforms: ['DISCORD', 'SLACK', 'TELEGRAM', 'WHATSAPP', 'SIGNAL'],
  },
  {
    label: 'Custom',
    platforms: ['CUSTOM_API', 'CUSTOM_BROWSER', 'CUSTOM_WEBHOOK'],
  },
];

const PLATFORMS = PLATFORM_GROUPS.flatMap((g) => g.platforms);

export default function SitesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    url: '',
    platform: 'CUSTOM_API',
    description: '',
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.sites),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/sites', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setShowCreate(false);
      setForm({ name: '', url: '', platform: 'CUSTOM_API', description: '' });
      toast.success('Site created');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create site');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast.success('Site deleted');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Sites</h1>
          <p className="text-dark-400 mt-1">Manage your target platforms</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          Add Site
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg mx-4">
            <h2 className="text-xl font-bold text-dark-100 mb-4">Add New Site</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(form);
              }}
              className="space-y-4"
            >
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input w-full"
                  placeholder="My Twitter Account"
                  required
                />
              </div>
              <div>
                <label className="label">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="input w-full"
                  placeholder="https://twitter.com"
                  required
                />
              </div>
              <div>
                <label className="label">Platform</label>
                <select
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  className="input w-full"
                >
                  {PLATFORM_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.platforms.map((p) => (
                        <option key={p} value={p}>
                          {p.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input w-full"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {createMutation.isPending ? 'Creating...' : 'Create Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sites Grid */}
      {isLoading ? (
        <SkeletonCardGrid count={6} />
      ) : sites?.length === 0 ? (
        <div className="card text-center py-12">
          <GlobeAltIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-dark-300">No sites yet</h3>
          <p className="text-dark-500 mt-1">Add your first site to start engaging</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites?.map((site: any) => (
            <div
              key={site.id}
              className="card-hover cursor-pointer"
              onClick={() => navigate(`/sites/${site.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-600/10 rounded-lg flex items-center justify-center">
                    <GlobeAltIcon className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-dark-100">{site.name}</h3>
                    <p className="text-xs text-dark-500">{site.url}</p>
                  </div>
                </div>
                <span className={clsx('badge', site.isActive ? 'badge-success' : 'badge-neutral')}>
                  {site.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-dark-400">
                <span>{site.platform?.replace(/_/g, ' ')}</span>
                <span>{site._count?.engagements || 0} engagements</span>
                <span>{site._count?.credentials || 0} credentials</span>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/sites/${site.id}`);
                  }}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  <PencilIcon className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this site?')) deleteMutation.mutate(site.id);
                  }}
                  className="btn-ghost text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <TrashIcon className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
