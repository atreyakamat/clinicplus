import React from 'react';

export const AuthPage = () => {
  return (
    <div className="p-6 flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center">ClinicOS Login</h1>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" className="w-full border rounded p-2" placeholder="admin@clinicos.com" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" className="w-full border rounded p-2" placeholder="••••••••" />
          </div>
          <button type="button" className="w-full bg-[#1FA971] text-white p-2 rounded hover:bg-green-600">Login</button>
        </form>
      </div>
    </div>
  );
};
