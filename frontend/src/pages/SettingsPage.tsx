import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { UserIcon, BuildingOfficeIcon, KeyIcon, BellIcon, ShieldCheckIcon, ComputerDesktopIcon, DocumentArrowDownIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { SkeletonText, SkeletonStatGrid } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';

function SecurityTab() {
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: twoFAStatus } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => api.get('/sessions/2fa/status').then((r) => r.data),
  });

  const setup2FAMutation = useMutation({
    mutationFn: () => api.post('/sessions/2fa/setup'),
    onSuccess: (response) => {
      setShow2FASetup(true);
      setBackupCodes(response.data.backupCodes);
    },
  });

  const verify2FAMutation = useMutation({
    mutationFn: (code: string) => api.post('/sessions/2fa/verify', { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      setShow2FASetup(false);
      toast.success('2FA enabled successfully');
    },
    onError: () => toast.error('Invalid code'),
  });

  const disable2FAMutation = useMutation({
    mutationFn: (password: string) => api.post('/sessions/2fa/disable', { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      toast.success('2FA disabled');
    },
    onError: () => toast.error('Invalid password'),
  });

  return (
    <div className="card space-y-4">
      <h2 className="text-xl font-bold text-dark-100">Security Settings</h2>

      {/* 2FA */}
      <div className="p-4 bg-dark-800 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-dark-100">Two-Factor Authentication</h3>
            <p className="text-sm text-dark-400">Add an extra layer of security to your account</p>
          </div>
          <span className={twoFAStatus?.enabled ? 'badge-success' : 'badge-neutral'}>
            {twoFAStatus?.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {!twoFAStatus?.enabled && !show2FASetup && (
          <button onClick={() => setup2FAMutation.mutate()} className="btn-primary text-sm">
            Enable 2FA
          </button>
        )}

        {show2FASetup && (
          <div className="space-y-3">
            <p className="text-sm text-dark-300">Enter the code from your authenticator app:</p>
            <input
              type="text"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value)}
              className="input w-48"
              placeholder="000000"
              maxLength={6}
            />
            <button
              onClick={() => verify2FAMutation.mutate(twoFACode)}
              className="btn-primary text-sm ml-2"
            >
              Verify & Enable
            </button>
            {backupCodes.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-yellow-400 mb-2">Save these backup codes:</p>
                <div className="grid grid-cols-2 gap-1">
                  {backupCodes.map((code) => (
                    <code key={code} className="text-xs bg-dark-900 px-2 py-1 rounded">{code}</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {twoFAStatus?.enabled && (
          <button
            onClick={() => {
              const password = prompt('Enter your password to disable 2FA:');
              if (password) disable2FAMutation.mutate(password);
            }}
            className="btn-danger text-sm"
          >
            Disable 2FA
          </button>
        )}
      </div>

      {/* Change Password */}
      <div className="p-4 bg-dark-800 rounded-lg">
        <h3 className="font-medium text-dark-100 mb-2">Change Password</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const formData = new FormData(form);
            try {
              await api.post('/auth/change-password', {
                currentPassword: formData.get('currentPassword'),
                newPassword: formData.get('newPassword'),
              });
              toast.success('Password changed');
              form.reset();
            } catch (error: any) {
              toast.error(error.response?.data?.error || 'Failed');
            }
          }}
          className="space-y-3"
        >
          <input name="currentPassword" type="password" className="input w-full" placeholder="Current password" required />
          <input name="newPassword" type="password" className="input w-full" placeholder="New password" required minLength={8} />
          <button type="submit" className="btn-primary text-sm">Change Password</button>
        </form>
      </div>
    </div>
  );
}

function SessionsTab() {
  const queryClient = useQueryClient();

  const {
    data: sessions,
    isLoading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get('/sessions').then((r) => r.data.sessions),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Session revoked');
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.post('/sessions/revoke-others'),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(response.data.message);
    },
  });

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-dark-100">Active Sessions</h2>
        <button onClick={() => revokeAllMutation.mutate()} className="btn-danger text-sm">
          Revoke All Others
        </button>
      </div>
      {sessionsLoading && <SkeletonText lines={3} />}

      {sessionsError && (
        <ErrorState
          error={sessionsError}
          resource="sessions"
          onRetry={() => refetchSessions()}
        />
      )}

      {sessions?.length === 0 && (
        <p className="text-sm text-dark-500 py-4">No other active sessions.</p>
      )}

      <div className="space-y-3">
        {sessions?.map((session: any) => (
          <div key={session.id} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
            <div className="flex items-center gap-3">
              <ComputerDesktopIcon className="w-5 h-5 text-dark-400" />
              <div>
                <p className="text-sm text-dark-200">
                  {session.browser} on {session.os}
                  {session.isCurrent && <span className="ml-2 badge-success text-xs">Current</span>}
                </p>
                <p className="text-xs text-dark-500">
                  {session.ipAddress} • {session.device}
                </p>
              </div>
            </div>
            {!session.isCurrent && (
              <button
                onClick={() => revokeMutation.mutate(session.id)}
                className="btn-ghost text-xs text-red-400"
                aria-label={`Revoke session on ${session.browser} on ${session.os}`}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DataPrivacyTab() {
  const {
    data: dataSummary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['gdpr-summary'],
    queryFn: () => api.get('/gdpr/data-summary').then((r) => r.data),
  });

  const [exporting, setExporting] = useState(false);

  /**
   * The export endpoint requires the bearer token, which only the axios
   * instance attaches — a plain <a download> hits it unauthenticated and gets a
   * 401. Fetch through the client, then hand the result to the browser as a blob.
   */
  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.get('/gdpr/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not export your data');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="card space-y-6">
      <h2 className="text-xl font-bold text-dark-100">Data & Privacy</h2>

      {summaryLoading && <SkeletonStatGrid count={4} />}

      {summaryError && (
        <ErrorState
          error={summaryError}
          resource="your data summary"
          onRetry={() => refetchSummary()}
        />
      )}

      {/* Data Summary */}
      <div>
        <h3 className="font-medium text-dark-100 mb-3">Your Data</h3>
        <div className="grid grid-cols-2 gap-3">
          {dataSummary?.dataCategories?.map((cat: any) => (
            <div key={cat.category} className="p-3 bg-dark-800 rounded-lg">
              <p className="text-lg font-bold text-dark-100">{cat.count}</p>
              <p className="text-sm text-dark-400">{cat.category}</p>
              <p className="text-xs text-dark-500">{cat.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Retention Policy */}
      <div>
        <h3 className="font-medium text-dark-100 mb-3">Data Retention</h3>
        <div className="p-3 bg-dark-800 rounded-lg text-sm text-dark-300">
          {dataSummary?.retentionPolicy && Object.entries(dataSummary.retentionPolicy).map(([key, value]) => (
            <div key={key} className="flex justify-between py-1">
              <span className="text-dark-400">{key.replace(/([A-Z])/g, ' $1')}</span>
              <span>{value as string}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <div>
        <h3 className="font-medium text-dark-100 mb-3">Export Your Data</h3>
        <p className="text-sm text-dark-400 mb-3">Download all your data in JSON format (GDPR Article 20)</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="btn-primary text-sm inline-flex items-center gap-2"
        >
          <DocumentArrowDownIcon className="w-4 h-4" aria-hidden="true" />
          {exporting ? 'Preparing…' : 'Export All Data'}
        </button>
      </div>

      {/* Delete Account */}
      <div className="border border-red-800/30 rounded-lg p-4">
        <h3 className="font-medium text-red-400 mb-2">Danger Zone</h3>
        <p className="text-sm text-dark-400 mb-3">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          className="btn-danger text-sm"
          onClick={async () => {
            const password = prompt('Enter your password to confirm:');
            if (!password) return;
            if (!confirm('Are you sure? This will permanently delete your account.')) return;
            try {
              await api.post('/gdpr/delete-account', { password });
              toast.success('Account deleted');
              window.location.href = '/login';
            } catch (error: any) {
              toast.error(error.response?.data?.error || 'Failed');
            }
          }}
        >
          Delete My Account
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'organization', name: 'Organization', icon: BuildingOfficeIcon },
    { id: 'api-keys', name: 'API Keys', icon: KeyIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    { id: 'sessions', name: 'Sessions', icon: ComputerDesktopIcon },
    { id: 'data', name: 'Data & Privacy', icon: DocumentArrowDownIcon },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Settings</h1>
        <p className="text-dark-400 mt-1">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Tabs */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-600/10 text-primary-400 border border-primary-600/20'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <div className="card space-y-4">
              <h2 className="text-xl font-bold text-dark-100">Profile Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">First Name</label>
                  <input
                    type="text"
                    defaultValue={user?.firstName || ''}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input
                    type="text"
                    defaultValue={user?.lastName || ''}
                    className="input w-full"
                  />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  defaultValue={user?.email || ''}
                  className="input w-full"
                  disabled
                />
              </div>
              <div>
                <label className="label">Role</label>
                <input
                  type="text"
                  defaultValue={user?.role || ''}
                  className="input w-full"
                  disabled
                />
              </div>
              <button className="btn-primary" onClick={() => toast.success('Profile updated')}>
                Save Changes
              </button>
            </div>
          )}

          {activeTab === 'organization' && (
            <div className="card space-y-4">
              <h2 className="text-xl font-bold text-dark-100">Organization Settings</h2>
              <div>
                <label className="label">Organization Name</label>
                <input
                  type="text"
                  defaultValue={user?.organization?.name || ''}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Plan</label>
                <div className="flex items-center gap-3">
                  <span className="badge-info text-lg px-4 py-1.5">
                    {user?.organization?.plan || 'FREE'}
                  </span>
                  <button className="btn-secondary text-sm">Upgrade Plan</button>
                </div>
              </div>
              <div>
                <label className="label">Organization Slug</label>
                <input
                  type="text"
                  defaultValue={user?.organization?.slug || ''}
                  className="input w-full"
                  disabled
                />
              </div>
            </div>
          )}

          {activeTab === 'api-keys' && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-dark-100">API Keys</h2>
                <button className="btn-primary text-sm" onClick={() => toast.success('API key created')}>
                  Generate New Key
                </button>
              </div>
              <p className="text-dark-400 text-sm">
                API keys allow programmatic access to the Engagement Platform API.
                Keep them secure and never share them publicly.
              </p>
              <div className="bg-dark-800 rounded-lg p-4">
                <p className="text-dark-500 text-sm text-center">No API keys generated yet</p>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="card space-y-4">
              <h2 className="text-xl font-bold text-dark-100">Notification Preferences</h2>
              <div className="space-y-3">
                {[
                  { label: 'Engagement failures', description: 'Get notified when an engagement fails' },
                  { label: 'Credential expiry', description: 'Alert before credentials expire' },
                  { label: 'Rate limit warnings', description: 'Notify when approaching rate limits' },
                  { label: 'Daily summary', description: 'Receive a daily performance summary' },
                ].map((item) => (
                  <label key={item.label} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg cursor-pointer">
                    <div>
                      <p className="text-sm text-dark-200">{item.label}</p>
                      <p className="text-xs text-dark-500">{item.description}</p>
                    </div>
                    <input type="checkbox" className="w-4 h-4 rounded bg-dark-700 border-dark-600" />
                  </label>
                ))}
              </div>
              <button className="btn-primary" onClick={() => toast.success('Preferences saved')}>
                Save Preferences
              </button>
            </div>
          )}

          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'sessions' && <SessionsTab />}
          {activeTab === 'data' && <DataPrivacyTab />}
        </div>
      </div>
    </div>
  );
}
