import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import { Btn, Empty, ErrorNote, Loading, Panel, TEMPLATE_VARIABLES, getData, inputCls, renderLocal } from './shared';

const PURPOSES = [
  'APPOINTMENT_CONFIRMATION',
  'APPOINTMENT_REMINDER_24H',
  'APPOINTMENT_REMINDER_2H',
  'APPOINTMENT_CANCELLED',
  'FOLLOW_UP_REMINDER',
  'REVIEW_REQUEST',
  'PAYMENT_LINK',
  'CAMPAIGN',
  'CUSTOM',
];

const purposeLabel = (p?: string | null) => (p ? p.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Custom');

interface Draft {
  id?: string;
  name: string;
  channel: 'SMS' | 'WHATSAPP';
  content: string;
  purpose: string;
  isActive: boolean;
  externalTemplateId: string;
}

const emptyDraft: Draft = { name: '', channel: 'SMS', content: '', purpose: 'CUSTOM', isActive: true, externalTemplateId: '' };

export const Templates = () => {
  const qc = useQueryClient();
  const can = useCan();
  const canManage = can('templates.manage');
  const [draft, setDraft] = useState<Draft | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const list = useQuery({ queryKey: ['comm', 'templates'], queryFn: () => getData<any>('/templates') });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const payload = {
        name: d.name,
        channel: d.channel,
        content: d.content,
        purpose: d.purpose,
        isActive: d.isActive,
        externalTemplateId: d.channel === 'WHATSAPP' && d.externalTemplateId ? d.externalTemplateId : null,
      };
      return d.id ? api.patch(`/templates/${d.id}`, payload) : api.post('/templates', payload);
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['comm', 'templates'] });
      const t = res?.data;
      if (t) setDraft(toDraft(t));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['comm', 'templates'] });
    },
  });

  const toDraft = (t: any): Draft => ({
    id: t.id,
    name: t.name,
    channel: t.channel,
    content: t.templateContent,
    purpose: t.purpose ?? 'CUSTOM',
    isActive: t.isActive,
    externalTemplateId: t.externalTemplateId ?? '',
  });

  const insertVar = (v: string) => {
    if (!draft) return;
    const el = textRef.current;
    const token = `{{${v}}}`;
    if (!el) return setDraft({ ...draft, content: draft.content + token });
    const start = el.selectionStart ?? draft.content.length;
    const end = el.selectionEnd ?? start;
    const content = draft.content.slice(0, start) + token + draft.content.slice(end);
    setDraft({ ...draft, content });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  if (list.isLoading) return <Loading label="Loading templates…" />;
  if (list.error) return <ErrorNote error={list.error} />;
  const items: any[] = list.data?.items ?? [];
  const preview = draft ? renderLocal(draft.content) : '';
  const unknown = draft ? [...draft.content.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]).filter((v) => !TEMPLATE_VARIABLES.includes(v)) : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Panel className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-100">Templates</h3>
          {canManage && (
            <Btn variant="ghost" onClick={() => setDraft({ ...emptyDraft })}>
              <Plus size={14} /> New
            </Btn>
          )}
        </div>
        {!items.length ? (
          <Empty>No templates.</Empty>
        ) : (
          <ul className="space-y-1">
            {items.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setDraft(toDraft(t))}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${draft?.id === t.id ? 'bg-[#1FA971]/15' : 'hover:bg-gray-800'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-100">{t.name}</span>
                    <span className="shrink-0 text-[10px] text-gray-400">{t.channel}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {purposeLabel(t.purpose)}
                    {!t.isActive && <span className="ml-2 text-amber-300">inactive</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Automations use the active template for each purpose (appointment confirmation, reminders, follow-ups…). If none is active, a built-in default is used.
        </p>
      </Panel>

      <Panel className="lg:col-span-3">
        {!draft ? (
          <Empty>Select a template to view{canManage ? ' or edit' : ''} it.</Empty>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft);
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-gray-400">
                Name
                <input className={inputCls} value={draft.name} disabled={!canManage} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
              </label>
              <label className="text-xs text-gray-400">
                Purpose
                <select className={inputCls} value={draft.purpose} disabled={!canManage} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}>
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {purposeLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-400">
                Channel
                <select className={inputCls} value={draft.channel} disabled={!canManage} onChange={(e) => setDraft({ ...draft, channel: e.target.value as Draft['channel'] })}>
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </label>
              <label className="flex items-end gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={draft.isActive} disabled={!canManage} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                Active
              </label>
            </div>
            {draft.channel === 'WHATSAPP' && (
              <label className="block text-xs text-gray-400">
                Twilio Content SID (approved WhatsApp template, optional)
                <input
                  className={inputCls}
                  placeholder="HX…"
                  value={draft.externalTemplateId}
                  disabled={!canManage}
                  onChange={(e) => setDraft({ ...draft, externalTemplateId: e.target.value.trim() })}
                />
                <span className="mt-1 block text-[11px] text-gray-500">
                  WhatsApp only allows free-form text within 24h of the patient's last message. For reminders, register an approved template in Twilio whose {'{{1}}, {{2}}…'} match the variables below in order.
                </span>
              </label>
            )}
            <label className="block text-xs text-gray-400">
              Message
              <textarea
                ref={textRef}
                className={`${inputCls} min-h-[120px]`}
                maxLength={1600}
                value={draft.content}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                required
              />
            </label>
            {canManage && (
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => insertVar(v)}
                    className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:border-[#1FA971] hover:text-[#1FA971]"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            )}
            {unknown.length > 0 && <p className="text-xs text-red-300">Unknown variable(s): {unknown.join(', ')}</p>}
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Live preview (sample patient)</p>
              <div className="rounded-xl bg-[#1FA971]/15 px-3 py-2 text-sm text-gray-100 whitespace-pre-wrap">{preview || '—'}</div>
              <p className="mt-1 text-[11px] text-gray-500">
                {preview.length} characters · {Math.max(1, Math.ceil(preview.length / 160))} SMS segment(s)
              </p>
            </div>
            <ErrorNote error={save.error || remove.error} />
            {canManage && (
              <div className="flex flex-wrap justify-between gap-2">
                {draft.id ? (
                  <Btn
                    type="button"
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete template "${draft.name}"?`)) remove.mutate(draft.id!);
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </Btn>
                ) : (
                  <span />
                )}
                <Btn type="submit" disabled={save.isPending || unknown.length > 0}>
                  {save.isPending ? 'Saving…' : draft.id ? 'Save changes' : 'Create template'}
                </Btn>
              </div>
            )}
            {save.isSuccess && !save.isPending && <p className="text-xs text-emerald-300">Saved.</p>}
          </form>
        )}
      </Panel>
    </div>
  );
};
