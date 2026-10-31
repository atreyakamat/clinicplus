import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useCan } from '../../app/components/HasPermission';
import { getData } from './shared';
import { Inbox } from './Inbox';
import { Templates } from './Templates';
import { Campaigns } from './Campaigns';
import { DeliveryLog } from './DeliveryLog';
import { Automations } from './Automations';

const TABS = [
  { key: 'inbox', label: 'Inbox', perm: 'messages.view' },
  { key: 'templates', label: 'Templates', perm: 'messages.view' },
  { key: 'campaigns', label: 'Campaigns', perm: 'campaigns.view' },
  { key: 'log', label: 'Delivery log', perm: 'messages.view' },
  { key: 'automations', label: 'Automations', perm: 'messages.view' },
] as const;

export const CommunicationPage = () => {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => can(t.perm));
  const active = tabs.find((t) => t.key === params.get('tab'))?.key ?? tabs[0]?.key;

  const provider = useQuery({
    queryKey: ['comm', 'provider-status'],
    queryFn: () => getData<any>('/messages/provider-status'),
    enabled: can('messages.view'),
    staleTime: 60_000,
  });

  if (!tabs.length) {
    return (
      <div className="p-6 text-sm text-gray-400">You do not have access to patient communication.</div>
    );
  }

  const p = provider.data;
  return (
    <div className="space-y-5 text-gray-100">
      <div>
        <h1 className="text-2xl font-semibold">Patient Communication</h1>
        <p className="mt-1 text-sm text-gray-400">WhatsApp and SMS conversations, templates, campaigns and automated reminders.</p>
      </div>

      {p && p.driver === 'console' && (
        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200" role="alert">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-semibold">Messaging is not connected — nothing is delivered to patients.</p>
            <p className="mt-1 text-amber-200/80">
              The server runs with MESSAGING_PROVIDER=console: messages are recorded as "Not sent (console)". Ask your administrator to configure Twilio
              (MESSAGING_PROVIDER=twilio, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM, API_PUBLIC_URL).
            </p>
          </div>
        </div>
      )}
      {p && p.driver === 'twilio' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-[#1F2937] px-4 py-3 text-xs text-gray-300">
          <CheckCircle2 size={16} className="text-[#1FA971]" />
          <span>Twilio connected</span>
          <span>SMS: {p.channels?.SMS ? 'on' : 'off'}</span>
          <span>WhatsApp: {p.channels?.WHATSAPP ? 'on' : 'off'}</span>
          {!p.apiPublicUrlConfigured && <span className="text-amber-300">API_PUBLIC_URL not set — delivery receipts and replies will not be received</span>}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-800" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active === t.key ? 'border-[#1FA971] text-[#1FA971]' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'inbox' && <Inbox />}
      {active === 'templates' && <Templates />}
      {active === 'campaigns' && <Campaigns />}
      {active === 'log' && <DeliveryLog />}
      {active === 'automations' && <Automations provider={p} />}
    </div>
  );
};

export default CommunicationPage;
