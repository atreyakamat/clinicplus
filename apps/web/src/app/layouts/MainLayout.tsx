import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Calendar, Clock, 
  Stethoscope, FileText, FileBadge, Activity, 
  CreditCard, MessageSquare, Star, BarChart3, 
  CheckSquare, Settings, LogOut, Palette, ShieldCheck, FileSpreadsheet, UserRound
} from 'lucide-react';
import { useAuthStore } from '../store/auth.store';

import { HasPermission } from '../components/HasPermission';
import { GlobalSearch } from '../components/GlobalSearch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

const ORG_WIDE_ROLES = ['Organization Owner', 'Clinic Admin', 'Super Admin'];

/** Branch switcher for org-wide users; sets X-Branch-Id (via the auth store) and refetches everything. */
const BranchSwitcher = () => {
  const { user, activeBranchId, setActiveBranch } = useAuthStore();
  const queryClient = useQueryClient();
  const orgWide = !!(user as any)?.orgWide || (user?.roles ?? []).some((r) => ORG_WIDE_ROLES.includes(r));
  const { data: branches, error } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['branches', 'switcher', user?.id],
    enabled: orgWide,
    retry: false,
    queryFn: async () => (await api.get('/branches'))?.data ?? [],
  });
  React.useEffect(() => {
    // The selected branch was archived or is no longer valid: fall back to the home branch.
    if (activeBranchId && ((error instanceof ApiError && error.status === 403) || (branches && !branches.some((b) => b.id === activeBranchId)))) {
      setActiveBranch(null);
      queryClient.invalidateQueries();
    }
  }, [error, branches, activeBranchId, setActiveBranch, queryClient]);
  if (!orgWide || !branches || branches.length < 2) return null;
  return (
    <select
      aria-label="Active branch"
      className="h-9 max-w-[180px] rounded-lg border border-slate-200 bg-white px-2 text-sm"
      value={activeBranchId ?? user?.branchId ?? ''}
      onChange={(e) => {
        setActiveBranch(e.target.value === user?.branchId ? null : e.target.value);
        queryClient.invalidateQueries();
      }}
    >
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
};

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard.view' },
  { name: 'Patients', path: '/patients', icon: Users, permission: 'patients.view' },
  { name: 'Appointments', path: '/appointments', icon: Calendar, permission: 'appointments.view' },
  { name: 'Queue', path: '/queue', icon: Clock, permission: 'queues.view' },
  { name: 'Consultations', path: '/consultations', icon: Stethoscope, permission: 'consultations.view' },
  { name: 'Prescriptions', path: '/prescriptions', icon: FileText, permission: 'prescriptions.view' },
  { name: 'Documents', path: '/documents', icon: FileBadge, permission: 'documents.view' },
  { name: 'Follow-Ups', path: '/follow-ups', icon: Activity, permission: 'follow_ups.view' },
  { name: 'Billing', path: '/billing', icon: CreditCard, permission: 'billing.view' },
  { name: 'Communication', path: '/communication', icon: MessageSquare, permission: 'communications.view' },
  { name: 'Feedback', path: '/reviews/feedback', icon: Star, permission: 'feedback.view' },
  { name: 'Reviews', path: '/reviews', icon: Star, permission: 'reviews.view' },
  { name: 'Analytics', path: '/analytics', icon: BarChart3, permission: ['analytics.view', 'analytics.financial', 'analytics.doctor'] },
  { name: 'Reports', path: '/reports', icon: FileSpreadsheet, permission: 'reports.view' },
  { name: 'Doctors', path: '/doctors', icon: UserRound, permission: 'doctors.view' },
  { name: 'Tasks', path: '/tasks', icon: CheckSquare, permission: 'tasks.view' },
  { name: 'Branding', path: '/settings/branding', icon: Palette, permission: 'settings.branding' },
  { name: 'Founder Panel', path: '/admin', icon: ShieldCheck, permission: 'admin.view' },
  { name: 'Settings', path: '/settings', icon: Settings, permission: 'settings.view' },
];

export const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <div className="flex h-screen bg-[#0B0F14] text-white">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1F2937] flex flex-col h-full border-r border-gray-800">
        <div className="h-16 flex items-center px-6 font-bold text-xl text-[#1FA971] border-b border-gray-800">
          ClinicOS
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <HasPermission key={item.path} permission={item.permission}>
                  <li>
                    <Link
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive 
                          ? 'bg-[#1FA971] text-white' 
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <Icon size={18} />
                      {item.name}
                    </Link>
                  </li>
                </HasPermission>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 text-[#111827]">
        {/* Header */}
        <header className="h-16 bg-white border-b flex items-center px-6 justify-between">
          <div className="flex items-center gap-8 flex-1">
            <div className="font-semibold hidden lg:block shrink-0">Healthcare OS</div>
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-4 ml-4 shrink-0">
            <BranchSwitcher />
            <div className="text-sm font-medium hidden md:block">{user?.firstName} {user?.lastName}</div>
            <div className="w-8 h-8 bg-[#2563EB] rounded-full text-white flex items-center justify-center font-bold">
              {getInitials()}
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
