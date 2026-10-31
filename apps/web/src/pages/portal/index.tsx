import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Calendar, FileText, Home, LogOut, Pill, Receipt, User } from 'lucide-react';
import { usePortalAuth } from './portal.store';
import { portalAuthApi } from './portal.api';
import { PortalLogin } from './PortalLogin';
import { PortalDashboard } from './PortalDashboard';
import { PortalAppointments } from './PortalAppointments';
import { PortalPrescriptions } from './PortalPrescriptions';
import { PortalInvoices } from './PortalInvoices';
import { PortalDocuments } from './PortalDocuments';
import { PortalProfile } from './PortalProfile';

const NAV = [
  { to: '/portal', label: 'Home', icon: Home, end: true },
  { to: '/portal/appointments', label: 'Visits', icon: Calendar },
  { to: '/portal/prescriptions', label: 'Meds', icon: Pill },
  { to: '/portal/invoices', label: 'Bills', icon: Receipt },
  { to: '/portal/documents', label: 'Files', icon: FileText },
];

function PortalShell() {
  const navigate = useNavigate();
  const { patient, refreshToken, clear } = usePortalAuth();

  const onLogout = () => {
    if (refreshToken) portalAuthApi.logout(refreshToken);
    clear();
    navigate('/portal/login', { replace: true });
  };

  const clinicName = patient?.organization?.name ?? 'Patient Portal';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{clinicName}</p>
            <p className="text-xs text-slate-500 truncate">
              {patient ? `${patient.firstName} ${patient.lastName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <NavLink to="/portal/profile" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Profile">
              <User className="w-5 h-5" />
            </NavLink>
            <button onClick={onLogout} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Sign out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-clinic-green' : 'text-slate-400'}`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function RequireAuth() {
  const isAuthenticated = usePortalAuth((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/portal/login" replace />;
  return <PortalShell />;
}

export const PatientPortal = () => (
  <Routes>
    <Route path="login" element={<PortalLogin />} />
    <Route element={<RequireAuth />}>
      <Route path="" element={<PortalDashboard />} />
      <Route path="appointments" element={<PortalAppointments />} />
      <Route path="prescriptions" element={<PortalPrescriptions />} />
      <Route path="invoices" element={<PortalInvoices />} />
      <Route path="invoices/:id" element={<PortalInvoices />} />
      <Route path="documents" element={<PortalDocuments />} />
      <Route path="profile" element={<PortalProfile />} />
    </Route>
    <Route path="*" element={<Navigate to="/portal" replace />} />
  </Routes>
);
