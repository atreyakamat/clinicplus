import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { Printer, ArrowLeft, Plus, CreditCard } from 'lucide-react';

export const InvoiceDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`),
  });

  const paymentMutation = useMutation({
    mutationFn: (data: any) => api.post(`/invoices/${id}/payments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    }
  });

  if (isLoading) return <div className="p-6">Loading invoice...</div>;
  if (!invoice) return <div className="p-6">Invoice not found.</div>;

  const subtotal = parseFloat(invoice.subtotal);
  const discount = parseFloat(invoice.discount);
  const tax = parseFloat(invoice.tax);
  const total = parseFloat(invoice.total);
  const paid = invoice.payments.reduce((acc: number, p: any) => acc + parseFloat(p.amount), 0);
  const balance = total - paid;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </Button>
          <h1 className="text-2xl font-bold">Invoice #{invoice.invoiceNumber}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </Button>
          {balance > 0 && (
            <Button className="gap-2 bg-[#2563EB]" onClick={() => paymentMutation.mutate({ amount: balance, method: 'CASH', status: 'COMPLETED' })}>
              <CreditCard size={16} /> Mark as Paid
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="p-8 space-y-8">
            <div className="flex justify-between items-start">
               <div>
                 <h2 className="text-2xl font-bold text-[#1FA971]">ClinicOS</h2>
                 <p className="text-sm text-slate-500">123 Health Ave, Medical Center</p>
               </div>
               <div className="text-right">
                 <h3 className="font-bold uppercase text-slate-400 text-xs tracking-widest">Invoice To</h3>
                 <p className="font-bold text-slate-900">{invoice.patient.firstName} {invoice.patient.lastName}</p>
                 <p className="text-sm text-slate-500">{invoice.patient.phone}</p>
               </div>
            </div>

            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <th className="py-4">Service Description</th>
                  <th className="py-4 text-center">Qty</th>
                  <th className="py-4 text-right">Price</th>
                  <th className="py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {invoice.items.map((item: any) => (
                  <tr key={item.id}>
                    <td className="py-4">
                      <p className="font-medium text-slate-900">{item.description}</p>
                    </td>
                    <td className="py-4 text-center">{item.quantity}</td>
                    <td className="py-4 text-right">${parseFloat(item.unitPrice).toFixed(2)}</td>
                    <td className="py-4 text-right font-semibold">${(item.quantity * parseFloat(item.unitPrice)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-6 border-t border-slate-100">
              <div className="w-64 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-900">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Discount</span>
                  <span className="font-medium text-red-500">-${discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-3 border-t border-slate-100">
                  <span className="text-slate-900">Total</span>
                  <span className="text-[#1FA971]">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4">Payment Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-500">Amount Paid</span>
                <span className="font-bold text-green-600">${paid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="text-sm text-slate-500">Balance Due</span>
                <span className="font-bold text-red-600">${balance.toFixed(2)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4">History</h3>
            <div className="space-y-4">
              {invoice.payments.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No payments recorded yet.</p>
              ) : (
                invoice.payments.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{p.paymentMethod}</p>
                      <p className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="font-bold text-slate-900">${parseFloat(p.amount).toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
