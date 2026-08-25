import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { PlusIcon, KeyIcon, TrashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { SkeletonCardGrid } from '../components/common/Skeleton';

const AUTH_TYPES = [
  { group: 'Token-Based', types: ['API_KEY', 'BEARER_TOKEN', 'SESSION_TOKEN', 'JWT_TOKEN', 'PERSONAL_ACCESS_TOKEN'] },
  { group: 'OAuth 2.0', types: ['OAUTH2_CLIENT_CREDENTIALS', 'OAUTH2_AUTHORIZATION_CODE', 'OAUTH2_DEVICE_CODE'] },
  { group: 'Username/Password', types: ['BASIC_AUTH', 'FORM_LOGIN', 'DIGEST_AUTH', 'NTLM_AUTH'] },
  { group: 'Cookie/Session', types: ['COOKIE_AUTH', 'SESSION_COOKIE', 'CSRF_TOKEN_PLUS_SESSION'] },
  { group: 'Header-Based', types: ['CUSTOM_HEADER', 'HMAC_SIGNATURE', 'REQUEST_SIGNING'] },
  { group: 'Certificate', types: ['MTLS_CERTIFICATE', 'CLIENT_CERTIFICATE'] },
  { group: 'Platform-Specific', types: ['TWITTER_OAUTH1', 'TWITTER_OAUTH2', 'GOOGLE_OAUTH2', 'FACEBOOK_LOGIN', 'GITHUB_APP', 'SLACK_BOT_TOKEN', 'DISCORD_BOT_TOKEN', 'REDDIT_OAUTH2', 'LINKEDIN_OAUTH2'] },
  { group: 'Browser-Based', types: ['PUPPETEER_LOGIN', 'SELENIUM_LOGIN', 'BROWSER_COOKIE_IMPORT'] },
  { group: 'SSO', types: ['SAML_SSO', 'OIDC_SSO', 'LDAP_AUTH'] },
  { group: 'Custom', types: ['CUSTOM_SCRIPT', 'MULTI_STEP_AUTH'] },
];

export default function CredentialsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSite, setSelectedSite] = useState('');
  const [form, setForm] = useState({
    siteId: '',
    name: '',
    authType: 'API_KEY',
    credentialData: '{}',
  });
  const queryClient = useQueryClient();

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.sites),
  });

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['credentials', selectedSite],
    queryFn: () =>
      selectedSite
        ? api.get(`/credentials/site/${selectedSite}`).then((r) => r.data.credentials)
        : [],
    enabled: !!selectedSite,
  });

  const { data: schemas } = useQuery({
    queryKey: ['credentials', 'schemas'],
    queryFn: () => api.get('/credentials/auth-schemas').then((r) => r.data.schemas),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/credentials', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setShowCreate(false);
      toast.success('Credential created');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Failed to create'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/credentials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      toast.success('Credential deleted');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Credentials</h1>
          <p className="text-dark-400 mt-1">Manage authentication credentials for your sites</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          Add Credential
        </button>
      </div>

      {/* Site Selector */}
      <div className="card">
        <label className="label">Select Site</label>
        <select
          value={selectedSite}
          onChange={(e) => setSelectedSite(e.target.value)}
          className="input w-full max-w-md"
        >
          <option value="">Choose a site...</option>
          {sites?.map((site: any) => (
            <option key={site.id} value={site.id}>{site.name}</option>
          ))}
        </select>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-dark-100 mb-4">Add Credential</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  ...form,
                  credentialData: JSON.parse(form.credentialData),
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
                  placeholder="Production API Key"
                  required
                />
              </div>
              <div>
                <label className="label">Auth Type</label>
                <select
                  value={form.authType}
                  onChange={(e) => setForm({ ...form, authType: e.target.value })}
                  className="input w-full"
                >
                  {AUTH_TYPES.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.types.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {schemas?.[form.authType] && (
                <div className="bg-dark-800 rounded-lg p-3">
                  <p className="text-xs text-dark-400 mb-1">Required fields:</p>
                  <p className="text-sm text-dark-300">
                    {schemas[form.authType].fields.join(', ')}
                  </p>
                  <p className="text-xs text-dark-500 mt-2">{schemas[form.authType].description}</p>
                </div>
              )}
              <div>
                <label className="label">Credential Data (JSON)</label>
                <textarea
                  value={form.credentialData}
                  onChange={(e) => setForm({ ...form, credentialData: e.target.value })}
                  className="input w-full font-mono text-sm"
                  rows={6}
                  placeholder='{"apiKey": "your-api-key"}'
                />
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

      {/* Credentials List */}
      {!selectedSite ? (
        <div className="card text-center py-12">
          <KeyIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-dark-300">Select a site</h3>
          <p className="text-dark-500 mt-1">Choose a site to view its credentials</p>
        </div>
      ) : isLoading ? (
        <SkeletonCardGrid count={4} />
      ) : credentials?.length === 0 ? (
        <div className="card text-center py-12">
          <KeyIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-dark-300">No credentials</h3>
          <p className="text-dark-500 mt-1">Add credentials to authenticate with this site</p>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials?.map((cred: any) => (
            <div key={cred.id} className="card-hover">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-600/10 rounded-lg flex items-center justify-center">
                    <ShieldCheckIcon className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-dark-100">{cred.name}</h3>
                    <p className="text-xs text-dark-500">{cred.authType?.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cred.isActive ? 'badge-success' : 'badge-neutral'}>
                    {cred.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {cred.lastUsedAt && (
                    <span className="text-xs text-dark-500">
                      Last used: {new Date(cred.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Delete this credential?')) deleteMutation.mutate(cred.id);
                    }}
                    className="btn-ghost text-xs text-red-400"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Masked data preview */}
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(cred.maskedData || {}).map(([key, value]) => (
                  <div key={key} className="bg-dark-800 rounded px-3 py-2">
                    <p className="text-xs text-dark-500">{key}</p>
                    <p className="text-sm text-dark-300 font-mono truncate">{value as string}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
