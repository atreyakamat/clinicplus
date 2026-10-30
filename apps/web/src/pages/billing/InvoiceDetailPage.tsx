import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, Copy, CreditCard, Download, Link2, Pencil, Send, Undo2 } from 'lucide-react';
import { Button, Card } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission } from '../../app/components/HasPermission';
import { InvoiceForm } from './InvoiceForm';
import {
  ErrorBox,
  Field,
  Modal,
  StatusBadge,
  errorMessage,
  formatDate,
  formatDateTime,
  formatMoney,
  getData,
  inputCls,
  useBillingConfig,
} from './shared';

const METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'];

export const InvoiceDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  if (id === 'new') return <InvoiceForm />;
  return <InvoiceDetail id={id!} edit={params.get('edit') === '1'} />;
};

const InvoiceDetail = ({ id, edit }: { id: string; edit: boolean }) => {
  const qc = useQueryClient();
  const { currency, onlinePayments } = useBillingConfig();
  const [modal, setModal] = useState<null | 'pay' | 'void' | 'link' | { refund: any }>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const q = useQuery<any>({ queryKey: ['invoice', id], queryFn: () => getData(`/invoices/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['invoice', id] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const send = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/send`),
    onSuccess: () => { refresh(); setNotice('Invoice issued.'); },
    onError: (e) => setActionError(errorMessage(e)),
  });

  if (q.isLoading) return <div className="p-6 text-slate-500">Loading invoice…</div>;
  if (q.error) return <div className="p-6"><ErrorBox message={errorMessage(q.error)} /></div>;
  const inv = q.data;
  if (edit) return <InvoiceForm invoice={inv} />;

  const balance = Number(inv.balance);
  const editable = ['DRAFT', 'SENT', 'OVERDUE'].includes(inv.status) && Number(inv.amountPaid) === 0;
  const payable = inv.status !== 'VOID' && balance > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/billing" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Back to invoices"><ArrowLeft size={18} /></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{inv.invoiceNumber}</h1>
              <StatusBadge status={inv.status} />
            </div>
            <p className="text-sm text-slate-500">Created {formatDate(inv.createdAt)}{inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => api.download(`/invoices/${id}/download`, `invoice-${inv.invoiceNumber}.pdf`).catch((e) => setActionError(errorMessage(e)))}>
            <Download size={14} /> PDF
          </Button>
          {editable && (
            <HasPermission permission="invoices.update">
              <Link to={`/billing/${id}?edit=1`}><Button variant="outline" size="sm" className="gap-1"><Pencil size={14} /> Edit</Button></Link>
            </HasPermission>
          )}
          {inv.status === 'DRAFT' && (
            <HasPermission permission="invoices.update">
              <Button variant="outline" size="sm" className="gap-1" disabled={send.isPending} onClick={() => { setActionError(null); send.mutate(); }}><Send size={14} /> Issue</Button>
            </HasPermission>
          )}
          {payable && onlinePayments && (
            <HasPermission permission="payments.create">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setModal('link')}><Link2 size={14} /> Payment link</Button>
            </HasPermission>
          )}
          {payable && (
            <HasPermission permission="payments.create">
              <Button size="sm" className="gap-1" onClick={() => setModal('pay')}><CreditCard size={14} /> Record payment</Button>
            </HasPermission>
          )}
          {inv.status !== 'VOID' && (
            <HasPermission permission="invoices.update">
              <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => setModal('void')}><Ban size={14} /> Void</Button>
            </HasPermission>
          )}
        </div>
      </div>

      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
      <ErrorBox message={actionError} />
      {inv.status === 'VOID' && <ErrorBox message={`Voided: ${inv.voidReason ?? 'no reason recorded'}`} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-400">Bill to</p>
              <Link to={`/patients/${inv.patient?.id}`} className="font-medium text-slate-900 hover:underline">{inv.patient?.firstName} {inv.patient?.lastName}</Link>
              <p className="text-sm text-slate-500">{[inv.patient?.patientCode, inv.patient?.phone].filter(Boolean).join(' · ')}</p>
            </div>
            {inv.appointment?.doctor && (
              <div className="text-right">
                <p className="text-xs font-medium uppercase text-slate-400">Doctor</p>
                <p className="text-sm">Dr. {inv.appointment.doctor.firstName} {inv.appointment.doctor.lastName}</p>
                <p className="text-xs text-slate-500">{formatDateTime(inv.appointment.scheduledStart)}</p>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inv.items.map((it: any) => (
                  <tr key={it.id}>
                    <td className="py-2">{it.itemName}{it.serviceId && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">catalog</span>}</td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">{formatMoney(it.unitPrice, currency)}</td>
                    <td className="py-2 text-right font-medium">{formatMoney(it.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inv.notes && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{inv.notes}</p>}
        </Card>

        <Card className="space-y-2 text-sm">
          <Line label="Subtotal" value={formatMoney(inv.subtotal, currency)} />
          {Number(inv.discount) > 0 && <Line label="Discount" value={`− ${formatMoney(inv.discount, currency)}`} />}
          {Number(inv.tax) > 0 && <Line label="Tax" value={formatMoney(inv.tax, currency)} />}
          <Line label="Total" value={formatMoney(inv.total, currency)} strong />
          <Line label="Paid" value={formatMoney(inv.amountPaid, currency)} />
          {Number(inv.refundedAmount) > 0 && <Line label="Refunded" value={formatMoney(inv.refundedAmount, currency)} />}
          <div className={`flex justify-between rounded-lg px-3 py-2 text-base font-semibold ${balance > 0 && inv.status !== 'VOID' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            <span>Balance</span>
            <span>{formatMoney(inv.balance, currency)}</span>
          </div>
          {inv.paymentLinkUrl && (
            <div className="rounded-lg border border-slate-200 p-3 text-xs">
              <p className="mb-1 font-medium text-slate-700">Active payment link</p>
              <CopyField value={inv.paymentLinkUrl} />
            </div>
          )}
        </Card>
      </div>

      <Card className="space-y-3">
        <h3 className="font-semibold text-slate-900">Payments</h3>
        {!inv.payments.length ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {inv.payments.filter((p: any) => !p.isRefund).map((p: any) => {
              const refunded = (p.refunds ?? []).filter((r: any) => r.status !== 'FAILED').reduce((s: number, r: any) => s + Math.round(Number(r.amount) * 100), 0) / 100;
              const refundable = Number(p.amount) - refunded;
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{formatMoney(p.amount, currency)} · {p.paymentMethod.replace('_', ' ')}</div>
                      <div className="text-xs text-slate-500">
                        {formatDateTime(p.paidAt ?? p.createdAt)}
                        {p.createdBy ? ` · ${p.createdBy.firstName} ${p.createdBy.lastName}` : p.paymentMethod === 'STRIPE' ? ' · online' : ''}
                        {p.transactionReference ? ` · ref ${p.transactionReference}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.paymentStatus} />
                      {refundable > 0 && ['PAID', 'PARTIALLY_REFUNDED'].includes(p.paymentStatus) && (
                        <HasPermission permission="payments.refund">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => setModal({ refund: { ...p, refundable } })}><Undo2 size={14} /> Refund</Button>
                        </HasPermission>
                      )}
                    </div>
                  </div>
                  {(p.refunds ?? []).length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3 text-xs text-slate-600">
                      {p.refunds.map((r: any) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2">
                          Refund {formatMoney(r.amount, currency)} · {formatDateTime(r.processedAt ?? r.createdAt)} · {r.reason}
                          <StatusBadge status={r.status ?? 'COMPLETED'} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {modal === 'pay' && <PaymentModal invoice={inv} currency={currency} onClose={() => setModal(null)} onDone={(msg) => { setModal(null); setNotice(msg); refresh(); }} />}
      {modal === 'void' && <VoidModal invoice={inv} onClose={() => setModal(null)} onDone={() => { setModal(null); setNotice('Invoice voided.'); refresh(); }} />}
      {modal === 'link' && <LinkModal invoice={inv} currency={currency} onClose={() => { setModal(null); refresh(); }} />}
      {modal && typeof modal === 'object' && 'refund' in modal && (
        <RefundModal payment={modal.refund} currency={currency} onClose={() => setModal(null)} onDone={() => { setModal(null); setNotice('Refund recorded.'); refresh(); }} />
      )}
    </div>
  );
};

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between ${strong ? 'border-t border-slate-200 pt-2 font-semibold text-slate-900' : 'text-slate-600'}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const CopyField = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className={`${inputCls} h-8 text-xs`} onFocus={(e) => e.currentTarget.select()} />
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 gap-1"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked: the field is selectable */
          }
        }}
      >
        <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
};

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

const PaymentModal = ({ invoice, currency, onClose, onDone }: { invoice: any; currency: string; onClose: () => void; onDone: (msg: string) => void }) => {
  const [amount, setAmount] = useState(String(Number(invoice.balance)));
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  // one key per modal open: a double click / retry cannot record the payment twice
  const [idempotencyKey] = useState(newKey);
  const m = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${invoice.id}/payments`, {
        amount: Number(amount),
        paymentMethod: method,
        transactionReference: reference || undefined,
        idempotencyKey,
      }),
    onSuccess: () => onDone(`Payment of ${formatMoney(amount, currency)} recorded.`),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal title="Record payment" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Outstanding: <span className="font-semibold text-slate-900">{formatMoney(invoice.balance, currency)}</span></p>
        <Field label="Amount">
          <input type="number" min={0.01} step="0.01" max={Number(invoice.balance)} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {METHODS.map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
          </select>
        </Field>
        <Field label="Reference (optional)" hint="UPI / card transaction id, cheque number…">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={m.isPending || !(Number(amount) > 0)} onClick={() => { setError(null); m.mutate(); }}>{m.isPending ? 'Saving…' : 'Record payment'}</Button>
        </div>
      </div>
    </Modal>
  );
};

const VoidModal = ({ invoice, onClose, onDone }: { invoice: any; onClose: () => void; onDone: () => void }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/void`, { reason }),
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal title={`Void ${invoice.invoiceNumber}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Voiding cannot be undone. Invoices with payments must be fully refunded first.</p>
        <Field label="Reason">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`${inputCls} h-auto py-2`} />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={m.isPending || !reason.trim()} onClick={() => { setError(null); m.mutate(); }}>Void invoice</Button>
        </div>
      </div>
    </Modal>
  );
};

const RefundModal = ({ payment, currency, onClose, onDone }: { payment: any; currency: string; onClose: () => void; onDone: () => void }) => {
  const [amount, setAmount] = useState(String(payment.refundable));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.post(`/payments/${payment.id}/refund`, { amount: Number(amount), reason }),
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal title="Refund payment" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {payment.paymentMethod === 'STRIPE'
            ? 'The refund is sent to the card through Stripe.'
            : `Hand back the money by ${payment.paymentMethod.replace('_', ' ')}; this records the refund.`}{' '}
          Refundable: <span className="font-semibold">{formatMoney(payment.refundable, currency)}</span>
        </p>
        <Field label="Amount">
          <input type="number" min={0.01} step="0.01" max={payment.refundable} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={m.isPending || !reason.trim() || !(Number(amount) > 0)} onClick={() => { setError(null); m.mutate(); }}>{m.isPending ? 'Refunding…' : 'Refund'}</Button>
        </div>
      </div>
    </Modal>
  );
};

const LinkModal = ({ invoice, currency, onClose }: { invoice: any; currency: string; onClose: () => void }) => {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const m = useMutation({
    mutationFn: async (send: boolean) => (await api.post(`/invoices/${invoice.id}/payment-link`, { send })).data,
    onSuccess: (data) => setResult(data),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal title="Online payment link" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          Creates a secure Stripe checkout page for the outstanding {formatMoney(invoice.balance, currency)}. The invoice updates automatically once the patient pays.
        </p>
        {result && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <CopyField value={result.url} />
            <p className="text-xs text-slate-500">
              {result.reused ? 'Existing link reused' : 'New link created'}
              {result.expiresAt ? ` · expires ${formatDateTime(result.expiresAt)}` : ''}
            </p>
            {result.sent && <p className="text-xs font-medium text-emerald-700">Sent to the patient by message.</p>}
            {result.sendError && <p className="text-xs text-amber-700">Not sent: {result.sendError}</p>}
          </div>
        )}
        <ErrorBox message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={m.isPending} onClick={() => { setError(null); m.mutate(false); }}>
            <Link2 size={14} className="mr-1" /> {result ? 'Refresh link' : 'Create link'}
          </Button>
          <HasPermission permission="messages.send">
            <Button disabled={m.isPending} onClick={() => { setError(null); m.mutate(true); }}>
              <Send size={14} className="mr-1" /> Create & text to patient
            </Button>
          </HasPermission>
        </div>
      </div>
    </Modal>
  );
};
