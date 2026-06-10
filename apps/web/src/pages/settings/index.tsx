import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, Palette, Shield, Users } from 'lucide-react';
import { Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useAuthStore } from '../../app/store/auth.store';

export const SettingsPage = () => {
  const user = useAuthStore((state) => state.user);
  const { data: organization } = useQuery({
    queryKey: ['settings', 'organization', user?.organizationId],
    queryFn: () => api.get(`/organizations/${user?.organizationId}`),
    enabled: !!user?.organizationId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage clinic identity, staffing, and the access structure behind your workspace."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-[#1FA971]/10 p-3 text-[#1FA971]">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{organization?.name || 'Clinic configuration'}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {organization?.branches?.length || 0} branch{organization?.branches?.length === 1 ? '' : 'es'} connected to this organization.
              </p>
            </div>
          </div>
        </Card>

        <Link to="/settings/branding">
          <Card className="h-full p-6 transition-shadow hover:shadow-md">
            <div className="mb-4 rounded-xl bg-[#2563EB]/10 p-3 text-[#2563EB] w-fit">
              <Palette size={20} />
            </div>
            <h3 className="font-semibold text-slate-900">Branding</h3>
            <p className="mt-2 text-sm text-slate-500">
              Adjust clinic colors, footer text, and how patient-facing documents appear.
            </p>
          </Card>
        </Link>

        <Link to="/settings/staff">
          <Card className="h-full p-6 transition-shadow hover:shadow-md">
            <div className="mb-4 rounded-xl bg-orange-100 p-3 text-orange-600 w-fit">
              <Users size={20} />
            </div>
            <h3 className="font-semibold text-slate-900">Staff Management</h3>
            <p className="mt-2 text-sm text-slate-500">
              Invite new team members, review active staff, and assign clinic roles.
            </p>
          </Card>
        </Link>

        <Link to="/settings/profile">
          <Card className="h-full p-6 transition-shadow hover:shadow-md">
            <div className="mb-4 rounded-xl bg-purple-100 p-3 text-purple-600 w-fit">
              <Users size={20} />
            </div>
            <h3 className="font-semibold text-slate-900">My Profile</h3>
            <p className="mt-2 text-sm text-slate-500">
              Manage your personal details, qualifications, and digital signature.
            </p>
          </Card>
        </Link>

        <Card className="p-6 lg:col-span-3">
          <div className="mb-4 rounded-xl bg-emerald-100 p-3 text-emerald-600 w-fit">
            <Shield size={20} />
          </div>
          <h3 className="font-semibold text-slate-900">Access Model</h3>
          <p className="mt-2 text-sm text-slate-500">
            Role-based access is now wired end to end, including seeded permissions for owners, doctors, and staff.
          </p>
        </Card>
      </div>
    </div>
  );
};
