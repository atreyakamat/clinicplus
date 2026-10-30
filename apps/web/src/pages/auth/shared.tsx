import React from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';

/** Mirrors the API password policy (apps/api/src/common/validation/password.ts). */
export const passwordSchema = z
  .string()
  .min(8, { message: 'At least 8 characters' })
  .max(128, { message: 'At most 128 characters' })
  .regex(/[A-Z]/, { message: 'Include an upper-case letter' })
  .regex(/[a-z]/, { message: 'Include a lower-case letter' })
  .regex(/[\d\W_]/, { message: 'Include a digit or symbol' });

export const AuthShell = ({ subtitle, children }: { subtitle?: string; children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8 sm:p-6">
    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-8 text-center">
        <Link to="/" className="text-2xl font-bold text-[#1FA971]">
          ClinicPlus
        </Link>
        {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  </div>
);

export const ErrorBanner = ({ message }: { message: string }) => (
  <div role="alert" className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
    {message}
  </div>
);

export const SuccessBanner = ({ children }: { children: React.ReactNode }) => (
  <div role="status" className="mb-6 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
    {children}
  </div>
);
