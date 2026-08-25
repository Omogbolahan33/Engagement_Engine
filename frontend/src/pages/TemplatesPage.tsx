import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { BoltIcon, MagnifyingGlassIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { SkeletonCardGrid } from '../components/common/Skeleton';

export default function TemplatesPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates', search, selectedCategory, selectedPlatform],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedPlatform) params.set('platform', selectedPlatform);
      return api.get(`/templates?${params.toString()}`).then((r) => r.data.templates);
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['templates', 'categories'],
    queryFn: () => api.get('/templates/categories').then((r) => r.data.categories),
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.sites),
  });

  const [showCreate, setShowCreate] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ siteId: '', name: '' });

  const createMutation = useMutation({
    mutationFn: ({ templateId, siteId, name }: { templateId: string; siteId: string; name?: string }) =>
      api.post(`/templates/${templateId}/create`, { siteId, name }),
    onSuccess: (response) => {
      // Now actually create the engagement
      const engagement = response.data.engagement;
      api.post('/engagements', engagement).then(() => {
        queryClient.invalidateQueries({ queryKey: ['engagements'] });
        toast.success('Engagement created from template');
        navigate('/engagements');
      }).catch((err) => {
        toast.error(err.response?.data?.error || 'Failed to create engagement');
      });
      setShowCreate(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Failed'),
  });

  const categoryColors: Record<string, string> = {
    'Social Media': 'bg-blue-600/10 text-blue-400 border-blue-600/20',
    'Forums': 'bg-purple-600/10 text-purple-400 border-purple-600/20',
    'Content': 'bg-green-600/10 text-green-400 border-green-600/20',
    'Q&A': 'bg-yellow-600/10 text-yellow-400 border-yellow-600/20',
    'Reviews': 'bg-orange-600/10 text-orange-400 border-orange-600/20',
    'Messaging': 'bg-pink-600/10 text-pink-400 border-pink-600/20',
    'Analytics': 'bg-cyan-600/10 text-cyan-400 border-cyan-600/20',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Engagement Templates</h1>
        <p className="text-dark-400 mt-1">Pre-built templates to quickly create engagements</p>
      </div>

      {/* Search & Filters */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-dark-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full pl-9"
              placeholder="Search templates..."
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input"
          >
            <option value="">All categories</option>
            {categories?.map((cat: string) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="input"
          >
            <option value="">All platforms</option>
            {['TWITTER', 'REDDIT', 'NAIRALAND', 'QUORA', 'INSTAGRAM', 'LINKEDIN', 'DISCORD', 'TELEGRAM', 'WORDPRESS', 'MEDIUM'].map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <SkeletonCardGrid count={6} />
      ) : templates?.length === 0 ? (
        <div className="card text-center py-12">
          <SparklesIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-dark-300">No templates found</h3>
          <p className="text-dark-500 mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates?.map((template: any) => (
            <div key={template.id} className="card-hover">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={clsx('badge border', categoryColors[template.category] || 'badge-neutral')}>
                    {template.category}
                  </span>
                  {template.platform && (
                    <span className="badge-info ml-2">{template.platform.replace(/_/g, ' ')}</span>
                  )}
                </div>
              </div>

              <h3 className="font-medium text-dark-100 mb-1">{template.name}</h3>
              <p className="text-sm text-dark-400 mb-3">{template.description}</p>

              <div className="flex flex-wrap gap-1 mb-4">
                {template.tags?.map((tag: string) => (
                  <span key={tag} className="text-xs bg-dark-800 text-dark-500 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="text-xs text-dark-500 mb-3">
                <span className="text-dark-400">{template.engagementType?.replace(/_/g, ' ')}</span>
                <span className="mx-2">•</span>
                <span>{template.frequency?.maxPerDay || 100}/day max</span>
              </div>

              <button
                onClick={() => {
                  setShowCreate(template.id);
                  setCreateForm({ siteId: '', name: template.name });
                }}
                className="btn-primary w-full text-sm"
              >
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create from Template Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-dark-100 mb-4">Create from Template</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  templateId: showCreate,
                  siteId: createForm.siteId,
                  name: createForm.name,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="label">Site</label>
                <select
                  value={createForm.siteId}
                  onChange={(e) => setCreateForm({ ...createForm, siteId: e.target.value })}
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
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {createMutation.isPending ? 'Creating...' : 'Create Engagement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
