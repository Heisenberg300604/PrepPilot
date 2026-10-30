import { UserButton } from '@clerk/clerk-react';
import { BookMarked, CalendarDays, ChevronRight, GraduationCap, History, LayoutDashboard, LibraryBig, Menu as MenuIcon, Monitor, Moon, PanelLeftClose, PanelLeft, Plus, Search, Settings, Star, Sun, X, FolderPlus, ListVideo, Video, CalendarPlus, Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useExams } from '@/features/common/queries';
import { clerkAppearance } from '@/features/auth/appearance';
import { useDialogs } from '@/lib/dialogs';
import { useMeta, useProfile, useUpdateProfile } from '@/lib/hooks';
import { toApiTheme, useTheme } from '@/lib/theme';
import { Menu } from '@/components/ui';
import { Brand } from './Brand';
import { SearchPalette } from './SearchPalette';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/exams', label: 'My exams', icon: GraduationCap },
  { to: '/library', label: 'Library', icon: LibraryBig },
  { to: '/planner', label: 'Planner', icon: CalendarDays },
  { to: '/recent', label: 'Recently studied', icon: History },
  { to: '/favorites', label: 'Favorites', icon: Star },
];
const TABS = [NAV[0], NAV[1], NAV[2], NAV[3], { to: '/settings', label: 'Settings', icon: Settings }];

const COLLAPSE_KEY = 'preppilot-sidebar-collapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const dialogs = useDialogs();
  const exams = useExams('ACTIVE');
  const profile = useProfile();
  const meta = useMeta();
  const theme = useTheme();
  const updateProfile = useUpdateProfile();
  const studying = pathname.startsWith('/watch/');

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setThemePref = (p: 'light' | 'dark' | 'system') => {
    theme.setPref(p);
    updateProfile.mutate({ preferredTheme: toApiTheme(p) }, { onError: () => undefined });
  };
  const ThemeIcon = theme.pref === 'system' ? Monitor : theme.resolved === 'dark' ? Moon : Sun;

  const sidebar = (
    <>
      <div className="sidebar-top">
        <Brand compact={collapsed && !drawer} />
        <button className="icon-btn sidebar-toggle desktop-only" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button className="icon-btn mobile-only" aria-label="Close menu" onClick={() => setDrawer(false)}>
          <X size={18} />
        </button>
      </div>
      <nav aria-label="Main" className="nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-item" title={collapsed ? label : undefined}>
            <Icon size={18} aria-hidden />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="nav-section nav-label">
        <span>Your exams</span>
        <button className="icon-btn icon-btn-sm" aria-label="Create exam" onClick={() => dialogs.open({ kind: 'exam' })}>
          <Plus size={14} />
        </button>
      </div>
      <nav aria-label="Exams" className="exam-nav nav-label">
        {exams.isLoading && <div className="skeleton" style={{ height: 32, margin: '4px 8px' }} />}
        {(exams.data ?? []).map((e) => (
          <NavLink key={e.id} to={`/exams/${e.id}`} className="exam-link">
            <span className="exam-dot" style={e.color ? { background: e.color } : undefined} aria-hidden />
            <span className="truncate">{e.name}</span>
            <ChevronRight size={14} aria-hidden className="exam-chevron" />
          </NavLink>
        ))}
        {exams.data?.length === 0 && <p className="nav-empty">No active exams yet.</p>}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/settings" className="nav-item" title={collapsed ? 'Settings' : undefined}>
          <Settings size={18} aria-hidden />
          <span className="nav-label">Settings</span>
        </NavLink>
      </div>
    </>
  );

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''} ${studying ? 'is-studying' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} aria-hidden />}
      <aside className={`sidebar ${drawer ? 'is-open' : ''}`}>{sidebar}</aside>
      <div className="shell-main">
        <header className="topbar">
          <button className="icon-btn mobile-only" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <MenuIcon size={20} />
          </button>
          <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search (Ctrl or Command K)">
            <Search size={16} aria-hidden />
            <span>Search exams, lectures, folders…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="topbar-actions">
            <Menu
              label="Quick add"
              triggerClassName="btn btn-primary btn-sm"
              trigger={
                <>
                  <Plus size={16} aria-hidden />
                  <span className="hide-sm">Add</span>
                </>
              }
              items={[
                { label: 'Create exam', icon: <GraduationCap size={16} />, onSelect: () => dialogs.open({ kind: 'exam' }) },
                { label: 'Add subject', icon: <Layers size={16} />, onSelect: () => dialogs.open({ kind: 'subject' }) },
                { label: 'Create folder', icon: <FolderPlus size={16} />, onSelect: () => dialogs.open({ kind: 'folder' }) },
                { label: meta.data?.features.youtubeImport === false ? 'Import playlist (needs API key)' : 'Import playlist', icon: <ListVideo size={16} />, onSelect: () => dialogs.open({ kind: 'import' }), separated: true },
                { label: 'Add video', icon: <Video size={16} />, onSelect: () => dialogs.open({ kind: 'video' }) },
                { label: 'Plan study session', icon: <CalendarPlus size={16} />, onSelect: () => dialogs.open({ kind: 'task' }), separated: true },
              ]}
            />
            <Menu
              label={`Theme: ${theme.pref}`}
              trigger={<ThemeIcon size={18} aria-hidden />}
              items={[
                { label: 'Light', icon: <Sun size={16} />, onSelect: () => setThemePref('light') },
                { label: 'Dark', icon: <Moon size={16} />, onSelect: () => setThemePref('dark') },
                { label: 'Match system', icon: <Monitor size={16} />, onSelect: () => setThemePref('system') },
              ]}
            />
            <div className="user-button" title={profile.data?.displayName ?? undefined}>
              <UserButton appearance={clerkAppearance} />
            </div>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
        <nav aria-label="Primary" className="tabbar mobile-only">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/dashboard'} className="tab">
              <Icon size={20} aria-hidden />
              <span>{label === 'My exams' ? 'Exams' : label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </div>
  );
}



