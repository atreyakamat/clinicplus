import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Edit2, ChevronRight } from 'lucide-react';
import { Button, Input, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { Link } from 'react-router-dom';

interface Patient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: string;
  bloodGroup?: string;
  createdAt: string;
}

export const PatientsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: patients, isLoading, error } = useQuery<Patient[]>({
    queryKey: ['patients'],
    queryFn: () => api.get('/patients'),
  });

  const filteredPatients = patients?.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Patients" 
        description="Manage your clinic's patient records and history."
      >
        <Link to="/patients/new">
          <Button className="flex items-center gap-2">
            <Plus size={16} />
            New Patient
          </Button>
        </Link>
      </PageHeader>

      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search patients by name, email, or phone..."
            className="w-full pl-10 pr-4 h-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#1FA971] focus:ring-1 focus:ring-[#1FA971]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-500 bg-red-50 rounded-xl">
          Failed to load patients. Please try again.
        </div>
      ) : !filteredPatients?.length ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-medium text-slate-900 mb-2">No patients found</h3>
          <p className="text-slate-500 mb-6">Get started by creating your first patient record.</p>
          <Link to="/patients/new">
            <Button>Create Patient</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Patient Info</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Details</th>
                <th className="px-6 py-4">Added</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.map((patient) => (
                <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#1FA971]/10 flex items-center justify-center text-[#1FA971] font-semibold">
                        {patient.firstName[0]}{patient.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{patient.firstName} {patient.lastName}</p>
                        <p className="text-xs text-slate-500">ID: {patient.patientCode || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-slate-900">{patient.phone || 'N/A'}</p>
                    <p className="text-xs text-slate-500">{patient.email || 'N/A'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {patient.gender && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                          {patient.gender}
                        </span>
                      )}
                      {patient.bloodGroup && (
                        <span className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs">
                          {patient.bloodGroup}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(patient.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/patients/${patient.id}`}>
                      <Button variant="outline" size="sm" className="gap-1">
                        View
                        <ChevronRight size={14} />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
