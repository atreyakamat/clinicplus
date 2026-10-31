import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import { portalApi, portalErrorMessage, unwrap } from './portal.api';
import { Card, PageTitle, QueryState, StatusPill, fmtDate, fmtMoney } from './portal.ui';

export function PortalInvoices() {
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['portal', 'invoices'], queryFn: () => portalApi.get('/invoices').then(unwrap) });

  const pay = async (id: string) => {
    setPaying(id);
    setError(null);
    try {
      const res = await portalApi.post(`/invoices/${id}/pay-link`).then(unwrap);
      if (res?.url) window.location.href = res.url;
      else setError('Could not start the payment. Please try again.');
    } catch (err) {
      setError(portalErrorMessage(err));
    } finally {
      setPaying(null);
    }
  };

  return (
    <div>
      <PageTitle title="Invoices" subtitle="View bills and pay online" />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <QueryState isLoading={list.isLoading} error={list.error} isEmpty={!(list.data ?? []).length} emptyText="No invoices yet.">
        <div className="space-y-2">
          {(list.data ?? []).map((inv: any) => {
            const due = Number(inv.balance) > 0;
            return (
              <Card key={inv.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{fmtDate(inv.createdAt)}</p>
                    <div className="mt-1"><StatusPill status={inv.status} /></div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{fmtMoney(inv.total)}</p>
                    {due ? (
                      <p className="text-xs text-amber-600">Due {fmtMoney(inv.balance)}</p>
                    ) : (
                      <p className="text-xs text-emerald-600">Paid</p>
                    )}
                  </div>
                </div>
                {due && (
                  <button
                    onClick={() => pay(inv.id)}
                    disabled={paying === inv.id}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-clinic-green text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
                  >
                    {paying === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Pay online
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </QueryState>
    </div>
  );
}
