import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { PlusIcon, CpuChipIcon, TrashIcon, CheckCircleIcon, XCircleIcon, PlayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function AISettingsPage() {
  const [activeTab, setActiveTab] = useState<'providers' | 'templates' | 'generate'>('providers');
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const queryClient = useQueryClient();

  // Fetch LLM configs
  const { data: configs } = useQuery({
    queryKey: ['ai', 'configs'],
    queryFn: () => api.get('/ai/configs').then((r) => r.data.configs),
  });

  // Fetch provider types
  const { data: providerTypes } = useQuery({
    queryKey: ['ai', 'providers'],
    queryFn: () => api.get('/ai/providers').then((r) => r.data.providers),
  });

  // Fetch content templates
  const { data: templates } = useQuery({
    queryKey: ['ai', 'templates'],
    queryFn: () => api.get('/ai/templates').then((r) => r.data.templates),
  });

  // Fetch scopes
  const { data: scopes } = useQuery({
    queryKey: ['ai', 'scopes'],
    queryFn: () => api.get('/ai/scopes').then((r) => r.data.scopes),
  });

  // Add provider config
  const [providerForm, setProviderForm] = useState({
    name: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: '',
    baseUrl: '',
    maxTokens: 500,
    temperature: 0.7,
    allowedScopes: [] as string[],
  });

  const createConfigMutation = useMutation({
    mutationFn: (data: typeof providerForm) => api.post('/ai/configs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'configs'] });
      setShowAddProvider(false);
      setProviderForm({ name: '', provider: 'openai', model: 'gpt-4o-mini', apiKey: '', baseUrl: '', maxTokens: 500, temperature: 0.7, allowedScopes: [] });
      toast.success('LLM provider added');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Failed to add provider'),
  });

  const testConfigMutation = useMutation({
    mutationFn: (id: string) => api.post(`/ai/configs/${id}/test`),
    onSuccess: (response) => {
      if (response.data.success) {
        toast.success(`Connection OK (${response.data.latencyMs}ms)`);
      } else {
        toast.error(`Connection failed: ${response.data.error}`);
      }
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Test failed'),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ai/configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'configs'] });
      toast.success('Provider deleted');
    },
  });

  // Add template
  const [templateForm, setTemplateForm] = useState({
    name: '',
    content: '',
    category: 'comments',
    language: 'English',
    variables: [] as Array<{ name: string; description: string; defaultValue: string; required: boolean }>,
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: typeof templateForm) => api.post('/ai/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'templates'] });
      setShowAddTemplate(false);
      setTemplateForm({ name: '', content: '', category: 'comments', language: 'English', variables: [] });
      toast.success('Template created');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Failed to create template'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ai/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'templates'] });
      toast.success('Template deleted');
    },
  });

  // Content generation test
  const [generateForm, setGenerateForm] = useState({
    source: 'ai_generate' as string,
    llmConfigId: '',
    templateId: '',
    text: '',
    aiPrompt: '',
    scope: 'comments',
    tone: 'professional' as string,
    language: 'English',
    maxLength: 300,
    minLength: 50,
    context: {
      platform: 'Twitter',
      targetContent: '',
      keywords: [] as string[],
    },
  });
  const [generateResult, setGenerateResult] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await api.post('/ai/generate', generateForm);
      setGenerateResult(response.data.result);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const tabs = [
    { id: 'providers' as const, label: 'LLM Providers', icon: CpuChipIcon },
    { id: 'templates' as const, label: 'Content Templates' },
    { id: 'generate' as const, label: 'Test Generation', icon: PlayIcon },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">AI Content Settings</h1>
        <p className="text-dark-400 mt-1">Configure LLM providers, content templates, and AI generation</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-900 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
              activeTab === tab.id ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-dark-200'
            )}
          >
            {tab.icon && <tab.icon className="w-4 h-4" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* LLM PROVIDERS TAB */}
      {/* ============================================================ */}
      {activeTab === 'providers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddProvider(true)} className="btn-primary flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              Add Provider
            </button>
          </div>

          {/* Add Provider Modal */}
          {showAddProvider && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-dark-100 mb-4">Add LLM Provider</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createConfigMutation.mutate(providerForm);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="label">Name</label>
                    <input
                      type="text"
                      value={providerForm.name}
                      onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                      className="input w-full"
                      placeholder="My OpenAI"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Provider</label>
                    <select
                      value={providerForm.provider}
                      onChange={(e) => {
                        const p = providerTypes?.find((pt: any) => pt.type === e.target.value);
                        setProviderForm({
                          ...providerForm,
                          provider: e.target.value,
                          model: p?.defaultModel || '',
                          baseUrl: p?.baseUrl || '',
                        });
                      }}
                      className="input w-full"
                    >
                      {providerTypes?.map((p: any) => (
                        <option key={p.type} value={p.type}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <select
                      value={providerForm.model}
                      onChange={(e) => setProviderForm({ ...providerForm, model: e.target.value })}
                      className="input w-full"
                    >
                      {(providerTypes?.find((p: any) => p.type === providerForm.provider)?.models || []).map((m: string) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="custom">Custom model...</option>
                    </select>
                    {providerForm.model === 'custom' && (
                      <input
                        type="text"
                        className="input w-full mt-2"
                        placeholder="Enter model name"
                        onChange={(e) => setProviderForm({ ...providerForm, model: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <label className="label">API Key</label>
                    <input
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                      className="input w-full"
                      placeholder="sk-..."
                    />
                  </div>
                  <div>
                    <label className="label">Base URL (optional)</label>
                    <input
                      type="url"
                      value={providerForm.baseUrl}
                      onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                      className="input w-full"
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Max Tokens</label>
                      <input
                        type="number"
                        value={providerForm.maxTokens}
                        onChange={(e) => setProviderForm({ ...providerForm, maxTokens: +e.target.value })}
                        className="input w-full"
                        min={1}
                        max={32000}
                      />
                    </div>
                    <div>
                      <label className="label">Temperature</label>
                      <input
                        type="number"
                        value={providerForm.temperature}
                        onChange={(e) => setProviderForm({ ...providerForm, temperature: +e.target.value })}
                        className="input w-full"
                        min={0}
                        max={2}
                        step={0.1}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Allowed Scopes</label>
                    <div className="grid grid-cols-3 gap-2">
                      {scopes?.map((s: any) => (
                        <label key={s.scope} className="flex items-center gap-2 text-sm text-dark-300">
                          <input
                            type="checkbox"
                            checked={providerForm.allowedScopes.includes(s.scope)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setProviderForm({ ...providerForm, allowedScopes: [...providerForm.allowedScopes, s.scope] });
                              } else {
                                setProviderForm({ ...providerForm, allowedScopes: providerForm.allowedScopes.filter((x) => x !== s.scope) });
                              }
                            }}
                            className="rounded"
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button type="button" onClick={() => setShowAddProvider(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={createConfigMutation.isPending} className="btn-primary">
                      {createConfigMutation.isPending ? 'Adding...' : 'Add Provider'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Providers List */}
          {configs?.length === 0 ? (
            <div className="card text-center py-12">
              <CpuChipIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-dark-300">No LLM providers configured</h3>
              <p className="text-dark-500 mt-1">Add a provider to enable AI content generation</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs?.map((config: any) => (
                <div key={config.id} className="card-hover">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-purple-600/10 rounded-lg flex items-center justify-center">
                        <CpuChipIcon className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-dark-100">{config.name}</h3>
                        <p className="text-xs text-dark-500">{config.provider} • {config.model}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {config.lastTestResult && (
                        <span className={config.lastTestResult.success ? 'badge-success' : 'badge-error'}>
                          {config.lastTestResult.success ? 'Connected' : 'Failed'}
                        </span>
                      )}
                      <button
                        onClick={() => testConfigMutation.mutate(config.id)}
                        className="btn-ghost text-xs"
                        disabled={testConfigMutation.isPending}
                      >
                        Test
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this provider?')) deleteConfigMutation.mutate(config.id);
                        }}
                        className="btn-ghost text-xs text-red-400"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {config.allowedScopes?.length > 0 && (
                    <div className="flex gap-1 mt-3">
                      {config.allowedScopes.map((scope: string) => (
                        <span key={scope} className="badge-neutral text-xs">{scope}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* CONTENT TEMPLATES TAB */}
      {/* ============================================================ */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddTemplate(true)} className="btn-primary flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              Add Template
            </button>
          </div>

          {showAddTemplate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-dark-100 mb-4">Create Content Template</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createTemplateMutation.mutate(templateForm);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="label">Name</label>
                    <input
                      type="text"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                      className="input w-full"
                      placeholder="Friendly comment template"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select
                      value={templateForm.category}
                      onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                      className="input w-full"
                    >
                      {scopes?.map((s: any) => (
                        <option key={s.scope} value={s.scope}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Template Content</label>
                    <p className="text-xs text-dark-500 mb-1">Use {'{variable}'} for dynamic values. Use {'{opt1|opt2|opt3}'} for random selection.</p>
                    <textarea
                      value={templateForm.content}
                      onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                      className="input w-full font-mono text-sm"
                      rows={6}
                      placeholder="Great post! I really liked the part about {topic}. {Keep it up!|Thanks for sharing!|Looking forward to more.}"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Language</label>
                    <input
                      type="text"
                      value={templateForm.language}
                      onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button type="button" onClick={() => setShowAddTemplate(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={createTemplateMutation.isPending} className="btn-primary">
                      {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {templates?.length === 0 ? (
            <div className="card text-center py-12">
              <h3 className="text-lg font-medium text-dark-300">No content templates</h3>
              <p className="text-dark-500 mt-1">Create reusable templates for engagement content</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates?.map((template: any) => (
                <div key={template.id} className="card-hover">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-dark-100">{template.name}</h3>
                      <p className="text-xs text-dark-500">{template.category} • {template.language} • Used {template.useCount} times</p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Delete this template?')) deleteTemplateMutation.mutate(template.id);
                      }}
                      className="btn-ghost text-xs text-red-400"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <pre className="bg-dark-800 rounded-lg p-3 text-sm text-dark-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {template.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TEST GENERATION TAB */}
      {/* ============================================================ */}
      {activeTab === 'generate' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-lg font-semibold text-dark-100 mb-4">Test Content Generation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Source</label>
                <select
                  value={generateForm.source}
                  onChange={(e) => setGenerateForm({ ...generateForm, source: e.target.value })}
                  className="input w-full"
                >
                  <option value="ai_generate">AI Generate</option>
                  <option value="template">Template</option>
                  <option value="ai_from_template">AI + Template</option>
                  <option value="user_input">User Input</option>
                </select>
              </div>
              {(generateForm.source === 'ai_generate' || generateForm.source === 'ai_from_template') && (
                <div>
                  <label className="label">LLM Provider</label>
                  <select
                    value={generateForm.llmConfigId}
                    onChange={(e) => setGenerateForm({ ...generateForm, llmConfigId: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select provider...</option>
                    {configs?.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.model})</option>
                    ))}
                  </select>
                </div>
              )}
              {generateForm.source === 'template' && (
                <div>
                  <label className="label">Template</label>
                  <select
                    value={generateForm.templateId}
                    onChange={(e) => setGenerateForm({ ...generateForm, templateId: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select template...</option>
                    {templates?.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Scope</label>
                <select
                  value={generateForm.scope}
                  onChange={(e) => setGenerateForm({ ...generateForm, scope: e.target.value })}
                  className="input w-full"
                >
                  {scopes?.map((s: any) => (
                    <option key={s.scope} value={s.scope}>{s.label} — {s.description}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Tone</label>
                <select
                  value={generateForm.tone}
                  onChange={(e) => setGenerateForm({ ...generateForm, tone: e.target.value })}
                  className="input w-full"
                >
                  {['professional', 'casual', 'friendly', 'formal', 'humorous', 'technical', 'persuasive', 'neutral'].map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Platform</label>
                <input
                  type="text"
                  value={generateForm.context.platform}
                  onChange={(e) => setGenerateForm({ ...generateForm, context: { ...generateForm.context, platform: e.target.value } })}
                  className="input w-full"
                  placeholder="Twitter, Reddit, etc."
                />
              </div>
              <div>
                <label className="label">Min Length</label>
                <input
                  type="number"
                  value={generateForm.minLength}
                  onChange={(e) => setGenerateForm({ ...generateForm, minLength: +e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Max Length</label>
                <input
                  type="number"
                  value={generateForm.maxLength}
                  onChange={(e) => setGenerateForm({ ...generateForm, maxLength: +e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Target Content / Topic</label>
              <textarea
                value={generateForm.context.targetContent}
                onChange={(e) => setGenerateForm({ ...generateForm, context: { ...generateForm.context, targetContent: e.target.value } })}
                className="input w-full"
                rows={3}
                placeholder="The content you're responding to, or the topic to write about..."
              />
            </div>
            {generateForm.source === 'user_input' && (
              <div className="mt-4">
                <label className="label">Your Text</label>
                <textarea
                  value={generateForm.text}
                  onChange={(e) => setGenerateForm({ ...generateForm, text: e.target.value })}
                  className="input w-full"
                  rows={4}
                />
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={handleGenerate} disabled={isGenerating} className="btn-primary flex items-center gap-2">
                {isGenerating ? 'Generating...' : 'Generate Content'}
              </button>
            </div>
          </div>

          {/* Result */}
          {generateResult && (
            <div className="card">
              <h3 className="text-lg font-semibold text-dark-100 mb-3">Generated Content</h3>
              <div className="bg-dark-800 rounded-lg p-4 mb-4">
                <p className="text-dark-200 whitespace-pre-wrap">{generateResult.text}</p>
              </div>
              <div className="flex gap-4 text-sm text-dark-400">
                <span>Source: <span className="text-dark-200">{generateResult.source}</span></span>
                {generateResult.llmProvider && <span>Provider: <span className="text-dark-200">{generateResult.llmProvider}</span></span>}
                {generateResult.llmModel && <span>Model: <span className="text-dark-200">{generateResult.llmModel}</span></span>}
                {generateResult.tokensUsed && <span>Tokens: <span className="text-dark-200">{generateResult.tokensUsed}</span></span>}
                <span>Length: <span className="text-dark-200">{generateResult.text.length} chars</span></span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generateResult.text);
                  toast.success('Copied to clipboard');
                }}
                className="btn-secondary mt-3 text-sm"
              >
                Copy to Clipboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
