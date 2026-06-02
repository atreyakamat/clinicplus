import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, FileText, CreditCard, ChevronRight, AlertCircle } from 'lucide-react';
import { Button, PageHeader, Card, Badge } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { Link } from 'react-router-dom';

export const BillingPage = () => {
  const { data: invoices, isLoading, error } = useQuery<any[]>({
    queryKey: ['invoices'],
    queryFn: () => api.get('/invoices'),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-green-50 text-green-700 border-green-200';
      case 'PARTIALLY_PAID': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'UNPAID': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Billing & Invoices" 
        description="Manage patient invoices and payment tracking."
      >
        <Link to="/billing/new">
          <Button className="flex items-center gap-2">
            <Plus size={16} />
            Create Invoice
          </Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Outstanding</p>
            <h4 className="text-2xl font-bold text-slate-900">$4,520.00</h4>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-600 rounded-xl">
            <CreditCard size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Revenue (MTD)</p>
            <h4 className="text-2xl font-bold text-slate-900">$12,840.00</h4>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Invoices (MTD)</p>
            <h4 className="text-2xl font-bold text-slate-900">84</h4>
          </div>
        </Card>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-semibold text-slate-900">Recent Invoices</h3>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Filter invoices..." className="w-full pl-9 pr-4 h-9 rounded-lg border border-slate-200 text-sm outline-none" />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading invoices...</div>
        ) : !invoices?.length ? (
          <div className="p-12 text-center text-slate-500">No invoices found.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Invoice #</th>
                <th className="px-6 py-4">Patient</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{invoice.invoiceNumber}</td>
                  <td className="px-6 py-4">{invoice.patient.firstName} {invoice.patient.lastName}</td>
                  <td className="px-6 py-4 font-semibold">${parseFloat(invoice.total).toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusColor(invoice.status)}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{new Date(invoice.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/billing/${invoice.id}`}>
                      <Button variant="outline" size="sm" className="gap-1">
                        View <ChevronRight size={14} />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
