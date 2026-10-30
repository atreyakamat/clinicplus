import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Stethoscope, ChevronRight, Clock } from 'lucide-react';
import { Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { DAY_SHORT, type Doctor, errorMessage, inputCls, unwrap } from './scheduling';

export const DoctorsPage = () => {
  const [search, setSearch] = useState('');
  const { data: doctors, isLoading, error } = useQuery<Doctor[]>({
    queryKey: ['doctors', search],
    queryFn: async () => unwrap<Doctor[]>(await api.get(`/doctors${search ? `?search=${encodeURIComponent(search)}` : ''}`)),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Doctors" description="Profiles, weekly schedules and leave for doctors in this branch." />
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input className={`${inputCls} pl-9`} placeholder="Search by name or specialization" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-red-50 text-red-700">{errorMessage(error, 'Failed to load doctors')}</div>
      ) : !doctors?.length ? (
        <Card className="text-center py-12">
          <Stethoscope className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-slate-600 font-medium">No doctors found</p>
          <p className="text-sm text-slate-500 mt-1">Invite staff with the Doctor role from Settings → Staff.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {doctors.map((d) => {
            const days = Array.from(new Set((d.doctorAvailability ?? []).map((a) => a.dayOfWeek))).sort();
            return (
              <Link key={d.id} to={`/doctors/${d.id}`} className="block">
                <Card className="h-full hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-full bg-[#1FA971]/10 text-[#1FA971] font-bold flex items-center justify-center shrink-0">
                        {d.firstName?.[0]}{d.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">Dr. {d.firstName} {d.lastName}</h3>
                        <p className="text-sm text-slate-500 truncate">{d.specialization || 'General'}{d.qualification ? ` · ${d.qualification}` : ''}</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 shrink-0" />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Fee</span>
                    <span className="font-medium">{d.consultationFee != null ? Number(d.consultationFee).toFixed(2) : '—'}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    <Clock size={14} className="text-slate-400 mr-1" />
                    {days.length ? (
                      DAY_SHORT.map((s, i) => (
                        <span key={s} className={`text-[11px] px-1.5 py-0.5 rounded ${days.includes(i) ? 'bg-[#1FA971]/10 text-[#1FA971]' : 'bg-slate-100 text-slate-400'}`}>{s}</span>
                      ))
                    ) : (
                      <span className="text-xs text-amber-700">No schedule set</span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
