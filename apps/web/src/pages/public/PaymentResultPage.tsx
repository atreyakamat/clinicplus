import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

interface PublicStatus {
  status: string;
  amountPaid: string;
  clinicName: string;
}

/** Public page Stripe redirects to after checkout. Shows only status / amount paid / clinic name. */
export const PaymentResultPage = () => {
  const [params] = useSearchParams();
  const result = params.get('status') === 'success' ? 'success' : 'cancelled';
  const invoice = params.get('invoice') ?? '';
  const [startedAt] = useState(() => Date.now());

  const q = useQuery<PublicStatus>({
    queryKey: ['public-payment-status', invoice],
    queryFn: async () => {
      const res = await fetch(`/api/v1/public/payments/status?invoice=${encodeURIComponent(invoice)}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Invoice not found' : 'Could not load payment status');
      return (await res.json()).data;
    },
    enabled: /^[0-9a-f-]{36}$/i.test(invoice),
    // The webhook usually lands within seconds; poll for up to 2 minutes after a successful checkout.
    refetchInterval: (query) =>
      result === 'success' && query.state.data?.status !== 'PAID' && Date.now() - startedAt < 120_000 ? 3000 : false,
  });

  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const paid = q.data?.status === 'PAID';
  const confirming = result === 'success' && !paid && !q.isError;
  const timedOut = confirming && Date.now() - startedAt >= 120_000;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F14] p-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-[#1F2937] p-8 text-center shadow-xl">
        {result === 'cancelled' ? (
          <>
            <XCircle className="mx-auto mb-4 text-amber-400" size={56} />
            <h1 className="text-2xl font-semibold">Payment cancelled</h1>
            <p className="mt-2 text-sm text-gray-400">No money was taken. You can reopen the payment link from your message to try again.</p>
          </>
        ) : paid ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 text-[#1FA971]" size={56} />
            <h1 className="text-2xl font-semibold">Payment received</h1>
            <p className="mt-2 text-sm text-gray-400">Thank you{q.data?.clinicName ? ` — ${q.data.clinicName} has received your payment` : ''}.</p>
          </>
        ) : (
          <>
            <Clock className="mx-auto mb-4 animate-pulse text-blue-400" size={56} />
            <h1 className="text-2xl font-semibold">{timedOut ? 'Payment is being processed' : 'Confirming your payment…'}</h1>
            <p className="mt-2 text-sm text-gray-400">
              {timedOut
                ? 'Your payment was submitted. The clinic will see it as soon as the payment provider confirms it.'
                : 'This usually takes a few seconds. You can keep this page open.'}
            </p>
          </>
        )}

        {q.data && (
          <dl className="mt-6 space-y-2 rounded-xl bg-black/20 p-4 text-left text-sm">
            <div className="flex justify-between"><dt className="text-gray-400">Clinic</dt><dd>{q.data.clinicName}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Invoice status</dt><dd>{q.data.status.replace(/_/g, ' ')}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Amount paid</dt><dd>{Number(q.data.amountPaid).toFixed(2)}</dd></div>
          </dl>
        )}
        {q.isError && <p className="mt-4 text-sm text-red-400">{(q.error as Error).message}</p>}
        {!invoice && <p className="mt-4 text-sm text-gray-500">No invoice reference in this link.</p>}
      </div>
    </div>
  );
};
