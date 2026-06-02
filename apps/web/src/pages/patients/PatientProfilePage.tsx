import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { Button, PageHeader, Card } from '@clinicplus/ui';
import { ArrowLeft, Edit2, Trash2, Phone, Mail, User as UserIcon, Droplet, Activity } from 'lucide-react';

export const PatientProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: patient, isLoading, error } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/patients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      navigate('/patients');
    },
  });

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this patient?')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading profile...</div>;
  }

  if (error || !patient) {
    return <div className="p-6 text-red-500">Failed to load patient profile.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/patients" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft size={20} />
          </Link>
          <PageHeader 
            title={`${patient.firstName} ${patient.lastName}`} 
            description={`Patient ID: ${patient.patientCode || patient.id.split('-')[0]}`}
          />
        </div>
        <div className="flex gap-2">
          <Link to={`/patients/${id}/edit`}>
            <Button variant="outline" className="gap-2">
              <Edit2 size={16} /> Edit
            </Button>
          </Link>
          <Button variant="outline" className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={handleDelete} disabled={deleteMutation.isPending}>
            <Trash2 size={16} /> {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1 space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="h-24 w-24 rounded-full bg-[#1FA971]/10 flex items-center justify-center text-[#1FA971] text-3xl font-semibold mb-4">
              {patient.firstName[0]}{patient.lastName[0]}
            </div>
            <h2 className="text-xl font-semibold text-slate-900">{patient.firstName} {patient.lastName}</h2>
            <p className="text-slate-500">{patient.patientCode || 'No ID assigned'}</p>
          </div>

          <div className="space-y-4 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3 text-sm">
              <Phone size={16} className="text-slate-400" />
              <span className="text-slate-700">{patient.phone || 'No phone provided'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail size={16} className="text-slate-400" />
              <span className="text-slate-700">{patient.email || 'No email provided'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <UserIcon size={16} className="text-slate-400" />
              <span className="text-slate-700">{patient.gender || 'Gender not specified'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Droplet size={16} className="text-red-400" />
              <span className="text-slate-700">{patient.bloodGroup || 'Blood group unknown'}</span>
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Activity size={20} className="text-[#1FA971]" />
              Recent Activity
            </h3>
            <div className="text-center py-12 text-slate-500">
              No recent activity recorded for this patient.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
