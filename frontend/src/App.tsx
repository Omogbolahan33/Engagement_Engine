import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/common/Layout';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Lazy-loaded pages for code splitting
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SitesPage = lazy(() => import('./pages/SitesPage'));
const SiteDetailPage = lazy(() => import('./pages/SiteDetailPage'));
const EngagementsPage = lazy(() => import('./pages/EngagementsPage'));
const EngagementDetailPage = lazy(() => import('./pages/EngagementDetailPage'));
const CredentialsPage = lazy(() => import('./pages/CredentialsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ApiDocsPage = lazy(() => import('./pages/ApiDocsPage'));
const MetricsPage = lazy(() => import('./pages/MetricsPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const AISettingsPage = lazy(() => import('./pages/AISettingsPage'));

// Loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64" role="status" aria-label="Loading">
      <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="sites" element={<SitesPage />} />
        <Route path="sites/:id" element={<SiteDetailPage />} />
        <Route path="engagements" element={<EngagementsPage />} />
        <Route path="engagements/:id" element={<EngagementDetailPage />} />
        <Route path="credentials" element={<CredentialsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="metrics" element={<MetricsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="ai-settings" element={<AISettingsPage />} />
        <Route path="api-docs" element={<ApiDocsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}
