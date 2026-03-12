import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Home,
  FileText,
  FolderOpen,
  Landmark,
  ChevronDown,
  ChevronRight,
  LogOut,
  ScanLine,
  ListTodo,
  Wallet,
  TrendingUp,
  Menu,
  X,
} from 'lucide-react';
import clsx from 'clsx';

interface NavSection {
  label: string;
  icon: React.ElementType;
  path?: string;
  children?: { label: string; path: string; icon: React.ElementType }[];
}

const navSections: NavSection[] = [
  { label: 'Inicio', icon: Home, path: '/' },
  {
    label: 'Facturas',
    icon: FileText,
    children: [
      { label: 'Compra', path: '/invoices', icon: FileText },
      { label: 'Escáner', path: '/invoices/scanner', icon: ScanLine },
    ],
  },
  {
    label: 'Proyectos',
    icon: FolderOpen,
    children: [
      { label: 'Proyectos', path: '/projects', icon: FolderOpen },
      { label: 'Tareas', path: '/projects/tasks', icon: ListTodo },
    ],
  },
  {
    label: 'Tesorería',
    icon: Landmark,
    children: [
      { label: 'Cuentas', path: '/treasury', icon: Wallet },
      { label: 'Cashflow', path: '/cashflow', icon: TrendingUp },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Auto-expand the section that contains the current route
    const initial: Record<string, boolean> = {};
    navSections.forEach(section => {
      if (section.children) {
        const isActive = section.children.some(child =>
          location.pathname === child.path || location.pathname.startsWith(child.path + '/')
        );
        if (isActive) initial[section.label] = true;
      }
    });
    return initial;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isSectionActive = (section: NavSection) => {
    if (section.path) return isActive(section.path);
    return section.children?.some(child => isActive(child.path)) ?? false;
  };

  const toggleSection = (label: string) => {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleNav = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-800">
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-5 py-5 cursor-pointer"
        onClick={() => handleNav('/')}
      >
        <span className="text-lg font-bold tracking-tight text-white">
          LIONS<span className="text-gray-500">&</span>HOMES
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navSections.map(section => {
          const Icon = section.icon;
          const active = isSectionActive(section);
          const isExpanded = expanded[section.label] ?? false;

          if (section.path) {
            // Simple link (Inicio)
            return (
              <button
                key={section.label}
                onClick={() => handleNav(section.path!)}
                className={clsx(
                  'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-700 text-white border-l-2 border-amber-500 pl-[10px]'
                    : 'text-gray-400 hover:bg-slate-700/50 hover:text-gray-200'
                )}
              >
                <Icon size={18} />
                {section.label}
              </button>
            );
          }

          // Expandable section
          return (
            <div key={section.label}>
              <button
                onClick={() => toggleSection(section.label)}
                className={clsx(
                  'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'text-white'
                    : 'text-gray-400 hover:bg-slate-700/50 hover:text-gray-200'
                )}
              >
                <Icon size={18} />
                <span className="flex-1 text-left">{section.label}</span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {isExpanded && section.children && (
                <div className="ml-2 mt-1 space-y-0.5">
                  {section.children.map(child => {
                    const ChildIcon = child.icon;
                    const childActive = isActive(child.path);
                    return (
                      <button
                        key={child.path}
                        onClick={() => handleNav(child.path)}
                        className={clsx(
                          'flex items-center gap-3 w-full pl-8 pr-3 py-2 rounded-lg text-sm transition-colors',
                          childActive
                            ? 'bg-slate-700 text-white border-l-2 border-amber-500 pl-[30px]'
                            : 'text-gray-400 hover:bg-slate-700/50 hover:text-gray-200'
                        )}
                      >
                        <ChildIcon size={15} />
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-slate-700 px-4 py-4">
        <div className="mb-3">
          <p className="text-sm font-medium text-gray-200 truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-slate-700/50 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-slate-800 text-white p-2 rounded-lg shadow-lg"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-[220px] transform transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[220px] z-30">
        {sidebarContent}
      </aside>
    </>
  );
}
