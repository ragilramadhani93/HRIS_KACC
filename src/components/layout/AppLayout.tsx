import React, { useState } from 'react';
import {
  LayoutDashboard, Users, Clock, Calendar,
  Building2, Bell, ChevronLeft, ChevronRight, LogOut,
  UserCircle, Shield, Briefcase, BarChart3, Menu, X, Receipt, DollarSign, Monitor, Smartphone,
} from 'lucide-react';
import { cn, ROLE_LABELS, getInitials } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import type { AppRole } from '../../lib/database.types';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  roles: AppRole[];
  children?: { id: string; label: string; roles: AppRole[] }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={18} />,
    roles: ['super_admin', 'hr_admin', 'regional_manager', 'area_manager', 'supervisor', 'employee'],
  },
  {
    id: 'employee-app',
    label: 'Aplikasi Karyawan',
    icon: <Smartphone size={18} />,
    roles: ['super_admin', 'hr_admin', 'regional_manager', 'area_manager', 'supervisor', 'employee'],
  },
  {
    id: 'organization',
    label: 'Organization',
    icon: <Building2 size={18} />,
    roles: ['super_admin', 'hr_admin'],
    children: [
      { id: 'companies', label: 'Companies', roles: ['super_admin'] },
      { id: 'regions', label: 'Regions', roles: ['super_admin', 'hr_admin'] },
      { id: 'areas', label: 'Areas', roles: ['super_admin', 'hr_admin'] },
      { id: 'outlets', label: 'Outlets', roles: ['super_admin', 'hr_admin'] },
    ],
  },
  {
    id: 'employees',
    label: 'Employees',
    icon: <Users size={18} />,
    roles: ['super_admin', 'hr_admin', 'regional_manager', 'area_manager', 'supervisor'],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: <Clock size={18} />,
    roles: ['super_admin', 'hr_admin', 'regional_manager', 'area_manager', 'supervisor', 'employee'],
  },
  {
    id: 'shifts',
    label: 'Shifts',
    icon: <Briefcase size={18} />,
    roles: ['super_admin', 'hr_admin', 'area_manager', 'supervisor'],
  },
  {
    id: 'leave',
    label: 'Ketidakhadiran',
    icon: <Calendar size={18} />,
    roles: ['super_admin', 'hr_admin', 'regional_manager', 'area_manager', 'supervisor', 'employee'],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    icon: <DollarSign size={18} />,
    roles: ['super_admin', 'hr_admin'],
  },
  {
    id: 'expense',
    label: 'Expenses',
    icon: <Receipt size={18} />,
    roles: ['super_admin', 'hr_admin', 'regional_manager', 'area_manager', 'supervisor', 'employee'],
  },
  {
    id: 'face-registration',
    label: 'Face Registration',
    icon: <UserCircle size={18} />,
    roles: ['super_admin', 'hr_admin', 'employee', 'auditor'],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <BarChart3 size={18} />,
    roles: ['super_admin', 'hr_admin', 'regional_manager'],
  },
  {
    id: 'kiosk',
    label: 'Kiosk Absen',
    icon: <Monitor size={18} />,
    roles: ['super_admin', 'hr_admin'],
  },
  {
    id: 'user-management',
    label: 'User Management',
    icon: <Shield size={18} />,
    roles: ['super_admin'],
  },
];

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { profile, signOut, role } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['organization']);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => role && item.roles.includes(role)
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-white/10', collapsed && 'justify-center px-2')}>
        <div className="flex-shrink-0">
          <img src="/kapal-api-logo.svg" alt="Kapal Api" className={`${collapsed ? 'w-8 h-8' : 'h-8 w-auto'}`} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Kapal Api</p>
            <p className="text-blue-300 text-xs">Coffee Corner</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const isExpanded = expandedGroups.includes(item.id);
          const hasChildren = item.children && item.children.length > 0;
          const isActive = currentPage === item.id ||
            (hasChildren && item.children!.some((c) => c.id === currentPage));

          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (hasChildren) {
                    toggleGroup(item.id);
                  } else {
                    onNavigate(item.id);
                    setMobileOpen(false);
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white',
                  collapsed && 'justify-center px-2'
                )}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {hasChildren && (
                      <ChevronRight
                        size={14}
                        className={cn('transition-transform duration-200', isExpanded && 'rotate-90')}
                      />
                    )}
                  </>
                )}
              </button>

              {hasChildren && !collapsed && isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                  {item.children!
                    .filter((c) => role && c.roles.includes(role))
                    .map((child) => (
                      <button
                        key={child.id}
                        onClick={() => { onNavigate(child.id); setMobileOpen(false); }}
                        className={cn(
                          'w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          currentPage === child.id
                            ? 'bg-white/15 text-white'
                            : 'text-blue-200 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        {child.label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className={cn('border-t border-white/10 p-3', collapsed && 'px-2')}>
        <div className={cn('flex items-center gap-3 px-2 py-2 rounded-lg', !collapsed && 'mb-1')}>
          <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {profile ? getInitials(profile.full_name || 'U') : 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{profile?.full_name || 'User'}</p>
              <p className="text-blue-300 text-xs truncate">{profile?.role ? ROLE_LABELS[profile.role] : ''}</p>
            </div>
          )}
        </div>
        <button
          onClick={signOut}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 text-xs font-medium transition-all',
            collapsed && 'justify-center'
          )}
        >
          <LogOut size={14} />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={cn(
          'hidden md:flex flex-col bg-gradient-to-b from-slate-900 to-slate-800 transition-all duration-300 flex-shrink-0 relative shadow-sidebar',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-slate-700 z-10 transition-all duration-200 hover:scale-110 hover:shadow-lg"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Mobile Trigger */}
      <button
        className="md:hidden fixed bottom-5 left-5 z-50 w-12 h-12 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-xl flex items-center justify-center text-white active:scale-90 transition-transform duration-150"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex animate-fade-in">
          <div className="w-60 bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col animate-slide-up">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onNotificationsClick?: () => void;
  unreadCount?: number;
}

export function TopBar({ title, subtitle, actions, onNotificationsClick, unreadCount = 0 }: TopBarProps) {
  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-lg border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {actions}
        <button
          onClick={onNotificationsClick}
          className="relative p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200 active:scale-90"
          title="Notifikasi"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm shadow-red-200 scale-in">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  pageTitle: string;
  pageSubtitle?: string;
  pageActions?: React.ReactNode;
  onNotificationsClick?: () => void;
  unreadCount?: number;
}

export function AppLayout({
  children,
  currentPage,
  onNavigate,
  pageTitle,
  pageSubtitle,
  pageActions,
  onNotificationsClick,
  unreadCount,
}: AppLayoutProps) {
  const [key, setKey] = useState(0);
  const prevPageRef = React.useRef(currentPage);

  React.useEffect(() => {
    if (prevPageRef.current !== currentPage) {
      setKey((k) => k + 1);
      prevPageRef.current = currentPage;
    }
  }, [currentPage]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar
          title={pageTitle}
          subtitle={pageSubtitle}
          actions={pageActions}
          onNotificationsClick={onNotificationsClick}
          unreadCount={unreadCount}
        />
        <main key={key} className="flex-1 overflow-y-auto p-6 scrollbar-thin page-enter">
          {children}
        </main>
      </div>
    </div>
  );
}
