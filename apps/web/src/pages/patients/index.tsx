import React, { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, ChevronRight, Download } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission } from '../../app/components/HasPermission';
import { Empty, ErrorBox, fmtDate, getData, getPage, inputCls, Loading, Pager, qs, StatusPill, useDebounced } from './shared';

interface PatientRow {
  id: string;
  patientCode?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  status: string;
  createdAt: string;
  tags?: { id: string; tagName: string; tagColor?: string }[];
}

const GENDERS = ['', 'MALE', 'FEMALE', 'OTHER'];
const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const PatientsPage = () => {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search, 300);
  const page = Number(params.get('page') || 1);
  const gender = params.get('gender') ?? '';
  const bloodGroup = params.get('bloodGroup') ?? '';
  const tag = params.get('tag') ?? '';
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? 'createdAt:desc';
  const [sortBy, sortDir] = sort.split(':');
  const [exportError, setExportError] = useState<unknown>(null);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== q) set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filters = { q, gender, bloodGroup, tag, status, sortBy, sortDir };
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['patients', filters, page],
    queryFn: () => getPage<PatientRow>(`/patients${qs({ ...filters, page, limit: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const { data: tags } = useQuery({
    queryKey: ['patient-tags'],
    queryFn: () => getData<{ tagName: string; count: number }[]>('/patients/tags'),
  });

  const exportCsv = async () => {
    setExportError(null);
    try {
      await api.download(`/patients/export/csv${qs({ q, gender, bloodGroup, tag, status })}`, 'patients.csv');
    } catch (e) {
      setExportError(e);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Patients" description="Search, filter and manage patient records." />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <HasPermission permission="patients.export">
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
            <Download size={16} /> Export CSV
          </Button>
        </HasPermission>
        <HasPermission permission="patients.create">
          <Link to="/patients/new">
            <Button size="sm" className="gap-2">
              <Plus size={16} /> New patient
            </Button>
          </Link>
        </HasPermission>
      </div>
      <ErrorBox error={exportError} />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Name, phone, email or patient ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={inputCls} value={gender} onChange={(e) => set({ gender: e.target.value })} aria-label="Gender">
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g || 'Any gender'}
            </option>
          ))}
        </select>
        <select className={inputCls} value={bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })} aria-label="Blood group">
          {BLOOD.map((b) => (
            <option key={b} value={b}>
              {b || 'Any blood group'}
            </option>
          ))}
        </select>
        <select className={inputCls} value={tag} onChange={(e) => set({ tag: e.target.value })} aria-label="Tag">
          <option value="">Any tag</option>
          {tags?.map((t) => (
            <option key={t.tagName} value={t.tagName}>
              {t.tagName} ({t.count})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select className={inputCls} value={status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="">Current</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <select className={inputCls} value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
            <option value="createdAt:desc">Newest</option>
            <option value="createdAt:asc">Oldest</option>
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="patientCode:asc">Patient ID</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <Loading label="Loading patients…" />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !data?.items.length ? (
        <Empty title="No patients found" hint={q ? 'Try a different search or clear filters.' : 'Register your first patient to get started.'}>
          <HasPermission permission="patients.create">
            <Link to="/patients/new">
              <Button size="sm">Register patient</Button>
            </Link>
          </HasPermission>
        </Empty>
      ) : (
        <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${isFetching ? 'opacity-70' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="hidden px-4 py-3 md:table-cell">Contact</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Details</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Registered</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/patients/${p.id}`} className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1FA971]/10 font-semibold text-[#1FA971]">
                          {p.firstName[0]}
                          {p.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {p.firstName} {p.lastName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {p.patientCode} {p.status !== 'ACTIVE' && <StatusPill status={p.status} />}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p>{p.phone || '—'}</p>
                      <p className="text-xs text-slate-500">{p.email || ''}</p>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.gender && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{p.gender}</span>}
                        {p.bloodGroup && <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">{p.bloodGroup}</span>}
                        {p.tags?.map((t) => (
                          <span
                            key={t.id}
                            className="rounded px-2 py-0.5 text-xs text-white"
                            style={{ backgroundColor: t.tagColor || '#64748b' }}
                          >
                            {t.tagName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/patients/${p.id}`} className="inline-flex items-center text-[#1FA971]" aria-label="Open profile">
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 p-3">
            <Pager meta={data.meta} onPage={(p) => set({ page: String(p) })} />
          </div>
        </div>
      )}
    </div>
  );
};
