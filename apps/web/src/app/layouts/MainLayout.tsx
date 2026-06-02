import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Calendar, Clock, 
  Stethoscope, FileText, FileBadge, Activity, 
  CreditCard, MessageSquare, Star, BarChart3, 
  CheckSquare, Settings, LogOut, Palette, ShieldAlert
} from 'lucide-react';
import { useAuthStore } from '../store/auth.store';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Patients', path: '/patients', icon: Users },
  { name: 'Appointments', path: '/appointments', icon: Calendar },
  { name: 'Queue', path: '/queue', icon: Clock },
  { name: 'Consultations', path: '/consultations', icon: Stethoscope },
  { name: 'Prescriptions', path: '/prescriptions', icon: FileText },
  { name: 'Documents', path: '/documents', icon: FileBadge },
  { name: 'Follow-Ups', path: '/follow-ups', icon: Activity },
  { name: 'Billing', path: '/billing', icon: CreditCard },
  { name: 'Communication', path: '/communication', icon: MessageSquare },
  { name: 'Feedback', path: '/reviews/feedback', icon: Star },
  { name: 'Reviews', path: '/reviews', icon: Star },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
  { name: 'Tasks', path: '/tasks', icon: CheckSquare },
  { name: 'Branding', path: '/settings/branding', icon: Palette },
  { name: 'QA Dashboard', path: '/analytics/qa', icon: ShieldAlert },
  { name: 'Settings', path: '/settings', icon: Settings },
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
                <li key={item.path}>
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
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 text-[#111827]">
        {/* Header */}
        <header className="h-16 bg-white border-b flex items-center px-6 justify-between">
          <div className="font-semibold">Healthcare Operating System</div>
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium">{user?.firstName} {user?.lastName}</div>
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
