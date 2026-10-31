import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Users } from 'lucide-react';
import { api } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import { Btn, Empty, ErrorNote, Loading, Panel, StatusBadge, fmtDateTime, getData, getPage, inputCls, renderLocal } from './shared';

interface Audience {
  tags?: string[];
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  lastVisitBeforeDays?: number;
  lastVisitAfterDays?: number;
  hasUpcomingAppointment?: boolean;
}

const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.floor(Number(v))));

function cleanAudience(a: Audience): Audience {
  const out: Audience = {};
  if (a.tags?.length) out.tags = a.tags;
  if (a.gender) out.gender = a.gender;
  (['ageMin', 'ageMax', 'lastVisitBeforeDays', 'lastVisitAfterDays'] as const).forEach((k) => {
    if (a[k] !== undefined && !Number.isNaN(a[k])) out[k] = a[k];
  });
  if (a.hasUpcomingAppointment !== undefined) out.hasUpcomingAppointment = a.hasUpcomingAppointment;
  return out;
}

function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const Campaigns = () => {
  const can = useCan();
  const canManage = can('campaigns.manage');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['comm', 'campaigns'],
    queryFn: () => getPage('/campaigns?limit=100'),
    refetchInterval: (q) => ((q.state.data?.items ?? []).some((c: any) => c.status === 'SENDING') ? 5000 : false),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Panel className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-100">Campaigns</h3>
          {canManage && (
            <Btn
              variant="ghost"
              onClick={() => {
                setCreating(true);
                setSelected(null);
              }}
            >
              <Plus size={14} /> New campaign
            </Btn>
          )}
        </div>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorNote error={list.error} />
        ) : !list.data?.items.length ? (
          <Empty>No campaigns yet.</Empty>
        ) : (
          <ul className="space-y-1">
            {list.data.items.map((c: any) => (
              <li key={c.id}>
                <button
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selected === c.id ? 'bg-[#1FA971]/15' : 'hover:bg-gray-800'}`}
                  onClick={() => {
                    setSelected(c.id);
                    setCreating(false);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-100">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {c.channel} · {c.sentCount} sent · {c.failedCount} not delivered
                    {c.status === 'SCHEDULED' && c.scheduledAt ? ` · ${fmtDateTime(c.scheduledAt)}` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="lg:col-span-3">
        {creating ? (
          <CampaignForm
            onDone={(id) => {
              setCreating(false);
              setSelected(id);
            }}
          />
        ) : selected ? (
          <CampaignDetail id={selected} />
        ) : (
          <Panel>
            <Empty>
              <Megaphone className="mx-auto mb-2 text-gray-500" size={22} />
              Select a campaign{canManage ? ' or create a new one' : ''}.
            </Empty>
          </Panel>
        )}
      </div>
    </div>
  );
};

const CampaignForm = ({ onDone }: { onDone: (id: string) => void }) => {
  const qc = useQueryClient();
  const orgWide = useAuthStore((s) => {
    const u = s.user as any;
    return !!u?.orgWide || (u?.roles ?? []).some((r: string) => ['Organization Owner', 'Clinic Admin', 'Super Admin'].includes(r));
  });
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'SMS' | 'WHATSAPP'>('SMS');
  const [mode, setMode] = useState<'template' | 'text'>('text');
  const [templateId, setTemplateId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [audience, setAudience] = useState<Audience>({});
  const [tagInput, setTagInput] = useState('');
  const [allBranches, setAllBranches] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  const templates = useQuery({ queryKey: ['comm', 'templates'], queryFn: () => getData<any>('/templates') });
  const tags = useQuery({ queryKey: ['comm', 'patient-tags'], queryFn: () => getData<any[]>('/patients/tags'), retry: false });
  const tagOptions: string[] = useMemo(
    () => (tags.data ?? []).map((t: any) => (typeof t === 'string' ? t : t.tagName ?? t.name)).filter(Boolean),
    [tags.data],
  );

  const cleaned = useMemo(() => cleanAudience(audience), [audience]);
  const debounced = useDebounced(JSON.stringify({ cleaned, allBranches }));
  const preview = useQuery({
    queryKey: ['comm', 'audience-preview', debounced],
    queryFn: async () => {
      const p = JSON.parse(debounced) as { cleaned: Audience; allBranches: boolean };
      return (await api.post('/campaigns/audience/preview', { audience: p.cleaned, ...(p.allBranches ? { allBranches: true } : {}) }))?.data;
    },
  });

  const create = useMutation({
    mutationFn: async (sendMode: 'draft' | 'now' | 'schedule') => {
      const res = await api.post('/campaigns', {
        name,
        channel,
        ...(mode === 'template' ? { templateId } : { messageBody }),
        audience: cleaned,
        ...(allBranches ? { allBranches } : {}),
      });
      const id = res.data.id as string;
      if (sendMode === 'now') await api.post(`/campaigns/${id}/send`, {});
      if (sendMode === 'schedule') await api.post(`/campaigns/${id}/send`, { scheduledAt: new Date(scheduleAt).toISOString() });
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['comm'] });
      onDone(id);
    },
  });

  const content = mode === 'template' ? (templates.data?.items ?? []).find((t: any) => t.id === templateId)?.templateContent ?? '' : messageBody;
  const valid = name.trim() && (mode === 'template' ? !!templateId : !!messageBody.trim());
  const addTag = (t: string) => {
    const v = t.trim();
    if (v && !(audience.tags ?? []).includes(v)) setAudience({ ...audience, tags: [...(audience.tags ?? []), v] });
    setTagInput('');
  };

  return (
    <Panel className="space-y-4">
      <h3 className="font-semibold text-gray-100">New campaign</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-400">
          Name
          <input className={inputCls} value={name} maxLength={150} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diabetes check-up reminder" />
        </label>
        <label className="text-xs text-gray-400">
          Channel
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as any)}>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </label>
      </div>

      <div>
        <div className="mb-2 flex gap-2 text-xs">
          {(['text', 'template'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-3 py-1 ${mode === m ? 'bg-[#1FA971] text-white' : 'border border-gray-700 text-gray-300'}`}>
              {m === 'text' ? 'Write message' : 'Use template'}
            </button>
          ))}
        </div>
        {mode === 'template' ? (
          <select className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Select a template</option>
            {(templates.data?.items ?? [])
              .filter((t: any) => t.isActive)
              .map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.channel})
                </option>
              ))}
          </select>
        ) : (
          <textarea className={`${inputCls} min-h-[90px]`} maxLength={1600} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Hi {{firstName}}, …" />
        )}
        {content && <p className="mt-2 rounded-lg bg-[#1FA971]/15 px-3 py-2 text-sm text-gray-100">{renderLocal(content)}</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-800 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-200">
          <Users size={14} /> Audience
        </p>
        <div>
          <p className="mb-1 text-xs text-gray-400">Patient tags (any of)</p>
          <div className="flex flex-wrap gap-1">
            {(audience.tags ?? []).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-200">
                {t}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => setAudience({ ...audience, tags: (audience.tags ?? []).filter((x) => x !== t) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            <input
              className={inputCls}
              list="comm-tag-options"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="Add tag"
            />
            <datalist id="comm-tag-options">
              {tagOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <Btn type="button" variant="ghost" onClick={() => addTag(tagInput)}>
              Add
            </Btn>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs text-gray-400">
            Gender
            <select className={inputCls} value={audience.gender ?? ''} onChange={(e) => setAudience({ ...audience, gender: e.target.value || undefined })}>
              <option value="">Any</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Min age
            <input type="number" min={0} max={130} className={inputCls} value={audience.ageMin ?? ''} onChange={(e) => setAudience({ ...audience, ageMin: num(e.target.value) })} />
          </label>
          <label className="text-xs text-gray-400">
            Max age
            <input type="number" min={0} max={130} className={inputCls} value={audience.ageMax ?? ''} onChange={(e) => setAudience({ ...audience, ageMax: num(e.target.value) })} />
          </label>
          <label className="text-xs text-gray-400">
            Last visit more than (days ago)
            <input type="number" min={1} className={inputCls} value={audience.lastVisitBeforeDays ?? ''} onChange={(e) => setAudience({ ...audience, lastVisitBeforeDays: num(e.target.value) || undefined })} />
          </label>
          <label className="text-xs text-gray-400">
            Visited within (days)
            <input type="number" min={1} className={inputCls} value={audience.lastVisitAfterDays ?? ''} onChange={(e) => setAudience({ ...audience, lastVisitAfterDays: num(e.target.value) || undefined })} />
          </label>
          <label className="text-xs text-gray-400">
            Upcoming appointment
            <select
              className={inputCls}
              value={audience.hasUpcomingAppointment === undefined ? '' : String(audience.hasUpcomingAppointment)}
              onChange={(e) => setAudience({ ...audience, hasUpcomingAppointment: e.target.value === '' ? undefined : e.target.value === 'true' })}
            >
              <option value="">Any</option>
              <option value="false">No upcoming appointment</option>
              <option value="true">Has upcoming appointment</option>
            </select>
          </label>
        </div>
        {orgWide && (
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} /> All branches
          </label>
        )}
        <div className="rounded-lg bg-gray-800/60 px-3 py-2 text-sm">
          {preview.isFetching && !preview.data ? (
            <span className="text-gray-400">Counting…</span>
          ) : preview.error ? (
            <ErrorNote error={preview.error} />
          ) : (
            <>
              <span className="font-semibold text-gray-100">{preview.data?.count ?? 0}</span>
              <span className="text-gray-400"> patients will receive this</span>
              {preview.data?.excludedOptedOut ? <span className="text-amber-300"> · {preview.data.excludedOptedOut} excluded (opted out)</span> : null}
              {preview.data?.sample?.length ? (
                <p className="mt-1 text-xs text-gray-500">e.g. {preview.data.sample.map((p: any) => `${p.firstName} ${p.lastName ?? ''}`.trim()).join(', ')}</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ErrorNote error={create.error} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <label className="text-xs text-gray-400">
          Schedule for (optional)
          <input type="datetime-local" className={inputCls} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" disabled={!valid || create.isPending} onClick={() => create.mutate('draft')}>
            Save draft
          </Btn>
          {scheduleAt ? (
            <Btn disabled={!valid || create.isPending} onClick={() => create.mutate('schedule')}>
              Schedule
            </Btn>
          ) : (
            <Btn
              disabled={!valid || create.isPending || !preview.data?.count}
              onClick={() => {
                if (window.confirm(`Send "${name}" to ${preview.data?.count ?? 0} patients now?`)) create.mutate('now');
              }}
            >
              {create.isPending ? 'Working…' : 'Send now'}
            </Btn>
          )}
        </div>
      </div>
    </Panel>
  );
};

const CampaignDetail = ({ id }: { id: string }) => {
  const qc = useQueryClient();
  const can = useCan();
  const detail = useQuery({
    queryKey: ['comm', 'campaign', id],
    queryFn: () => getData<any>(`/campaigns/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'SENDING' ? 4000 : false),
  });
  const act = useMutation({
    mutationFn: (action: 'send' | 'cancel' | 'delete') =>
      action === 'delete' ? api.delete(`/campaigns/${id}`) : api.post(`/campaigns/${id}/${action}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comm'] }),
  });

  if (detail.isLoading) return <Panel><Loading /></Panel>;
  if (detail.error) return <Panel><ErrorNote error={detail.error} /></Panel>;
  const c = detail.data;
  if (!c) return null;
  const audience = c.audience && Object.keys(c.audience).length ? c.audience : null;

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{c.name}</h3>
          <p className="text-xs text-gray-400">
            {c.channel} · created {fmtDateTime(c.createdAt)} {c.branchId ? '' : '· all branches'}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Accepted by provider', c.sentCount],
          ['Not delivered', c.failedCount],
          ['Started', fmtDateTime(c.startedAt)],
          [c.status === 'SCHEDULED' ? 'Scheduled for' : 'Finished', fmtDateTime(c.status === 'SCHEDULED' ? c.scheduledAt : c.endedAt)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg bg-gray-800/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{k}</p>
            <p className="mt-1 text-sm font-semibold text-gray-100">{v}</p>
          </div>
        ))}
      </div>
      {c.deliveryBreakdown?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {c.deliveryBreakdown.map((b: any) => (
            <span key={b.deliveryStatus} className="flex items-center gap-1 text-xs text-gray-300">
              <StatusBadge status={b.deliveryStatus} /> {b.count}
            </span>
          ))}
        </div>
      )}
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Message</p>
        <p className="whitespace-pre-wrap rounded-lg bg-gray-800/60 px-3 py-2 text-sm text-gray-200">{c.template?.templateContent ?? c.messageBody}</p>
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Audience</p>
        <p className="text-sm text-gray-300">{audience ? JSON.stringify(audience) : 'All opted-in patients'}</p>
      </div>
      <ErrorNote error={act.error} />
      {can('campaigns.manage') && (
        <div className="flex flex-wrap gap-2">
          {['DRAFT', 'SCHEDULED'].includes(c.status) && (
            <Btn disabled={act.isPending} onClick={() => window.confirm('Send this campaign now?') && act.mutate('send')}>
              Send now
            </Btn>
          )}
          {['DRAFT', 'SCHEDULED', 'SENDING'].includes(c.status) && (
            <Btn variant="danger" disabled={act.isPending} onClick={() => window.confirm('Cancel this campaign?') && act.mutate('cancel')}>
              Cancel campaign
            </Btn>
          )}
          {c.status === 'DRAFT' && (
            <Btn variant="ghost" disabled={act.isPending} onClick={() => window.confirm('Delete this draft?') && act.mutate('delete')}>
              Delete draft
            </Btn>
          )}
        </div>
      )}
    </Panel>
  );
};
