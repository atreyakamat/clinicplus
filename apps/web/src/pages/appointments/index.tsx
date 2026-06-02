import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Calendar as CalendarIcon, Clock, User, ChevronRight } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { Link } from 'react-router-dom';

interface Appointment {
  id: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  doctor: {
    id: string;
    firstName: string;
    lastName: string;
  };
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  appointmentType?: string;
}

export const AppointmentsPage = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { data: appointments, isLoading, error } = useQuery<Appointment[]>({
    queryKey: ['appointments', selectedDate],
    queryFn: () => api.get(`/appointments?date=${selectedDate}`),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CONFIRMED': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'CHECKED_IN': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'IN_PROGRESS': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'COMPLETED': return 'bg-green-50 text-green-700 border-green-200';
      case 'CANCELLED': return 'bg-red-50 text-red-700 border-red-200';
      case 'NO_SHOW': return 'bg-gray-50 text-gray-700 border-gray-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Appointments" 
        description="Manage daily schedules and patient bookings."
      >
        <Link to="/appointments/new">
          <Button className="flex items-center gap-2">
            <Plus size={16} />
            New Appointment
          </Button>
        </Link>
      </PageHeader>

      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="ml-2"
          >
            Today
          </Button>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search appointments..."
            className="w-full pl-10 pr-4 h-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-500 bg-red-50 rounded-xl">
          Failed to load appointments. Please try again.
        </div>
      ) : !appointments?.length ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <CalendarIcon className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No appointments scheduled</h3>
          <p className="text-slate-500 mb-6">There are no appointments on {new Date(selectedDate).toLocaleDateString()}.</p>
          <Link to="/appointments/new">
            <Button>Schedule Appointment</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 text-lg">
                    {appointment.patient?.firstName} {appointment.patient?.lastName}
                  </h3>
                  <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                    <User size={14} /> Dr. {appointment.doctor?.lastName}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getStatusColor(appointment.status)}`}>
                  {appointment.status.replace('_', ' ')}
                </span>
              </div>
              
              <div className="space-y-2 mt-4 bg-slate-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Clock size={16} className="text-[#1FA971]" />
                  <span className="font-medium">{formatTime(appointment.scheduledStart)} - {formatTime(appointment.scheduledEnd)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <CalendarIcon size={16} className="text-slate-400" />
                  <span>{new Date(appointment.scheduledStart).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                <Link to={`/appointments/${appointment.id}`}>
                  <Button variant="outline" size="sm" className="gap-1">
                    Details <ChevronRight size={14} />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
