import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { Button, Card } from '@clinicplus/ui';
import { Printer, ArrowLeft, Download, Mail } from 'lucide-react';

export const PrescriptionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: rx, isLoading } = useQuery({
    queryKey: ['prescription', id],
    queryFn: () => api.get(`/prescriptions/${id}`),
  });

  if (isLoading) return <div className="p-6 text-center">Loading prescription...</div>;
  if (!rx) return <div className="p-6 text-red-500">Prescription not found.</div>;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </Button>
          <h1 className="text-2xl font-bold">View Prescription</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Mail size={16} /> Email to Patient
          </Button>
          <Button className="gap-2 bg-[#1FA971]" onClick={handlePrint}>
            <Printer size={16} /> Print Prescription
          </Button>
        </div>
      </div>

      <Card className="max-w-4xl mx-auto p-0 overflow-hidden print:shadow-none print:border-none shadow-lg">
        {/* Prescription Header */}
        <div className="p-8 bg-[#1FA971] text-white flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold">ClinicOS</h2>
            <p className="opacity-90">Advanced Healthcare Operating System</p>
          </div>
          <div className="text-right">
            <h3 className="font-bold text-lg">Dr. {rx.doctor.firstName} {rx.doctor.lastName}</h3>
            <p className="text-sm opacity-90">Medical Practitioner</p>
            <p className="text-xs mt-2 opacity-75">Reg No: RX-2026-0042</p>
          </div>
        </div>

        <div className="p-10 space-y-10 min-h-[800px]">
          {/* Patient Info */}
          <div className="grid grid-cols-2 gap-8 pb-8 border-b border-slate-100">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Patient Details</p>
              <h4 className="text-xl font-bold text-slate-900">{rx.patient.firstName} {rx.patient.lastName}</h4>
              <p className="text-slate-600 text-sm">{rx.patient.gender} • {new Date().getFullYear() - (rx.patient.dateOfBirth ? new Date(rx.patient.dateOfBirth).getFullYear() : 30)} Years</p>
              <p className="text-slate-600 text-sm mt-1">{rx.patient.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Prescription Info</p>
              <p className="text-slate-900 font-medium">Date: {new Date(rx.issuedAt).toLocaleDateString()}</p>
              <p className="text-slate-500 text-sm">ID: RX-{rx.id.split('-')[0].toUpperCase()}</p>
            </div>
          </div>

          {/* Rx Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <span className="text-4xl font-serif text-[#1FA971] font-bold">℞</span>
               <div className="h-px bg-slate-100 flex-1"></div>
            </div>

            <div className="space-y-8">
              {rx.items.map((item: any, idx: number) => (
                <div key={item.id} className="flex gap-4">
                  <span className="text-slate-300 font-medium">{idx + 1}.</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <h5 className="text-lg font-bold text-slate-900">{item.medicineName}</h5>
                      <span className="text-slate-700 font-medium">{item.duration}</span>
                    </div>
                    <div className="flex gap-6 text-sm text-slate-600">
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">Dosage: {item.dosage}</span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">Freq: {item.frequency}</span>
                    </div>
                    {item.instructions && (
                      <p className="text-sm text-slate-500 italic mt-2 italic">Note: {item.instructions}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Footer */}
          <div className="pt-20 mt-auto flex justify-between items-end">
            <div className="text-xs text-slate-400">
              <p>Clinic Address: 123 Healthcare Way, Medical District</p>
              <p>Contact: +1 (555) 123-4567 • www.clinicos.com</p>
            </div>
            <div className="text-center">
              <div className="h-1 bg-slate-900 w-48 mb-2"></div>
              <p className="text-xs font-bold uppercase">Doctor's Signature</p>
            </div>
          </div>
        </div>
      </Card>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print, .print * { visibility: visible; }
          .no-print { display: none !important; }
          .print { position: absolute; left: 0; top: 0; width: 100%; margin: 0; }
          main { background: white !important; padding: 0 !important; }
        }
      `}} />
    </div>
  );
};
