import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, FileText, User } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

const statusOptions = [
  { label: 'Confirm', value: 'CONFIRMED' },
  { label: 'Check In', value: 'CHECKED_IN' },
  { label: 'Start Visit', value: 'IN_PROGRESS' },
  { label: 'Complete', value: 'COMPLETED' },
  { label: 'Cancel', value: 'CANCELLED' },
];

const toneByStatus: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMED: 'bg-violet-50 text-violet-700 border-violet-200',
  CHECKED_IN: 'bg-orange-50 text-orange-700 border-orange-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  NO_SHOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const AppointmentDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: appointment, isLoading } = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api.get(`/appointments/${id}`),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/appointments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment', id] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  if (isLoading) {
    return <div className="p-6 text-slate-500">Loading appointment details...</div>;
  }

  if (!appointment) {
    return <div className="p-6 text-red-500">Appointment not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/appointments')}>
          <ArrowLeft size={16} />
        </Button>
        <PageHeader
          title="Appointment Detail"
          description={`Scheduled for ${new Date(appointment.scheduledStart).toLocaleDateString()}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">
                {appointment.patient?.firstName} {appointment.patient?.lastName}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Appointment with Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
              </p>
            </div>
            <Badge className={toneByStatus[appointment.status] ?? 'bg-slate-100 text-slate-700 border-slate-200'}>
              {appointment.status.replace('_', ' ')}
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
                <Calendar size={16} className="text-[#1FA971]" />
                Date
              </div>
              <div className="text-sm text-slate-900">
                {new Date(appointment.scheduledStart).toLocaleDateString()}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
                <Clock size={16} className="text-[#1FA971]" />
                Time
              </div>
              <div className="text-sm text-slate-900">
                {new Date(appointment.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                {new Date(appointment.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">Notes</div>
            <p className="text-sm text-slate-600">{appointment.notes || 'No clinical or scheduling notes were added.'}</p>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
            {statusOptions.map((statusOption) => (
              <Button
                key={statusOption.value}
                variant={appointment.status === statusOption.value ? 'primary' : 'outline'}
                size="sm"
                onClick={() => updateMutation.mutate(statusOption.value)}
                disabled={updateMutation.isPending || appointment.status === statusOption.value}
              >
                {statusOption.label}
              </Button>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Patient</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User size={16} className="text-slate-400" />
                <div>
                  <div className="font-medium text-slate-900">
                    {appointment.patient?.firstName} {appointment.patient?.lastName}
                  </div>
                  <div className="text-sm text-slate-500">{appointment.patient?.phone || 'No phone recorded'}</div>
                </div>
              </div>
              <Link to={`/patients/${appointment.patientId}`}>
                <Button variant="outline" size="sm" className="w-full">Open Patient Profile</Button>
              </Link>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Next Steps</h3>
            <div className="space-y-3">
              <Link to={`/prescriptions/new?patientId=${appointment.patientId}`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <FileText size={16} />
                  Create Prescription
                </Button>
              </Link>
              <Link to="/queue">
                <Button variant="outline" size="sm" className="w-full">Open Live Queue</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
