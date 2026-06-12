import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { LandingPage } from '../pages/landing';
import { ProtectedRoute } from './layouts/ProtectedRoute';

export const RootRoute = () => {
  const isAuthenticated = useAuthStore((state: any) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  );
};