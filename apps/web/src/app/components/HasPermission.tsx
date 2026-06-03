import React from 'react';
import { useAuthStore } from '../store/auth.store';

interface HasPermissionProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const HasPermission = ({ permission, children, fallback = null }: HasPermissionProps) => {
  const user = useAuthStore((state) => state.user);
  
  if (!user) return <>{fallback}</>;
  
  // Super Admin bypass
  if (user.roles?.includes('Super Admin') || user.roles?.includes('Organization Owner')) {
    return <>{children}</>;
  }

  if (user.permissions?.includes(permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
