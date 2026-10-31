import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import { ErrorBox, Field, errorMessage, formatMoney, getData, inputCls, useBillingConfig } from './shared';

interface Line {
  key: string;
  serviceId: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
}

interface CatalogService {
  id: string;
  name: string;
  price: string;
  description?: string | null;
}

let lineSeq = 0;
const blankLine = (): Line => ({ key: `l${++lineSeq}`, serviceId: '', itemName: '', quantity: '1', unitPrice: '' });

/** Integer cents arithmetic for the on-screen preview (the API recomputes with Decimal). */
const cents = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const InvoiceForm = ({ invoice }: { invoice?: any }) => {
  const editing = !!invoice;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();
  const [params] = useSearchParams();
  const { currency } = useBillingConfig();

  const [patient, setPatient] = useState<any>(invoice?.patient ?? null);
  const [patientQuery, setPatientQuery] = useState('');
  const [lines, setLines] = useState<Line[]>(
    invoice?.items?.length
      ? invoice.items.map((i: any) => ({
          key: `l${++lineSeq}`,
          serviceId: i.serviceId ?? '',
          itemName: i.itemName,
          quantity: String(i.quantity),
          unitPrice: String(Number(i.unitPrice)),
        }))
      : [blankLine()],
  );
  const [discount, setDiscount] = useState(invoice ? String(Number(invoice.discount)) : '');
  const [tax, setTax] = useState(invoice ? String(Number(invoice.tax)) : '');
  const [dueDate, setDueDate] = useState(invoice?.dueDate ? String(invoice.dueDate).slice(0, 10) : '');
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const appointmentId = invoice?.appointmentId ?? params.get('appointmentId') ?? undefined;

  // prefill patient from ?patientId=
  const prefillId = !editing ? params.get('patientId') : null;
  const prefill = useQuery<any>({
    queryKey: ['patient', prefillId],
    queryFn: () => getData(`/patients/${prefillId}`),
    enabled: !!prefillId && !patient,
  });
  useEffect(() => {
    if (prefill.data && !patient) setPatient(prefill.data);
  }, [prefill.data, patient]);

  const catalog = useQuery<CatalogService[]>({
    queryKey: ['invoice-catalog'],
    queryFn: () => getData('/invoices/catalog'),
    enabled: can('invoices.create'),
    staleTime: 5 * 60_000,
  });

  const patientSearch = useQuery<any[]>({
    queryKey: ['patient-picker', patientQuery],
    queryFn: () => getData(`/patients?q=${encodeURIComponent(patientQuery)}&limit=8`),
    enabled: !editing && !patient && patientQuery.trim().length >= 2,
  });

  const preview = useMemo(() => {
    const sub = lines.reduce((s, l) => s + cents(l.unitPrice) * (parseInt(l.quantity, 10) || 0), 0);
    const total = sub - cents(discount) + cents(tax);
    return { sub: sub / 100, total: total / 100 };
  }, [lines, discount, tax]);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickService = (key: string, serviceId: string) => {
    const svc = catalog.data?.find((s) => s.id === serviceId);
    setLine(key, svc ? { serviceId, itemName: svc.name, unitPrice: String(Number(svc.price)) } : { serviceId: '' });
  };

  const save = useMutation({
    mutationFn: async (issue: boolean) => {
      const items = lines
        .filter((l) => l.itemName.trim() || l.serviceId)
        .map((l) => ({
          ...(l.serviceId ? { serviceId: l.serviceId } : {}),
          itemName: l.itemName.trim() || undefined,
          quantity: parseInt(l.quantity, 10) || 1,
          ...(l.unitPrice !== '' ? { unitPrice: Number(l.unitPrice) } : {}),
        }));
      if (!items.length) throw new Error('Add at least one line item');
      const body: any = {
        items,
        discount: discount === '' ? 0 : Number(discount),
        tax: tax === '' ? 0 : Number(tax),
        notes,
        ...(dueDate ? { dueDate: new Date(`${dueDate}T23:59:59`).toISOString() } : editing ? { dueDate: null } : {}),
      };
      if (editing) return (await api.patch(`/invoices/${invoice.id}`, body)).data;
      if (!patient) throw new Error('Select a patient');
      return (await api.post('/invoices', { ...body, patientId: patient.id, appointmentId, issue })).data;
    },
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', inv.id] });
      navigate(`/billing/${inv.id}`, { replace: editing });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={editing ? `Edit ${invoice.invoiceNumber}` : 'New invoice'}
        description={editing ? 'Only draft or unpaid invoices can be edited. Totals are recalculated on save.' : 'Pick services from the catalog or add custom lines.'}
      />

      <Card className="space-y-4">
        <h3 className="font-semibold text-slate-900">Patient</h3>
        {patient ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <div className="font-medium">{patient.firstName} {patient.lastName}</div>
              <div className="text-xs text-slate-500">{[patient.patientCode, patient.phone].filter(Boolean).join(' · ')}</div>
            </div>
            {!editing && <button className="text-sm font-medium text-[#1FA971]" onClick={() => setPatient(null)}>Change</button>}
          </div>
        ) : (
          <div className="relative">
            <input autoFocus value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder="Search by name, phone or patient code" className={inputCls} />
            {patientSearch.data && patientQuery.trim().length >= 2 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {!patientSearch.data.length && <li className="px-3 py-2 text-sm text-slate-500">No patients found</li>}
                {patientSearch.data.map((p) => (
                  <li key={p.id}>
                    <button className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setPatient(p)}>
                      <span className="font-medium">{p.firstName} {p.lastName}</span>
                      <span className="ml-2 text-xs text-slate-500">{[p.patientCode, p.phone].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {appointmentId && <p className="text-xs text-slate-500">Linked to an appointment (revenue is attributed to its doctor).</p>}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Items</h3>
          {catalog.isError && <span className="text-xs text-amber-600">Service catalog unavailable — enter items manually.</span>}
        </div>
        <div className="space-y-3">
          {lines.map((l, idx) => (
            <div key={l.key} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-100 p-3 sm:border-0 sm:p-0">
              <div className="col-span-12 sm:col-span-4">
                <select value={l.serviceId} onChange={(e) => pickService(l.key, e.target.value)} className={inputCls} aria-label={`Service for line ${idx + 1}`}>
                  <option value="">Custom item…</option>
                  {catalog.data?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {formatMoney(s.price, currency)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-3">
                <input value={l.itemName} onChange={(e) => setLine(l.key, { itemName: e.target.value })} placeholder="Description" className={inputCls} aria-label={`Description for line ${idx + 1}`} />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <input type="number" min={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className={inputCls} aria-label="Quantity" />
              </div>
              <div className="col-span-5 sm:col-span-2">
                <input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} placeholder="Price" className={inputCls} aria-label="Unit price" />
              </div>
              <div className="col-span-3 flex items-center justify-end text-sm font-medium sm:col-span-1">
                {formatMoney((cents(l.unitPrice) * (parseInt(l.quantity, 10) || 0)) / 100, currency)}
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <button onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setLines((ls) => [...ls, blankLine()])}>
          <Plus size={14} /> Add line
        </Button>

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Discount (amount)">
                <input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Tax (amount)">
                <input type="number" min={0} step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} h-auto py-2`} />
            </Field>
          </div>
          <div className="space-y-1 self-end rounded-lg bg-slate-50 p-4 text-sm">
            <Row label="Subtotal" value={formatMoney(preview.sub, currency)} />
            {discount && <Row label="Discount" value={`− ${formatMoney(discount, currency)}`} />}
            {tax && <Row label="Tax" value={formatMoney(tax, currency)} />}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatMoney(preview.total, currency)}</span>
            </div>
          </div>
        </div>
      </Card>

      <ErrorBox message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        {editing ? (
          <Button disabled={save.isPending} onClick={() => { setError(null); save.mutate(false); }}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        ) : (
          <>
            <Button variant="outline" disabled={save.isPending} onClick={() => { setError(null); save.mutate(false); }}>Save draft</Button>
            <Button disabled={save.isPending} onClick={() => { setError(null); save.mutate(true); }}>
              {save.isPending ? 'Saving…' : 'Create & issue'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-slate-600">
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
