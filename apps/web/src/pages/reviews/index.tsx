import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, MessageSquare, Plus, Send, Star, ThumbsUp, Users } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import {
  ErrorBox,
  Modal,
  Pager,
  PatientPicker,
  fmtDate,
  fmtDateTime,
  getData,
  getList,
  inputCls,
  personName,
  qs,
} from '../tasks/ui';
import type { PatientOption } from '../tasks/ui';

interface Review {
  id: string;
  rating: number;
  npsScore?: number | null;
  reviewText?: string | null;
  isPublic: boolean;
  source?: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string };
  doctor: { id: string; firstName: string; lastName: string };
}

interface Summary {
  totalReviews: number;
  averageRating: number | null;
  distribution: Record<string, number>;
  nps: { score: number | null; responses: number; promoters: number; passives: number; detractors: number };
  publicReviews: number;
  requests: { sent: number; completed: number; responseRate: number };
  byDoctor: { doctorId: string; name: string; reviews: number; averageRating: number | null; averageNps: number | null }[];
}

interface ReviewRequest {
  id: string;
  status: string;
  channel?: string | null;
  sentAt?: string | null;
  completedAt?: string | null;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
  appointmentId?: string | null;
  patient?: { id: string; firstName: string; lastName: string } | null;
}

type ReferralStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST';
interface Referral {
  id: string;
  status: ReferralStatus;
  referredName?: string | null;
  referredPhone?: string | null;
  notes?: string | null;
  source?: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; phone?: string | null };
  convertedPatient?: { id: string; firstName: string; lastName: string } | null;
}

interface ReferralStats {
  total: number;
  byStatus: Record<ReferralStatus, number>;
  conversionRate: number;
  topReferrers: { patientId: string; name: string; referrals: number; converted: number }[];
}

const TABS = [
  { id: 'reviews', label: 'Reviews' },
  { id: 'requests', label: 'Review requests' },
  { id: 'referrals', label: 'Referrals' },
] as const;

const Stars = ({ value, size = 14 }: { value: number; size?: number }) => (
  <span className="inline-flex" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
    ))}
  </span>
);

export const ReviewsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'reviews') as (typeof TABS)[number]['id'];
  const [requesting, setRequesting] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews & referrals"
        description="Patient ratings, NPS and word-of-mouth growth for this branch."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/reviews/feedback">
              <Button size="sm" variant="outline">
                <MessageSquare size={15} className="mr-1" /> Staff feedback
              </Button>
            </Link>
            <HasPermission permission="reviews.manage">
              <Button size="sm" onClick={() => setRequesting(true)}>
                <Send size={15} className="mr-1" /> Request review
              </Button>
            </HasPermission>
          </div>
        }
      />
      <ReputationSummary />
      <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams(t.id === 'reviews' ? {} : { tab: t.id }, { replace: true })}
            className={`rounded-md px-3 py-1.5 font-medium ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'reviews' && <ReviewsList />}
      {tab === 'requests' && <RequestsList />}
      {tab === 'referrals' && <ReferralsBoard />}
      <RequestReviewModal open={requesting} onClose={() => setRequesting(false)} />
    </div>
  );
};

const ReputationSummary = () => {
  const q = useQuery({ queryKey: ['reviews', 'summary'], queryFn: () => getData<Summary>('/reviews/summary') });
  const s = q.data;
  const maxBucket = s ? Math.max(1, ...Object.values(s.distribution)) : 1;
  return (
    <div className="space-y-4">
      <ErrorBox error={q.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><Star size={15} className="text-amber-500" /> Average rating</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900">{s?.averageRating ?? '—'}</span>
            {s?.averageRating != null && <Stars value={s.averageRating} />}
          </div>
          <div className="text-xs text-slate-400">{s?.totalReviews ?? 0} reviews</div>
        </Card>
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><ThumbsUp size={15} className="text-[#1FA971]" /> NPS</div>
          <div className="text-2xl font-semibold text-slate-900">{s?.nps.score ?? '—'}</div>
          <div className="text-xs text-slate-400">
            {s ? `${s.nps.promoters} promoters · ${s.nps.detractors} detractors` : ''}
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><Send size={15} className="text-[#2563EB]" /> Response rate</div>
          <div className="text-2xl font-semibold text-slate-900">{s ? `${s.requests.responseRate}%` : '—'}</div>
          <div className="text-xs text-slate-400">{s ? `${s.requests.completed} of ${s.requests.sent} requests` : ''}</div>
        </Card>
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><Eye size={15} className="text-slate-500" /> Public reviews</div>
          <div className="text-2xl font-semibold text-slate-900">{s?.publicReviews ?? '—'}</div>
          <div className="text-xs text-slate-400">Approved for display</div>
        </Card>
      </div>
      {s && s.totalReviews > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Rating distribution</h3>
            <div className="space-y-2">
              {['5', '4', '3', '2', '1'].map((k) => (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <span className="w-8 shrink-0 text-slate-600">{k}★</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${(s.distribution[k] / maxBucket) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right tabular-nums text-slate-600">{s.distribution[k]}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden p-0">
            <h3 className="px-5 pt-5 text-sm font-semibold text-slate-900">By doctor</h3>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2">Doctor</th>
                  <th className="px-5 py-2 text-right">Reviews</th>
                  <th className="px-5 py-2 text-right">Avg rating</th>
                  <th className="px-5 py-2 text-right">Avg NPS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.byDoctor.map((d) => (
                  <tr key={d.doctorId}>
                    <td className="px-5 py-2 text-slate-900">Dr. {d.name}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{d.reviews}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{d.averageRating ?? '—'}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{d.averageNps ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
};

const ReviewsList = () => {
  const can = useCan();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'low' | 'public'>('all');
  const [page, setPage] = useState(1);
  const params = { page, limit: 20, ...(filter === 'low' ? { maxRating: 3 } : {}), ...(filter === 'public' ? { isPublic: true } : {}) };
  const q = useQuery({ queryKey: ['reviews', 'list', params], queryFn: () => getList<Review>(`/reviews${qs(params)}`) });
  const toggle = useMutation({
    mutationFn: (r: Review) => api.patch(`/reviews/${r.id}/public`, { isPublic: !r.isPublic }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reviews'] }),
  });
  return (
    <div className="space-y-3">
      <select
        className={`${inputCls} w-auto`}
        value={filter}
        onChange={(e) => {
          setPage(1);
          setFilter(e.target.value as typeof filter);
        }}
        aria-label="Filter reviews"
      >
        <option value="all">All reviews</option>
        <option value="low">Needs attention (3★ or less)</option>
        <option value="public">Public only</option>
      </select>
      <ErrorBox error={q.error || toggle.error} />
      {q.isLoading && <p className="text-sm text-slate-500">Loading reviews…</p>}
      {q.data && !q.data.items.length && (
        <Card className="p-10 text-center text-sm text-slate-500">
          No reviews yet. Patients are asked automatically 2–24 hours after a completed visit, or you can request one manually.
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.items.map((r) => (
          <Card key={r.id} className={`space-y-2 p-4 ${r.rating <= 2 ? 'border-red-200' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Stars value={r.rating} />
                <div className="mt-1 text-sm font-medium text-slate-900">{personName(r.patient)}</div>
                <div className="text-xs text-slate-500">Dr. {personName(r.doctor)} · {fmtDate(r.createdAt)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {r.npsScore != null && (
                  <Badge variant={r.npsScore >= 9 ? 'success' : r.npsScore <= 6 ? 'error' : 'warning'}>NPS {r.npsScore}</Badge>
                )}
                {r.isPublic && <Badge variant="info">public</Badge>}
              </div>
            </div>
            {r.reviewText ? <p className="text-sm text-slate-700">“{r.reviewText}”</p> : <p className="text-sm italic text-slate-400">No comment</p>}
            {can('reviews.manage') && (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)} disabled={toggle.isPending}>
                  {r.isPublic ? <><EyeOff size={14} className="mr-1" /> Hide from public</> : <><Eye size={14} className="mr-1" /> Make public</>}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Pager meta={q.data?.meta} page={page} onPage={setPage} />
    </div>
  );
};

const REQUEST_VARIANT: Record<string, 'default' | 'info' | 'success' | 'error'> = {
  PENDING: 'default',
  SENT: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
};

const RequestsList = () => {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['reviews', 'requests', page],
    queryFn: () => getList<ReviewRequest>(`/reviews/requests${qs({ page, limit: 25 })}`),
  });
  return (
    <Card className="overflow-hidden p-0">
      <ErrorBox error={q.error} />
      {q.isLoading ? (
        <p className="p-6 text-sm text-slate-500">Loading…</p>
      ) : !q.data?.items.length ? (
        <p className="p-10 text-center text-sm text-slate-500">No review requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Responded</th>
                <th className="px-4 py-3">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-900">{personName(r.patient)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.expired ? 'default' : REQUEST_VARIANT[r.status] ?? 'default'}>
                      {r.expired ? 'expired' : r.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDateTime(r.sentAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDateTime(r.completedAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(r.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4">
        <Pager meta={q.data?.meta} page={page} onPage={setPage} />
      </div>
    </Card>
  );
};

const RequestReviewModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [result, setResult] = useState<{ link: string; delivery: { delivered: boolean; error?: string } } | null>(null);
  const [copied, setCopied] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => (await api.post('/reviews/requests', { patientId: patient!.id })).data,
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
  const close = () => {
    setPatient(null);
    setResult(null);
    setCopied(false);
    mutation.reset();
    onClose();
  };
  return (
    <Modal open={open} title="Request a review" onClose={close}>
      {result ? (
        <div className="space-y-4">
          {result.delivery.delivered ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Review link sent by SMS to {personName(patient)}.</p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The link was created but the SMS was not delivered ({result.delivery.error}). Share it another way:
            </p>
          )}
          <div className="flex gap-2">
            <input className={inputCls} readOnly value={result.link} aria-label="Review link" />
            <Button
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(result.link).then(() => setCopied(true))}
              aria-label="Copy link"
            >
              <Copy size={15} />
            </Button>
          </div>
          {copied && <p className="text-xs text-emerald-700">Copied.</p>}
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (patient) mutation.mutate();
          }}
        >
          <PatientPicker value={patient} onChange={setPatient} />
          <p className="text-xs text-slate-500">
            The patient gets a one-time link (valid 14 days) to rate their most recent completed visit.
          </p>
          <ErrorBox error={mutation.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!patient || mutation.isPending}>{mutation.isPending ? 'Sending…' : 'Send request'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

// ------------------------------------------------------------------ referrals

const REFERRAL_COLUMNS: { status: ReferralStatus; label: string }[] = [
  { status: 'NEW', label: 'New' },
  { status: 'CONTACTED', label: 'Contacted' },
  { status: 'CONVERTED', label: 'Converted' },
  { status: 'LOST', label: 'Lost' },
];

const ReferralsBoard = () => {
  const can = useCan();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [converting, setConverting] = useState<Referral | null>(null);
  const stats = useQuery({ queryKey: ['referrals', 'stats'], queryFn: () => getData<ReferralStats>('/referrals/stats') });
  const list = useQuery({ queryKey: ['referrals', 'list'], queryFn: () => getList<Referral>('/referrals?limit=200') });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReferralStatus }) => api.patch(`/referrals/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['referrals'] }),
  });
  const s = stats.data;
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <ErrorBox error={stats.error || list.error || move.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><Users size={15} className="text-[#1FA971]" /> Conversion rate</div>
          <div className="text-3xl font-semibold text-slate-900">{s ? `${s.conversionRate}%` : '—'}</div>
          <div className="text-xs text-slate-400">{s ? `${s.byStatus.CONVERTED} of ${s.total} referrals became patients` : ''}</div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Top referrers</h3>
          {!s?.topReferrers.length ? (
            <p className="text-sm text-slate-500">No referrals recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {s.topReferrers.slice(0, 5).map((r) => (
                <li key={r.patientId} className="flex justify-between py-1.5">
                  <Link to={`/patients/${r.patientId}`} className="text-slate-900 hover:underline">{r.name}</Link>
                  <span className="text-slate-500">{r.referrals} referred · {r.converted} converted</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex justify-end">
        <HasPermission permission="reviews.manage">
          <Button size="sm" onClick={() => setAdding(true)}><Plus size={15} className="mr-1" /> Log referral</Button>
        </HasPermission>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-slate-500">Loading referrals…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {REFERRAL_COLUMNS.map((col) => {
            const colItems = items.filter((r) => r.status === col.status);
            return (
              <div key={col.status} className="rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">
                  {col.label}
                  <span className="text-xs font-normal text-slate-500">{colItems.length}</span>
                </div>
                <div className="space-y-2 px-3 pb-3">
                  {!colItems.length && <p className="py-4 text-center text-xs text-slate-400">Empty</p>}
                  {colItems.map((r) => (
                    <div key={r.id} className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                      <div className="font-medium text-slate-900">{r.referredName ?? 'Unnamed lead'}</div>
                      {r.referredPhone && <a href={`tel:${r.referredPhone}`} className="block text-xs text-slate-500">{r.referredPhone}</a>}
                      <div className="text-xs text-slate-500">Referred by {personName(r.patient)} · {fmtDate(r.createdAt)}</div>
                      {r.convertedPatient && (
                        <Link to={`/patients/${r.convertedPatient.id}`} className="block text-xs text-[#1FA971] hover:underline">
                          Patient: {personName(r.convertedPatient)}
                        </Link>
                      )}
                      {r.notes && <p className="text-xs text-slate-600">{r.notes}</p>}
                      {can('reviews.manage') && r.status !== 'CONVERTED' && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {r.status === 'NEW' && (
                            <button className="rounded border px-2 py-0.5 text-xs" onClick={() => move.mutate({ id: r.id, status: 'CONTACTED' })}>
                              Contacted
                            </button>
                          )}
                          <button className="rounded border border-[#1FA971] px-2 py-0.5 text-xs text-[#1FA971]" onClick={() => setConverting(r)}>
                            Convert
                          </button>
                          {r.status !== 'LOST' ? (
                            <button className="rounded border px-2 py-0.5 text-xs text-slate-500" onClick={() => move.mutate({ id: r.id, status: 'LOST' })}>
                              Lost
                            </button>
                          ) : (
                            <button className="rounded border px-2 py-0.5 text-xs" onClick={() => move.mutate({ id: r.id, status: 'NEW' })}>
                              Reopen
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AddReferralModal open={adding} onClose={() => setAdding(false)} />
      <ConvertReferralModal referral={converting} onClose={() => setConverting(null)} />
    </div>
  );
};

const AddReferralModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [referrer, setReferrer] = useState<PatientOption | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/referrals', {
        patientId: referrer!.id,
        referredName: name,
        referredPhone: phone || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      close();
    },
  });
  const close = () => {
    setReferrer(null);
    setName('');
    setPhone('');
    setNotes('');
    mutation.reset();
    onClose();
  };
  return (
    <Modal open={open} title="Log a referral" onClose={close}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (referrer) mutation.mutate();
        }}
      >
        <PatientPicker value={referrer} onChange={setReferrer} label="Referred by (existing patient)" />
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="ref-name">Referred person</label>
          <input id="ref-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="ref-phone">Phone</label>
          <input id="ref-phone" type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="ref-notes">Notes</label>
          <textarea id="ref-notes" className={`${inputCls} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </div>
        <ErrorBox error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="submit" disabled={!referrer || !name.trim() || mutation.isPending}>Save referral</Button>
        </div>
      </form>
    </Modal>
  );
};

const ConvertReferralModal = ({ referral, onClose }: { referral: Referral | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.post(`/referrals/${referral!.id}/convert`, { convertedPatientId: patient!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      close();
    },
  });
  const close = () => {
    setPatient(null);
    mutation.reset();
    onClose();
  };
  return (
    <Modal open={!!referral} title={`Convert ${referral?.referredName ?? 'referral'}`} onClose={close}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (patient) mutation.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          Link the patient record created for this person.{' '}
          <Link to="/patients/new" className="text-[#2563EB] hover:underline">Register a new patient</Link> first if needed.
        </p>
        <PatientPicker value={patient} onChange={setPatient} label="New patient record" />
        <ErrorBox error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="submit" disabled={!patient || mutation.isPending}>Mark converted</Button>
        </div>
      </form>
    </Modal>
  );
};
