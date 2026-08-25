import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  HomeIcon,
  GlobeAltIcon,
  BoltIcon,
  KeyIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  DocumentTextIcon,
  CommandLineIcon,
  SparklesIcon,
  CpuChipIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';
import clsx from 'clsx';
import { useThemeStore } from '../../store/themeStore';
import { useUIStore } from '../../store/uiStore';
import { useRealtime } from '../../hooks/useRealtime';
import { CommandPalette } from './CommandPalette';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Sites', href: '/sites', icon: GlobeAltIcon },
  { name: 'Engagements', href: '/engagements', icon: BoltIcon },
  { name: 'Templates', href: '/templates', icon: SparklesIcon },
  { name: 'AI Settings', href: '/ai-settings', icon: CpuChipIcon },
  { name: 'Credentials', href: '/credentials', icon: KeyIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Metrics', href: '/metrics', icon: DocumentTextIcon },
  { name: 'API Docs', href: '/api-docs', icon: CommandLineIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

/** Cycles light -> dark -> system, showing the icon for the current choice. */
function ThemeToggle() {
  const preference = useThemeStore((s) => s.preference);
  const cycle = useThemeStore((s) => s.cycle);

  const { Icon, label } = {
    light: { Icon: SunIcon, label: 'Light theme' },
    dark: { Icon: MoonIcon, label: 'Dark theme' },
    system: { Icon: ComputerDesktopIcon, label: 'System theme' },
  }[preference];

  return (
    <button
      type="button"
      onClick={cycle}
      className="text-dark-400 hover:text-dark-200 transition-colors p-1.5 rounded-lg hover:bg-dark-800"
      // The button both reports the current theme and changes it, so the label
      // has to say what it will do, not just what is active.
      aria-label={`${label}. Activate to change theme.`}
      title={label}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}

/** Reflects the SSE connection so a stalled feed is visible, not silent. */
function LiveIndicator() {
  const { isLive } = useRealtime();

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-dark-500"
      role="status"
      aria-live="polite"
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          isLive ? 'bg-green-500' : 'bg-dark-600'
        )}
        aria-hidden="true"
      />
      {isLive ? 'Live' : 'Offline'}
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Lets keyboard users jump the nav instead of tabbing through it. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <CommandPalette />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-dark-900 border-r border-dark-800 transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-dark-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <BoltIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-dark-100">Engage</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-dark-400 hover:text-dark-200"
              aria-label="Close navigation menu"
            >
              <XMarkIcon className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-600/10 text-primary-400 border border-primary-600/20'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
                  )
                }
                onClick={() => setSidebarOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className="w-5 h-5" aria-hidden="true" />
                    {item.name}
                    {isActive && <span className="sr-only">(current page)</span>}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-dark-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-dark-700 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-dark-300">
                  {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark-200 truncate">
                  {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : user?.email}
                </p>
                <p className="text-xs text-dark-500 truncate">{user?.organization?.name}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dark-400 hover:text-red-400 hover:bg-dark-800 rounded-lg transition-colors"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-dark-900 border-b border-dark-800 flex items-center px-6 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-dark-400 hover:text-dark-200 mr-4"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
          >
            <Bars3Icon className="w-6 h-6" aria-hidden="true" />
          </button>

          {/* Visible affordance for the Cmd-K palette — a shortcut nobody is
              told about may as well not exist. */}
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden sm:flex items-center gap-2 text-sm text-dark-500 hover:text-dark-300 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 transition-colors"
            aria-keyshortcuts="Meta+K Control+K"
          >
            <MagnifyingGlassIcon className="w-4 h-4" aria-hidden="true" />
            <span>Search</span>
            <kbd className="text-[10px] border border-dark-600 rounded px-1 py-0.5">⌘K</kbd>
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-4">
            <LiveIndicator />
            <ThemeToggle />
            <span className="text-xs text-dark-500 bg-dark-800 px-3 py-1 rounded-full">
              {user?.organization?.plan || 'FREE'}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
