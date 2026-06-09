import React from 'react';
import { DoctorDashboard } from './DoctorDashboard';
import { useAuthStore } from '../../app/store/auth.store';
import { hasRole } from '../../app/lib/access';
import { OrganizationDashboard } from './OrganizationDashboard';

export const DashboardPage = () => {
  const { user } = useAuthStore();

  if (hasRole(user?.roles, 'Doctor') && !hasRole(user?.roles, 'Organization Owner') && !hasRole(user?.roles, 'Clinic Admin')) {
    return <DoctorDashboard />;
  }

  return <OrganizationDashboard />;
};
