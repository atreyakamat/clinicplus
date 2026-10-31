import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { HasPermission } from '../../app/components/HasPermission';
import { drName, Empty, ErrorBox, fmtDate, fullName, getPage, inputCls, Loading, Pager, qs, StatusPill } from '../patients/shared';

export const PrescriptionsPage = () => {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['prescriptions', { status, page }],
    queryFn: () => getPage<any>(`/prescriptions${qs({ status, page, limit: 25 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Prescriptions" description="Issued prescriptions for this branch." />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          className={`${inputCls} w-48`}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <HasPermission permission="prescriptions.create">
          <Link to="/prescriptions/new">
            <Button size="sm" className="gap-1">
              <Plus size={16} /> New prescription
            </Button>
          </Link>
        </HasPermission>
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !data?.items.length ? (
        <Empty title="No prescriptions" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {data.items.map((rx: any) => (
              <li key={rx.id}>
                <Link to={`/prescriptions/${rx.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {fullName(rx.patient)} <span className="text-xs text-slate-500">{rx.patient?.patientCode}</span>
                    </p>
                    <p className="truncate text-sm text-slate-500">{rx.items.map((i: any) => i.medicineName).join(', ')}</p>
                    <p className="text-xs text-slate-400">
                      {fmtDate(rx.issuedAt)} · {drName(rx.doctor)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={rx.status} />
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
    </div>
  );
};
