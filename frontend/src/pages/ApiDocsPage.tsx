import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { SkeletonText, SkeletonTable } from '../components/common/Skeleton';

/**
 * Interactive API Documentation with Swagger UI
 * Built into the platform - no external dependencies needed
 */
export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { accessToken } = useAuthStore();
  const [spec, setSpec] = useState<any>(null);
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [testInputs, setTestInputs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/v1/docs/openapi.json', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then(setSpec)
      .catch(console.error);
  }, [accessToken]);

  const executeRequest = async (method: string, path: string, body?: any) => {
    const key = `${method}:${path}`;
    setLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const url = `/api/v1${path.replace(/{(\w+)}/g, (_, param) => testInputs[`${key}:${param}`] || param)}`;
      const options: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();

      setTestResults((prev) => ({
        ...prev,
        [key]: {
          status: response.status,
          statusText: response.statusText,
          data,
          timestamp: new Date().toISOString(),
        },
      }));
    } catch (error: any) {
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          status: 0,
          statusText: 'Network Error',
          data: { error: error.message },
          timestamp: new Date().toISOString(),
        },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const methodColors: Record<string, string> = {
    get: 'bg-green-600',
    post: 'bg-blue-600',
    put: 'bg-yellow-600',
    patch: 'bg-yellow-600',
    delete: 'bg-red-600',
  };

  const methodTextColors: Record<string, string> = {
    get: 'text-green-400',
    post: 'text-blue-400',
    put: 'text-yellow-400',
    patch: 'text-yellow-400',
    delete: 'text-red-400',
  };

  if (!spec) {
    return (
      <div className="space-y-4">
        <SkeletonText lines={2} />
        <SkeletonTable rows={8} columns={3} />
      </div>
    );
  }

  const tags = spec.tags || [];
  const paths = spec.paths || {};

  // Group endpoints by tag
  const endpointsByTag: Record<string, Array<{ method: string; path: string; operation: any }>> = {};

  Object.entries(paths).forEach(([path, methods]: [string, any]) => {
    Object.entries(methods).forEach(([method, operation]: [string, any]) => {
      const tag = operation.tags?.[0] || 'Other';
      if (!endpointsByTag[tag]) endpointsByTag[tag] = [];
      endpointsByTag[tag].push({ method, path, operation });
    });
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">API Documentation</h1>
        <p className="text-dark-400 mt-1">
          Interactive API reference with live sandbox testing
        </p>
      </div>

      {/* Info Banner */}
      <div className="card bg-primary-600/10 border-primary-600/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-primary-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-primary-400 text-lg">🔑</span>
          </div>
          <div>
            <h3 className="font-medium text-dark-100">Authentication</h3>
            <p className="text-sm text-dark-400 mt-1">
              All requests are automatically authenticated with your current session token.
              For external use, include <code className="bg-dark-800 px-1.5 py-0.5 rounded text-primary-400 text-xs">Authorization: Bearer &lt;token&gt;</code> or{' '}
              <code className="bg-dark-800 px-1.5 py-0.5 rounded text-primary-400 text-xs">X-API-Key: &lt;key&gt;</code> header.
            </p>
          </div>
        </div>
      </div>

      {/* Base URL */}
      <div className="card">
        <h3 className="text-sm font-medium text-dark-400 mb-2">Base URL</h3>
        <code className="text-primary-400 font-mono">{window.location.origin}/api/v1</code>
      </div>

      {/* Endpoints by Tag */}
      {Object.entries(endpointsByTag).map(([tag, endpoints]) => (
        <div key={tag} className="space-y-3">
          <h2 className="text-xl font-bold text-dark-100 border-b border-dark-800 pb-2">{tag}</h2>

          {endpoints.map(({ method, path, operation }) => {
            const key = `${method}:${path}`;
            const isOpen = activeEndpoint === key;
            const result = testResults[key];
            const isLoading = loading[key];

            return (
              <div key={key} className="card overflow-hidden">
                {/* Endpoint Header */}
                <button
                  onClick={() => setActiveEndpoint(isOpen ? null : key)}
                  className="w-full flex items-center gap-3 text-left hover:bg-dark-800/50 -m-6 p-6 transition-colors"
                >
                  <span className={`${methodColors[method]} text-white text-xs font-bold px-2.5 py-1 rounded uppercase min-w-[60px] text-center`}>
                    {method}
                  </span>
                  <code className="text-dark-200 font-mono text-sm flex-1">{path}</code>
                  <span className="text-dark-500 text-sm">{operation.summary}</span>
                  <svg
                    className={`w-4 h-4 text-dark-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded Content */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-dark-800 space-y-4">
                    {/* Description */}
                    {operation.description && (
                      <p className="text-dark-400 text-sm">{operation.description}</p>
                    )}

                    {/* Parameters */}
                    {operation.parameters && operation.parameters.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-dark-300 mb-2">Parameters</h4>
                        <div className="space-y-2">
                          {operation.parameters.map((param: any) => (
                            <div key={param.name} className="flex items-center gap-3 bg-dark-800 rounded-lg p-3">
                              <code className="text-primary-400 text-sm font-mono min-w-[120px]">{param.name}</code>
                              <span className="text-dark-500 text-xs">{param.in}</span>
                              {param.required && <span className="text-red-400 text-xs">required</span>}
                              <input
                                type="text"
                                placeholder={param.schema?.type || 'string'}
                                className="input flex-1 text-sm py-1"
                                value={testInputs[`${key}:${param.name}`] || ''}
                                onChange={(e) =>
                                  setTestInputs((prev) => ({ ...prev, [`${key}:${param.name}`]: e.target.value }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Request Body */}
                    {operation.requestBody && (
                      <div>
                        <h4 className="text-sm font-medium text-dark-300 mb-2">Request Body</h4>
                        <textarea
                          className="input w-full font-mono text-sm"
                          rows={6}
                          placeholder={JSON.stringify(
                            Object.fromEntries(
                              Object.entries(operation.requestBody.content?.['application/json']?.schema?.properties || {}).map(
                                ([k, v]: [string, any]) => [k, v.example || v.type || '']
                              )
                            ),
                            null,
                            2
                          )}
                          value={testInputs[`${key}:body`] || ''}
                          onChange={(e) =>
                            setTestInputs((prev) => ({ ...prev, [`${key}:body`]: e.target.value }))
                          }
                        />
                      </div>
                    )}

                    {/* Execute Button */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          let body;
                          try {
                            body = testInputs[`${key}:body`]
                              ? JSON.parse(testInputs[`${key}:body`])
                              : undefined;
                          } catch {
                            alert('Invalid JSON in request body');
                            return;
                          }
                          executeRequest(method, path, body);
                        }}
                        disabled={isLoading}
                        className={`${methodColors[method]} text-white font-medium py-2 px-6 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50`}
                      >
                        {isLoading ? 'Sending...' : 'Try it out'}
                      </button>

                      {/* Response Status */}
                      {result && (
                        <span
                          className={`badge ${
                            result.status >= 200 && result.status < 300
                              ? 'badge-success'
                              : result.status >= 400
                              ? 'badge-error'
                              : 'badge-warning'
                          }`}
                        >
                          {result.status} {result.statusText}
                        </span>
                      )}
                    </div>

                    {/* Response */}
                    {result && (
                      <div>
                        <h4 className="text-sm font-medium text-dark-300 mb-2">Response</h4>
                        <div className="bg-dark-950 rounded-lg p-4 overflow-x-auto">
                          <pre className="text-sm font-mono text-dark-300 whitespace-pre-wrap">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </div>
                        <p className="text-xs text-dark-600 mt-1">{result.timestamp}</p>
                      </div>
                    )}

                    {/* Response Schema */}
                    {operation.responses?.['200']?.content?.['application/json']?.schema && (
                      <div>
                        <h4 className="text-sm font-medium text-dark-300 mb-2">Response Schema</h4>
                        <div className="bg-dark-800 rounded-lg p-4 overflow-x-auto">
                          <pre className="text-xs font-mono text-dark-400">
                            {JSON.stringify(
                              operation.responses['200'].content['application/json'].schema,
                              null,
                              2
                            )}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
