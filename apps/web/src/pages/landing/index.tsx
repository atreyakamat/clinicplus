import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, FileText, Receipt, ShieldCheck, Stethoscope, Users } from 'lucide-react';
import { useAuthStore } from '../../app/store/auth.store';
import { Button } from '@clinicplus/ui';

const FEATURES = [
  { icon: CalendarCheck, title: 'Appointments & queue', text: 'Book, reschedule and check patients in, with SMS / WhatsApp reminders.' },
  { icon: Stethoscope, title: 'Consultations', text: 'Vitals, diagnoses and clinical notes in one workspace for the doctor.' },
  { icon: FileText, title: 'Prescriptions', text: 'Branded, signed prescriptions as PDF in a couple of clicks.' },
  { icon: Receipt, title: 'Billing', text: 'Invoices, payments, refunds and daily close reports.' },
  { icon: Users, title: 'Your team', text: 'Invite staff with roles built for clinics: doctor, receptionist, nurse, accountant.' },
  { icon: ShieldCheck, title: 'Secure by design', text: 'Role-based access, audit trail and isolated clinic data.' },
];

export const LandingPage = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  React.useEffect(() => {
    if (isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="flex items-center justify-between">
          <span className="text-2xl font-bold text-[#1FA971]">ClinicPlus</span>
          <Button variant="outline" size="sm" onClick={() => navigate('/auth/login')}>
            Sign in
          </Button>
        </header>

        <section className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-5xl">Run your clinic from one place</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Appointments, consultations, prescriptions and billing for solo doctors and multi-branch clinics.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" className="bg-[#1FA971] hover:bg-[#1A8D5E]" onClick={() => navigate('/auth/login?mode=register')}>
              Create your clinic
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/auth/login')}>
              Sign in
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl bg-white/80 p-5 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1FA971]/10 text-[#1FA971]">
                <Icon size={20} />
              </div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </section>

        <footer className="border-t border-emerald-200 pt-6 text-center text-sm text-slate-500">
          Invited by your clinic? Open the link from your invitation e-mail or SMS to activate your account.
        </footer>
      </div>
    </div>
  );
};
