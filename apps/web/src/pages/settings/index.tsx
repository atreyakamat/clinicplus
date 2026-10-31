import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router-dom';
import {
  Building2,
  ClipboardList,
  GitBranch,
  KeyRound,
  Palette,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, PageHeader } from '@clinicplus/ui';
import { api, unwrap } from '../../app/lib/api';
import { useAuthStore } from '../../app/store/auth.store';
import { useCan } from '../../app/components/HasPermission';
import { ProfileSettings } from './ProfileSettings';
import { OrganizationSettings } from './OrganizationSettings';
import { AuditLogSettings } from './AuditLogSettings';

interface SettingsLink {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  /** Any of these permissions shows the link; undefined = every signed-in user. */
  permission?: string | string[];
}

const LINKS: SettingsLink[] = [
  { to: '/settings/profile', title: 'My profile', description: 'Personal details, qualifications and digital signature.', icon: UserRound, tone: 'bg-purple-100 text-purple-600' },
  { to: '/settings/security', title: 'Security', description: 'Change your password and manage signed-in devices.', icon: KeyRound, tone: 'bg-slate-100 text-slate-700' },
  { to: '/settings/organization', title: 'Organization profile', description: 'Clinic name, legal name and contact details.', icon: Building2, tone: 'bg-[#1FA971]/10 text-[#1FA971]', permission: 'organizations.update' },
  { to: '/settings/staff', title: 'Staff', description: 'Invite team members, assign roles and deactivate accounts.', icon: Users, tone: 'bg-orange-100 text-orange-600', permission: 'users.view' },
  { to: '/settings/roles', title: 'Roles & permissions', description: 'Review built-in roles and create custom ones.', icon: ShieldCheck, tone: 'bg-emerald-100 text-emerald-600', permission: 'roles.view' },
  { to: '/settings/branding', title: 'Branding', description: 'Logo, colours and how invoices / prescriptions look.', icon: Palette, tone: 'bg-[#2563EB]/10 text-[#2563EB]', permission: 'settings.branding' },
  { to: '/settings/branches', title: 'Branches', description: 'Locations, contact details and time zones.', icon: GitBranch, tone: 'bg-sky-100 text-sky-600', permission: ['branches.view', 'branches.manage'] },
  { to: '/settings/clinic', title: 'Clinic setup', description: 'Services, prices, working hours and holidays.', icon: Stethoscope, tone: 'bg-rose-100 text-rose-600', permission: ['services.manage', 'organizations.update'] },
  { to: '/settings/audit', title: 'Audit log', description: 'Who did what and when, across your clinic.', icon: ScrollText, tone: 'bg-amber-100 text-amber-700', permission: 'audit.view' },
  { to: '/admin', title: 'Founder panel', description: 'Platform-wide metrics across all clinics.', icon: ClipboardList, tone: 'bg-indigo-100 text-indigo-600', permission: 'admin.view' },
];

const SettingsHome = () => {
  const user = useAuthStore((state) => state.user);
  const can = useCan();
  const { data: organization, isLoading, error } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: async () => unwrap<any>(await api.get('/organizations/current')),
    enabled: !!user && can('organizations.view'),
  });

  const visible = LINKS.filter((l) => !l.permission || can(l.permission));

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account, your team and how your clinic is set up." />

      {can('organizations.view') && (
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-[#1FA971]/10 p-3 text-[#1FA971]">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading organization…</p>
              ) : error ? (
                <p className="text-sm text-red-600">Could not load organization details.</p>
              ) : (
                <>
                  <h2 className="truncate text-lg font-semibold text-slate-900">{organization?.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {organization?.branches?.length ?? 0} active branch{organization?.branches?.length === 1 ? '' : 'es'}
                    {user?.roles?.length ? ` · You are signed in as ${user.roles.join(', ')}` : ''}
                  </p>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ to, title, description, icon: Icon, tone }) => (
          <Link key={to} to={to} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA971]">
            <Card className="h-full p-6 transition-shadow hover:shadow-md">
              <div className={`mb-4 w-fit rounded-xl p-3 ${tone}`}>
                <Icon size={20} />
              </div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-500">{description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

const Denied = () => (
  <Card className="p-8 text-center text-sm text-slate-500">You do not have access to this settings page.</Card>
);

const Guard = ({ permission, children }: { permission: string | string[]; children: React.ReactNode }) => {
  const can = useCan();
  return can(permission) ? <>{children}</> : <Denied />;
};

/** /settings/* — hub plus sub-pages that have no dedicated top-level route. */
export const SettingsPage = () => (
  <Routes>
    <Route index element={<SettingsHome />} />
    <Route path="profile" element={<ProfileSettings />} />
    <Route path="organization" element={<Guard permission="organizations.update"><OrganizationSettings /></Guard>} />
    <Route path="audit" element={<Guard permission="audit.view"><AuditLogSettings /></Guard>} />
    <Route path="*" element={<SettingsHome />} />
  </Routes>
);
