import React from 'react';
import { useAuthStore } from '../store/auth.store';
import { hasPermission } from '../lib/access';

interface HasPermissionProps {
  /** A permission key, or a list where holding ANY of them is enough. */
  permission: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * UI visibility only; the API enforces the same keys. Permissions come from the
 * server's role matrix (no role-name bypass), so the UI never shows an action the
 * API would reject.
 */
export const HasPermission = ({ permission, children, fallback = null }: HasPermissionProps) => {
  const user = useAuthStore((state) => state.user);

  if (!user) return <>{fallback}</>;

  const required = Array.isArray(permission) ? permission : [permission];
  if (required.some((p) => hasPermission(user.permissions, p))) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

/** Hook form of HasPermission for conditional logic. */
export const useCan = () => {
  const permissions = useAuthStore((state) => state.user?.permissions);
  return (permission: string | string[]) =>
    (Array.isArray(permission) ? permission : [permission]).some((p) => hasPermission(permissions, p));
};
