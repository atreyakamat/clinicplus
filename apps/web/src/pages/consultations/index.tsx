import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission } from '../../app/components/HasPermission';
import {
  drName,
  Empty,
  ErrorBox,
  fmtDateTime,
  fullName,
  getPage,
  inputCls,
  Loading,
  Modal,
  Pager,
  PatientPicker,
  qs,
  StatusPill,
  unwrap,
  useDebounced,
  type PatientHit,
} from '../patients/shared';

export const ConsultationsPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [startOpen, setStartOpen] = useState(false);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [startError, setStartError] = useState<unknown>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['consultations', { status, mine, q, page }],
    queryFn: () => getPage<any>(`/consultations${qs({ status, mine: mine ? 'true' : undefined, q, page, limit: 25 })}`),
    placeholderData: keepPreviousData,
  });

  const start = async () => {
    if (!patient) return;
    setStartError(null);
    try {
      const c = await unwrap(api.post('/consultations', { patientId: patient.id }));
      navigate(`/consultations/${c.id}`);
    } catch (e) {
      setStartError(e);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Consultations" description="Clinical encounters for this branch." />
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-full sm:w-64`} placeholder="Search patient" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className={`${inputCls} w-40`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">All</option>
          <option value="DRAFT">In progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Mine only
        </label>
        <HasPermission permission="consultations.create">
          <Button size="sm" className="ml-auto gap-1" onClick={() => setStartOpen(true)}>
            <Plus size={16} /> Start consultation
          </Button>
        </HasPermission>
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !data?.items.length ? (
        <Empty title="No consultations" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {data.items.map((c: any) => (
              <li key={c.id}>
                <Link to={`/consultations/${c.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {fullName(c.patient)} <span className="text-xs text-slate-500">{c.patient?.patientCode}</span>
                    </p>
                    <p className="truncate text-sm text-slate-500">{c.chiefComplaint || 'No chief complaint recorded'}</p>
                    <p className="text-xs text-slate-400">
                      {fmtDateTime(c.consultationDate)} · {drName(c.doctor)} · {c._count?.diagnoses ?? 0} dx · {c._count?.prescriptions ?? 0} Rx
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={c.status} />
                    <ChevronRight size={16} className="text-slate-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 p-3">
            <Pager meta={data.meta} onPage={setPage} />
          </div>
        </div>
      )}
      {startOpen && (
        <Modal title="Start consultation" onClose={() => setStartOpen(false)}>
          <div className="space-y-3">
            <PatientPicker value={patient} onChange={setPatient} />
            <ErrorBox error={startError} />
            <div className="flex justify-end">
              <Button disabled={!patient} onClick={start}>
                Open workspace
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
