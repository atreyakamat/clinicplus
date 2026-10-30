import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { portalApi, portalErrorMessage, unwrap } from './portal.api';
import { Card, PageTitle, QueryState, StatusPill, fmtDate } from './portal.ui';

export function PortalPrescriptions() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['portal', 'prescriptions'], queryFn: () => portalApi.get('/prescriptions').then(unwrap) });

  const download = async (id: string) => {
    setDownloading(id);
    setError(null);
    try {
      await portalApi.download(`/prescriptions/${id}/download`, `prescription-${id.slice(0, 8)}.pdf`);
    } catch (err) {
      setError(portalErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <PageTitle title="Prescriptions" subtitle="Your issued prescriptions and medicines" />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <QueryState isLoading={list.isLoading} error={list.error} isEmpty={!(list.data ?? []).length} emptyText="No prescriptions yet.">
        <div className="space-y-2">
          {(list.data ?? []).map((rx: any) => (
            <Card key={rx.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{fmtDate(rx.issuedAt)}</p>
                  <p className="text-sm text-slate-500">Dr. {rx.doctor?.firstName} {rx.doctor?.lastName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={rx.status} />
                  <button
                    onClick={() => download(rx.id)}
                    disabled={downloading === rx.id}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-50"
                    aria-label="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <ul className="text-sm text-slate-600 space-y-0.5">
                {(rx.items ?? []).map((i: any) => (
                  <li key={i.id}>
                    <span className="font-medium text-slate-800">{i.medicineName}</span>
                    {[i.dosage, i.frequency, i.duration].filter(Boolean).length
                      ? ` — ${[i.dosage, i.frequency, i.duration].filter(Boolean).join(', ')}`
                      : ''}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
