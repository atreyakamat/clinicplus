import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, Pill, Receipt, ChevronRight } from 'lucide-react';
import { portalApi, unwrap } from './portal.api';
import { usePortalAuth } from './portal.store';
import { Card, QueryState, fmtDateTime, fmtMoney } from './portal.ui';

export function PortalDashboard() {
  const patient = usePortalAuth((s) => s.patient);

  const appts = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => portalApi.get('/appointments').then(unwrap) });
  const rx = useQuery({ queryKey: ['portal', 'prescriptions'], queryFn: () => portalApi.get('/prescriptions').then(unwrap) });
  const invoices = useQuery({ queryKey: ['portal', 'invoices'], queryFn: () => portalApi.get('/invoices').then(unwrap) });

  const nextAppt = appts.data?.upcoming?.[0];
  const activeRx = (rx.data ?? []).filter((p: any) => p.status === 'ACTIVE');
  const dues = (invoices.data ?? []).filter((i: any) => Number(i.balance) > 0);
  const totalDue = dues.reduce((sum: number, i: any) => sum + Number(i.balance), 0);

  const isLoading = appts.isLoading || rx.isLoading || invoices.isLoading;
  const error = appts.error || rx.error || invoices.error;

  return (
    <div>
      <div className="mb-5">
        <p className="text-sm text-slate-500">Welcome back,</p>
        <h1 className="text-xl font-semibold text-slate-900">{patient?.firstName} {patient?.lastName}</h1>
      </div>

      <QueryState isLoading={isLoading} error={error}>
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
              <Calendar className="w-4 h-4" /> NEXT APPOINTMENT
            </div>
            {nextAppt ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{fmtDateTime(nextAppt.scheduledStart)}</p>
                  <p className="text-sm text-slate-500">
                    Dr. {nextAppt.doctor?.firstName} {nextAppt.doctor?.lastName}
                    {nextAppt.doctor?.specialization ? ` · ${nextAppt.doctor.specialization}` : ''}
                  </p>
                </div>
                <Link to="/portal/appointments" className="text-clinic-green"><ChevronRight className="w-5 h-5" /></Link>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">No upcoming appointments</p>
                <Link to="/portal/appointments" className="text-sm font-medium text-clinic-green">Book</Link>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Link to="/portal/invoices">
              <Card className="p-4 h-full">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                  <Receipt className="w-4 h-4" /> DUES
                </div>
                <p className="text-lg font-semibold text-slate-900">{fmtMoney(totalDue)}</p>
                <p className="text-xs text-slate-400">{dues.length} unpaid {dues.length === 1 ? 'invoice' : 'invoices'}</p>
              </Card>
            </Link>
            <Link to="/portal/prescriptions">
              <Card className="p-4 h-full">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                  <Pill className="w-4 h-4" /> MEDICATIONS
                </div>
                <p className="text-lg font-semibold text-slate-900">{activeRx.length}</p>
                <p className="text-xs text-slate-400">active {activeRx.length === 1 ? 'prescription' : 'prescriptions'}</p>
              </Card>
            </Link>
          </div>

          <Link to="/portal/appointments" className="block">
            <div className="bg-clinic-green text-white rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">Book an appointment</p>
                <p className="text-sm text-white/80">Pick a doctor and an open slot</p>
              </div>
              <ChevronRight className="w-5 h-5" />
            </div>
          </Link>
        </div>
      </QueryState>
    </div>
  );
}
