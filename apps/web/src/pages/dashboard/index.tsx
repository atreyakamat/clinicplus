import React from 'react';
import { useCan } from '../../app/components/HasPermission';
import { OrganizationDashboard } from './OrganizationDashboard';
import { DoctorDashboard } from './DoctorDashboard';
import { AccountantDashboard } from './AccountantDashboard';
import { FrontDeskDashboard } from './FrontDeskDashboard';

/**
 * Role-appropriate dashboard, chosen by permission (not role name) so custom roles work:
 *  - analytics.view      -> business overview (owner / admin / manager)
 *  - analytics.doctor    -> doctor's own day and practice numbers
 *  - analytics.financial -> accountant: collections, receivables, revenue
 *  - otherwise           -> front desk: today's appointments, queue, collections
 */
export const DashboardPage = () => {
  const can = useCan();
  if (can('analytics.view')) return <OrganizationDashboard />;
  if (can('analytics.doctor')) return <DoctorDashboard />;
  if (can('analytics.financial')) return <AccountantDashboard />;
  return <FrontDeskDashboard />;
};
