import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Transition } from '@headlessui/react';
import {
  MagnifyingGlassIcon,
  HomeIcon,
  GlobeAltIcon,
  BoltIcon,
  KeyIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  CommandLineIcon,
  SparklesIcon,
  CpuChipIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useUIStore } from '../../store/uiStore';

/**
 * Keyboard-first launcher (Cmd/Ctrl-K).
 *
 * Every action here is reachable through the UI already; the palette exists so
 * frequent operations do not require crossing the page with a pointer. Matching
 * is a subsequence test rather than a substring one, so "eng" finds
 * "Engagements" and "crd" finds "Credentials".
 */

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  run: () => void;
}

/**
 * Subsequence match with a crude score: earlier and more contiguous matches
 * rank higher. Returns null when the query does not match at all.
 */
function score(query: string, text: string): number | null {
  if (!query) return 0;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t.includes(q)) {
    // Exact substring beats any scattered match.
    return 1000 - t.indexOf(q);
  }

  let qi = 0;
  let points = 0;
  let lastHit = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      points += lastHit === ti - 1 ? 5 : 1; // reward runs
      lastHit = ti;
      qi++;
    }
  }

  return qi === q.length ? points : null;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.closeCommandPalette);
  const toggleOpen = useUIStore((s) => s.toggleCommandPalette);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const setThemePreference = useThemeStore((s) => s.setPreference);

  const close = useCallback(() => {
    setOpen();
    setQuery('');
    setActiveIndex(0);
  }, [setOpen]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      close();
    };

    return [
      { id: 'nav-dashboard', label: 'Dashboard', group: 'Navigate', icon: HomeIcon, run: go('/') },
      { id: 'nav-sites', label: 'Sites', group: 'Navigate', icon: GlobeAltIcon, run: go('/sites') },
      { id: 'nav-engagements', label: 'Engagements', group: 'Navigate', icon: BoltIcon, run: go('/engagements') },
      { id: 'nav-templates', label: 'Templates', group: 'Navigate', icon: SparklesIcon, run: go('/templates') },
      { id: 'nav-ai', label: 'AI Settings', group: 'Navigate', icon: CpuChipIcon, run: go('/ai-settings') },
      { id: 'nav-credentials', label: 'Credentials', group: 'Navigate', icon: KeyIcon, run: go('/credentials') },
      { id: 'nav-analytics', label: 'Analytics', group: 'Navigate', icon: ChartBarIcon, run: go('/analytics') },
      { id: 'nav-metrics', label: 'Metrics', group: 'Navigate', icon: DocumentTextIcon, run: go('/metrics') },
      { id: 'nav-docs', label: 'API Docs', group: 'Navigate', icon: CommandLineIcon, run: go('/api-docs') },
      { id: 'nav-settings', label: 'Settings', group: 'Navigate', icon: Cog6ToothIcon, run: go('/settings') },
      {
        id: 'nav-security',
        label: 'Security & Sessions',
        hint: 'Two-factor, active sessions, data export',
        group: 'Navigate',
        icon: ShieldCheckIcon,
        keywords: '2fa mfa session gdpr privacy export delete',
        run: go('/settings?tab=security'),
      },

      {
        id: 'new-site',
        label: 'New site',
        group: 'Create',
        icon: GlobeAltIcon,
        keywords: 'add create platform',
        run: go('/sites?new=1'),
      },
      {
        id: 'new-engagement',
        label: 'New engagement',
        group: 'Create',
        icon: BoltIcon,
        keywords: 'add create automation',
        run: go('/engagements?new=1'),
      },
      {
        id: 'new-credential',
        label: 'New credential',
        group: 'Create',
        icon: KeyIcon,
        keywords: 'add create auth token',
        run: go('/credentials?new=1'),
      },

      {
        id: 'theme-light',
        label: 'Switch to light theme',
        group: 'Preferences',
        icon: SunIcon,
        keywords: 'appearance colour color',
        run: () => {
          setThemePreference('light');
          close();
        },
      },
      {
        id: 'theme-dark',
        label: 'Switch to dark theme',
        group: 'Preferences',
        icon: MoonIcon,
        keywords: 'appearance colour color',
        run: () => {
          setThemePreference('dark');
          close();
        },
      },
      {
        id: 'theme-system',
        label: 'Match system theme',
        group: 'Preferences',
        icon: ComputerDesktopIcon,
        keywords: 'appearance auto os',
        run: () => {
          setThemePreference('system');
          close();
        },
      },

      {
        id: 'logout',
        label: 'Sign out',
        group: 'Account',
        icon: ArrowRightOnRectangleIcon,
        keywords: 'logout exit leave',
        run: () => {
          close();
          logout();
          navigate('/login');
        },
      },
    ];
  }, [navigate, close, logout, setThemePreference]);

  const results = useMemo(() => {
    if (!query.trim()) return commands;

    return commands
      .map((command) => {
        const haystack = `${command.label} ${command.keywords ?? ''} ${command.group}`;
        const s = score(query.trim(), haystack);
        return s === null ? null : { command, s };
      })
      .filter((x): x is { command: Command; s: number } => x !== null)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.command);
  }, [commands, query]);

  // Grouping is for display only; keyboard navigation runs over the flat list.
  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const command of results) {
      const list = map.get(command.group) ?? [];
      list.push(command);
      map.set(command.group, list);
    }
    return [...map.entries()];
  }, [results]);

  // Global shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleOpen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleOpen]);

  // A changed query invalidates the previous highlight.
  useEffect(() => setActiveIndex(0), [query]);

  // Keep the highlighted row inside the scroll area.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      results[activeIndex]?.run();
    }
  };

  let flatIndex = -1;

  return (
    <Transition show={open} as={Fragment} afterLeave={() => setQuery('')}>
      <Dialog onClose={close} className="relative z-[60]">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6 md:p-20">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="mx-auto max-w-xl overflow-hidden rounded-xl bg-dark-900 border border-dark-700 shadow-2xl">
              <Dialog.Title className="sr-only">Command palette</Dialog.Title>

              <div className="flex items-center gap-3 px-4 border-b border-dark-800">
                <MagnifyingGlassIcon className="w-5 h-5 text-dark-500" aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search commands…"
                  aria-label="Search commands"
                  aria-controls="command-results"
                  aria-activedescendant={
                    results[activeIndex] ? `command-${results[activeIndex].id}` : undefined
                  }
                  className="w-full bg-transparent py-4 text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-0"
                />
                <kbd className="hidden sm:block text-[10px] text-dark-500 border border-dark-700 rounded px-1.5 py-0.5">
                  ESC
                </kbd>
              </div>

              <div
                ref={listRef}
                id="command-results"
                role="listbox"
                aria-label="Commands"
                className="max-h-80 overflow-y-auto py-2"
              >
                {results.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-dark-500">
                    No commands match “{query}”.
                  </p>
                )}

                {grouped.map(([group, groupCommands]) => (
                  <div key={group}>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                      {group}
                    </p>
                    {groupCommands.map((command) => {
                      flatIndex++;
                      const index = flatIndex;
                      const active = index === activeIndex;

                      return (
                        <button
                          key={command.id}
                          id={`command-${command.id}`}
                          data-index={index}
                          role="option"
                          aria-selected={active}
                          type="button"
                          onClick={command.run}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                            active ? 'bg-primary-600/15 text-primary-300' : 'text-dark-300'
                          )}
                        >
                          <command.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="flex-1 truncate">{command.label}</span>
                          {command.hint && (
                            <span className="text-xs text-dark-500 truncate max-w-[45%]">
                              {command.hint}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
