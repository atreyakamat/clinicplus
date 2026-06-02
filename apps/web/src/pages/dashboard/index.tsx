import React from 'react';
import { DoctorDashboard } from './DoctorDashboard';
import { useAuthStore } from '../../app/store/auth.store';

export const DashboardPage = () => {
  const { user } = useAuthStore();
  
  // In a real app, logic here would determine which dashboard to show based on Role
  // For now, everyone gets the Doctor Dashboard as it's the most comprehensive module
  return <DoctorDashboard />;
};
