import React from 'react';
import { useAuthStore } from '../store/auth.store';
import { hasPermission, hasRole } from '../lib/access';

interface HasPermissionProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const HasPermission = ({ permission, children, fallback = null }: HasPermissionProps) => {
  const user = useAuthStore((state) => state.user);
  
  if (!user) return <>{fallback}</>;
  
  // Super Admin bypass
  if (hasRole(user.roles, 'Super Admin') || hasRole(user.roles, 'Organization Owner')) {
    return <>{children}</>;
  }

  if (hasPermission(user.permissions, permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
