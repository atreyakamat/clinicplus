import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { Button, Card, PageHeader } from '@clinicplus/ui';
import { Printer, ArrowLeft, Plus, CreditCard, CheckCircle, Download, Clock } from 'lucide-react';

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
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #printable-area, #printable-area * { visibility: visible; }
          #printable-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}} />
      
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </Button>
          <h1 className="text-2xl font-bold">Invoice Details</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handlePrint}>
            <Printer size={16} /> Print Invoice
          </Button>
          {balance > 0 && (
            <Button className="gap-2 bg-[#2563EB]" onClick={() => paymentMutation.mutate({ amount: balance, paymentMethod: 'CASH', paymentStatus: 'PAID', paidAt: new Date().toISOString() })} disabled={paymentMutation.isPending}>
              <CreditCard size={16} /> {paymentMutation.isPending ? 'Processing...' : 'Record Full Payment'}
            </Button>
          )}
          {balance === 0 && (
            <div className="flex items-center gap-2 text-green-600 font-bold px-4 py-2 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle size={16} /> Fully Paid
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card id="printable-area" className="p-8 space-y-8 border-none shadow-none lg:border lg:shadow-sm">
            {/* Invoice Header */}
            <div className="flex justify-between items-start">
               <div>
                 <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-[#1FA971] rounded-lg flex items-center justify-center text-white font-bold">C</div>
                    <h2 className="text-2xl font-bold text-[#1FA971]">ClinicOS</h2>
                 </div>
                 <p className="text-sm text-slate-500">123 Health Ave, Medical Center</p>
                 <p className="text-sm text-slate-500">Contact: +1 234 567 890</p>
               </div>
               <div className="text-right">
                 <h3 className="font-black uppercase text-slate-900 text-xl tracking-tight mb-1">INVOICE</h3>
                 <p className="font-bold text-slate-700">#{invoice.invoiceNumber}</p>
                 <p className="text-sm text-slate-500">Date: {new Date(invoice.createdAt).toLocaleDateString()}</p>
                 <div className={`mt-2 inline-block px-2 py-1 rounded text-xs font-bold ${invoice.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {invoice.status}
                 </div>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-100">
               <div>
                 <h3 className="font-bold uppercase text-slate-400 text-xs tracking-widest mb-2">Invoice To</h3>
                 <p className="font-bold text-slate-900 text-lg">{invoice.patient.firstName} {invoice.patient.lastName}</p>
                 <p className="text-sm text-slate-500">{invoice.patient.phone}</p>
                 <p className="text-sm text-slate-500">{invoice.patient.email}</p>
               </div>
               <div className="text-right">
                 <h3 className="font-bold uppercase text-slate-400 text-xs tracking-widest mb-2">Doctor</h3>
                 <p className="font-bold text-slate-900">Dr. {invoice.doctor?.firstName || 'Staff'} {invoice.doctor?.lastName || ''}</p>
                 <p className="text-sm text-slate-500">Consultation ID: {invoice.consultationId?.slice(0,8) || 'N/A'}</p>
               </div>
            </div>

            <table className="w-full text-left mt-8">
              <thead>
                <tr className="border-b-2 border-slate-200 text-xs font-bold text-slate-900 uppercase tracking-widest">
                  <th className="py-4">Service Description</th>
                  <th className="py-4 text-center">Qty</th>
                  <th className="py-4 text-right">Price</th>
                  <th className="py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item: any) => (
                  <tr key={item.id}>
                    <td className="py-4">
                      <p className="font-medium text-slate-900">{item.itemName}</p>
                    </td>
                    <td className="py-4 text-center">{item.quantity}</td>
                    <td className="py-4 text-right">${parseFloat(item.unitPrice).toFixed(2)}</td>
                    <td className="py-4 text-right font-semibold">${parseFloat(item.amount).toFixed(2)}</td>
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
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax</span>
                  <span className="font-medium text-slate-900">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold pt-3 border-t-2 border-slate-900">
                  <span className="text-slate-900">Grand Total</span>
                  <span className="text-[#1FA971]">${total.toFixed(2)}</span>
                </div>
                {paid > 0 && (
                   <div className="flex justify-between text-sm font-medium pt-2 text-green-600">
                    <span>Amount Paid</span>
                    <span>-${paid.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-100">
                  <span className="text-slate-900">Balance Due</span>
                  <span className={balance > 0 ? 'text-red-600' : 'text-slate-400'}>${balance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="pt-12 mt-12 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400">Thank you for choosing ClinicOS. This is a computer generated invoice.</p>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6 no-print">
          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-blue-500" />
              Payment Summary
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100">
                <span className="text-sm text-slate-600">Total Paid</span>
                <span className="font-bold text-green-700">${paid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100">
                <span className="text-sm text-slate-600">Remaining</span>
                <span className="font-bold text-red-700">${balance.toFixed(2)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock size={18} className="text-slate-400" />
              Payment History
            </h3>
            <div className="space-y-4">
              {invoice.payments.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No payments recorded yet.</p>
              ) : (
                invoice.payments.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 rounded-lg transition-colors">
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

          <Button variant="outline" className="w-full gap-2 border-dashed border-slate-300 text-slate-500 hover:text-[#1FA971] hover:border-[#1FA971] hover:bg-[#1FA971]/5">
            <Download size={16} /> Download PDF (Future)
          </Button>
        </div>
      </div>
    </div>
  );
};
