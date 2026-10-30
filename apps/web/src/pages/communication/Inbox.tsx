import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquarePlus, Search, Send } from 'lucide-react';
import { api } from '../../app/lib/api';
import { HasPermission } from '../../app/components/HasPermission';
import { Btn, Empty, ErrorNote, Loading, Panel, StatusBadge, fmtDateTime, getData, getPage, inputCls, patientName } from './shared';

type Channel = '' | 'SMS' | 'WHATSAPP';

export const Inbox = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const convs = useQuery({
    queryKey: ['comm', 'conversations', search],
    queryFn: () => getPage(`/messages/conversations?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    refetchInterval: 20_000,
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel className={`lg:col-span-1 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className={`${inputCls} pl-8`} placeholder="Search patient or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <HasPermission permission="messages.send">
            <Btn variant="ghost" onClick={() => setComposeOpen(true)} title="New message" aria-label="New message">
              <MessageSquarePlus size={16} />
            </Btn>
          </HasPermission>
        </div>
        {convs.isLoading ? (
          <Loading label="Loading conversations…" />
        ) : convs.error ? (
          <ErrorNote error={convs.error} />
        ) : !convs.data?.items.length ? (
          <Empty>No conversations yet. Messages you send and patient replies appear here.</Empty>
        ) : (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {convs.data.items.map((c: any) => (
              <li key={c.patient?.id ?? c.lastMessage?.id}>
                <button
                  onClick={() => setSelected(c.patient?.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selected === c.patient?.id ? 'bg-[#1FA971]/15' : 'hover:bg-gray-800'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-100">{patientName(c.patient)}</span>
                    <span className="shrink-0 text-[11px] text-gray-500">{fmtDateTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {c.awaitingReply && <span className="h-2 w-2 shrink-0 rounded-full bg-[#1FA971]" title="Patient replied" />}
                    <span className="truncate text-xs text-gray-400">
                      {c.lastMessage?.direction === 'INBOUND' ? '↩ ' : ''}
                      {c.lastMessage?.messageBody}
                    </span>
                  </div>
                  {c.patient?.communicationOptIn === false && <span className="mt-1 inline-block text-[10px] text-amber-300">Opted out (STOP)</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className={`lg:col-span-2 ${selected ? '' : 'hidden lg:block'}`}>
        {selected ? (
          <Thread patientId={selected} onBack={() => setSelected(null)} />
        ) : (
          <Panel>
            <Empty>Select a conversation to view the thread.</Empty>
          </Panel>
        )}
      </div>

      {composeOpen && (
        <Compose
          onClose={() => setComposeOpen(false)}
          onSent={(pid) => {
            setComposeOpen(false);
            setSelected(pid);
            qc.invalidateQueries({ queryKey: ['comm'] });
          }}
        />
      )}
    </div>
  );
};

const Thread = ({ patientId, onBack }: { patientId: string; onBack: () => void }) => {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<Channel>('');
  const endRef = useRef<HTMLDivElement>(null);
  const thread = useQuery({
    queryKey: ['comm', 'thread', patientId],
    queryFn: () => getData<any>(`/messages/conversations/${patientId}`),
    refetchInterval: 15_000,
  });
  const reply = useMutation({
    mutationFn: () => api.post(`/messages/conversations/${patientId}/reply`, { body, ...(channel ? { channel } : {}) }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['comm'] });
    },
  });
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [thread.data?.messages?.length]);

  if (thread.isLoading) return <Panel><Loading label="Loading thread…" /></Panel>;
  if (thread.error) return <Panel><ErrorNote error={thread.error} /></Panel>;
  const p = thread.data?.patient;
  const optedOut = p?.communicationOptIn === false;

  return (
    <Panel className="flex h-[70vh] flex-col">
      <div className="mb-3 flex items-center gap-3 border-b border-gray-800 pb-3">
        <button className="lg:hidden text-gray-400" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-100">{patientName(p)}</p>
          <p className="text-xs text-gray-400">
            {p?.phone ?? 'No phone'} {p?.preferredChannel ? `· prefers ${p.preferredChannel}` : ''}
          </p>
        </div>
        {optedOut && <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Opted out — replied STOP</span>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {!thread.data?.messages?.length && <Empty>No messages yet.</Empty>}
        {thread.data?.messages?.map((m: any) => (
          <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.direction === 'OUTBOUND' ? 'bg-[#1FA971]/20 text-gray-100' : 'bg-gray-800 text-gray-100'}`}>
              <p className="whitespace-pre-wrap break-words">{m.messageBody}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                <span>{m.channel}</span>
                <span>{fmtDateTime(m.createdAt)}</span>
                {m.direction === 'OUTBOUND' && <StatusBadge status={m.deliveryStatus} />}
              </div>
              {m.errorMessage && m.deliveryStatus !== 'NOT_SENT_CONSOLE' && <p className="mt-1 text-[11px] text-red-300">{m.errorMessage}</p>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <HasPermission permission="messages.send">
        <form
          className="mt-3 space-y-2 border-t border-gray-800 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) reply.mutate();
          }}
        >
          <ErrorNote error={reply.error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className={`${inputCls} sm:w-36`} value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="Channel">
              <option value="">Auto channel</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
            </select>
            <textarea
              className={`${inputCls} min-h-[42px] flex-1`}
              rows={1}
              maxLength={1600}
              placeholder={optedOut ? 'Patient opted out — they must reply START first' : 'Type a reply…'}
              disabled={optedOut}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Btn type="submit" disabled={!body.trim() || reply.isPending || optedOut}>
              <Send size={14} /> {reply.isPending ? 'Sending…' : 'Send'}
            </Btn>
          </div>
        </form>
      </HasPermission>
    </Panel>
  );
};

export const Compose = ({ onClose, onSent }: { onClose: () => void; onSent: (patientId: string) => void }) => {
  const [term, setTerm] = useState('');
  const [patient, setPatient] = useState<any>(null);
  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<Channel>('');
  const results = useQuery({
    queryKey: ['comm', 'patient-search', term],
    queryFn: () => getData<any[]>(`/patients/search?q=${encodeURIComponent(term)}`),
    enabled: term.trim().length >= 2 && !patient,
  });
  const templates = useQuery({ queryKey: ['comm', 'templates'], queryFn: () => getData<any>('/templates') });
  const activeTemplates = useMemo(() => (templates.data?.items ?? []).filter((t: any) => t.isActive), [templates.data]);
  const send = useMutation({
    mutationFn: () =>
      api.post('/messages/send', { patientId: patient.id, ...(templateId ? { templateId } : { body }), ...(channel ? { channel } : {}) }),
    onSuccess: () => onSent(patient.id),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-3 rounded-xl border border-gray-800 bg-[#111827] p-5">
        <h3 className="text-lg font-semibold text-gray-100">New message</h3>
        {patient ? (
          <div className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm">
            <span>
              {patientName(patient)} <span className="text-gray-400">{patient.phone}</span>
            </span>
            <button className="text-xs text-gray-400 hover:text-gray-200" onClick={() => setPatient(null)}>
              Change
            </button>
          </div>
        ) : (
          <div>
            <input className={inputCls} placeholder="Search patient by name or phone" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
            {results.data && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-800">
                {results.data.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No patients found</li>}
                {results.data.map((p: any) => (
                  <li key={p.id}>
                    <button className="w-full px-3 py-2 text-left text-sm hover:bg-gray-800" onClick={() => setPatient(p)}>
                      {patientName(p)} <span className="text-gray-400">{p.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Template">
            <option value="">Free text</option>
            {activeTemplates.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="Channel">
            <option value="">Auto channel</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
          </select>
        </div>
        {templateId ? (
          <p className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {activeTemplates.find((t: any) => t.id === templateId)?.templateContent}
            <span className="mt-1 block text-[11px] text-gray-500">Variables are filled with the patient's details when sent.</span>
          </p>
        ) : (
          <textarea className={inputCls} rows={4} maxLength={1600} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
        )}
        <ErrorNote error={send.error} />
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn disabled={!patient || (!templateId && !body.trim()) || send.isPending} onClick={() => send.mutate()}>
            <Send size={14} /> {send.isPending ? 'Sending…' : 'Send'}
          </Btn>
        </div>
      </div>
    </div>
  );
};
