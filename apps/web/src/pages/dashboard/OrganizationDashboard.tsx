import React from 'react';
import { useQueries } from '@tanstack/react-query';
import { Activity, Calendar, CreditCard, Users } from 'lucide-react';
import { Card, PageHeader, StatCard, Button } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const OrganizationDashboard = () => {
  const results = useQueries({
    queries: [
      { queryKey: ['dashboard', 'patients'], queryFn: () => api.get('/patients') },
      { queryKey: ['dashboard', 'appointments'], queryFn: () => api.get('/appointments') },
      { queryKey: ['dashboard', 'invoices'], queryFn: () => api.get('/invoices') },
      { queryKey: ['dashboard', 'tasks'], queryFn: () => api.get('/tasks') },
    ],
  });

  const [patientsQuery, appointmentsQuery, invoicesQuery, tasksQuery] = results;
  const isLoading = results.some((query) => query.isLoading);

  const patients = (patientsQuery.data as any[] | undefined) ?? [];
  const appointments = (appointmentsQuery.data as any[] | undefined) ?? [];
  const invoices = (invoicesQuery.data as any[] | undefined) ?? [];
  const tasks = (tasksQuery.data as any[] | undefined) ?? [];

  const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((appointment) =>
    appointment.scheduledStart?.slice(0, 10) === today,
  );

  if (isLoading) {
    return <div className="p-6 text-slate-500">Loading clinic overview...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Dashboard"
        description="Track operational health across patients, scheduling, revenue, and team execution."
      >
        <Button variant="outline" size="sm">Live View</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Patients" value={patients.length.toString()} change="Across this branch" />
        <StatCard label="Appointments Today" value={todayAppointments.length.toString()} change="Today" />
        <StatCard label="Open Tasks" value={openTasks.length.toString()} change="Needs follow-through" />
        <StatCard label="Billed Revenue" value={`$${revenue.toFixed(2)}`} change="Recorded invoices" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <Calendar size={18} className="text-[#1FA971]" />
            Today's Appointment Board
          </h3>
          {!todayAppointments.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No appointments are booked for today.
            </div>
          ) : (
            <div className="space-y-3">
              {todayAppointments.slice(0, 6).map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                  <div>
                    <div className="font-medium text-slate-900">
                      {appointment.patient?.firstName} {appointment.patient?.lastName}
                    </div>
                    <div className="text-sm text-slate-500">
                      Dr. {appointment.doctor?.lastName} • {new Date(appointment.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {appointment.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Users size={18} className="text-[#2563EB]" />
              Patient Snapshot
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-500">Recently added</span>
                <span className="font-medium text-slate-900">{patients.slice(0, 7).length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-500">With email</span>
                <span className="font-medium text-slate-900">{patients.filter((patient) => patient.email).length}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Activity size={18} className="text-orange-500" />
              Execution Watch
            </h3>
            <div className="space-y-3">
              {openTasks.slice(0, 4).map((task) => (
                <div key={task.id} className="rounded-lg border border-slate-200 px-3 py-3">
                  <div className="font-medium text-slate-900">{task.title}</div>
                  <div className="text-xs text-slate-500">{task.priority} priority</div>
                </div>
              ))}
              {!openTasks.length && (
                <div className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No open tasks right now.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <CreditCard size={18} className="text-emerald-500" />
              Revenue Pulse
            </h3>
            <div className="text-3xl font-semibold text-slate-900">${revenue.toFixed(2)}</div>
            <p className="mt-2 text-sm text-slate-500">Calculated from recorded invoice totals in this branch.</p>
          </Card>
        </div>
      </div>
    </div>
  );
};
