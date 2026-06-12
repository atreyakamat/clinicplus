import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../app/store/auth.store';
import { Button } from '@clinicplus/ui';

export const LandingPage = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Redirect to dashboard if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) {
    return null; // Will be redirected by useEffect
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] p-6">
      <div className="w-full max-w-xl space-y-8">
        {/* Hero Section */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-[#1FA971] mb-4">
            ClinicPlus
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            Modern Healthcare Operating System for Clinics
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button
              onClick={() => navigate('/auth/login')}
              className="bg-[#1FA971] hover:bg-[#1A8D5E] px-6 py-3 text-lg font-medium"
            >
              Sign In
            </Button>
            <Button
              onClick={() => navigate('/auth/login')}
              variant="outline"
              className="border-[#1FA971] text-[#1FA971] hover:border-[#1A8D5E] hover:text-[#1A8D5E] px-6 py-3 text-lg font-medium"
            >
              Sign Up Free
            </Button>
          </div>
        </div>

        /* Features Section */
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-[#1FA971]/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1FA971]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-[#1FA971] mb-2">Appointment Management</h3>
              <p className="text-gray-600">
                Streamline patient scheduling, reminders, and calendar management
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-[#1FA971]/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1FA971]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M9 12h6m2 0a3 3 0 100-6 3 3 0 000 6zm-7 0a5.002 5.002 0 019.001-6.007 5 5 0 01-4.002 9.008M4 12h.01" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-[#1FA971] mb-2">Patient Records</h3>
              <p className="text-gray-600">
                Secure, organized electronic health records with easy access
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-[#1FA971]/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1FA971]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 4a2 2 0 100-4 2 2 0 000 4zm4-8a2 2 0 110 4 2 2 0 000-4zm-6 4a2 2 0 100-4 2 2 0 000 4zm0-4a2 2 0 110 4 2 2 0 000-4zm8 0c-1.11 0-2 .89-2 2s.89 2 2 2 2-.89 2-2-.89-2-2-2z" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-[#1FA971] mb-2">Billing & Invoicing</h3>
              <p className="text-gray-600">
                Automated invoicing, payment processing, and financial reporting
              </p>
            </div>
          </div>
        </div>

        /* Call to Action */
        <div className="text-center pt-6 border-t border-gray-200">
          <p className="text-gray-500">
            Join thousands of clinics using ClinicPlus to improve patient care and operational efficiency
          </p>
          <div className="mt-4">
            <Button
              onClick={() => navigate('/auth/login')}
              className="bg-[#1FA971] hover:bg-[#1A8D5E] px-8 py-4 text-lg font-medium"
            >
              Get Started Today
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};