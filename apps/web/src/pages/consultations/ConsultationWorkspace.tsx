import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { Save, CheckCircle, Clock, FileText, Activity, AlertCircle, ArrowLeft } from 'lucide-react';

export const ConsultationWorkspace = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: consultation, isLoading } = useQuery({
    queryKey: ['consultation', id],
    queryFn: () => api.get(`/consultations/${id}`),
  });

  const [formData, setFormData] = useState<any>(null);

  React.useEffect(() => {
    if (consultation) {
      setFormData({
        chiefComplaint: consultation.chiefComplaint || '',
        clinicalAssessment: consultation.clinicalAssessment || '',
        treatmentPlan: consultation.treatmentPlan || '',
        vitals: consultation.vitals?.[0] || {
          height: '', weight: '', temperature: '', pulse: '', 
          bloodPressureSystolic: '', bloodPressureDiastolic: '', spo2: ''
        }
      });
    }
  }, [consultation]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/consultations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', id] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.post(`/consultations/${id}/complete`),
    onSuccess: () => {
      navigate('/queue');
    },
  });

  if (isLoading || !formData) return <div className="p-6 text-center">Loading workspace...</div>;

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleVitalChange = (field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      vitals: { ...prev.vitals, [field]: value === '' ? null : parseFloat(value) || value }
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </Button>
          <PageHeader 
            title={`Consultation: ${consultation.patient.firstName} ${consultation.patient.lastName}`} 
            description={`Visit Date: ${new Date(consultation.consultationDate).toLocaleDateString()}`}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending}>
            <Save size={16} /> {updateMutation.isPending ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button className="gap-2 bg-[#1FA971]" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
            <CheckCircle size={16} /> {completeMutation.isPending ? 'Completing...' : 'Complete & Close'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Patient Vitals & History */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Activity size={16} className="text-[#1FA971]" />
              Vitals
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Weight (kg)</label>
                  <input type="text" className="w-full border rounded p-1.5 text-sm" value={formData.vitals.weight || ''} onChange={(e) => handleVitalChange('weight', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Height (cm)</label>
                  <input type="text" className="w-full border rounded p-1.5 text-sm" value={formData.vitals.height || ''} onChange={(e) => handleVitalChange('height', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Temp (°C)</label>
                  <input type="text" className="w-full border rounded p-1.5 text-sm" value={formData.vitals.temperature || ''} onChange={(e) => handleVitalChange('temperature', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">SpO2 (%)</label>
                  <input type="text" className="w-full border rounded p-1.5 text-sm" value={formData.vitals.spo2 || ''} onChange={(e) => handleVitalChange('spo2', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">BP (Systolic/Diastolic)</label>
                <div className="flex items-center gap-2">
                  <input type="text" className="w-full border rounded p-1.5 text-sm" placeholder="120" value={formData.vitals.bloodPressureSystolic || ''} onChange={(e) => handleVitalChange('bloodPressureSystolic', e.target.value)} />
                  <span>/</span>
                  <input type="text" className="w-full border rounded p-1.5 text-sm" placeholder="80" value={formData.vitals.bloodPressureDiastolic || ''} onChange={(e) => handleVitalChange('bloodPressureDiastolic', e.target.value)} />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              Recent Visits
            </h3>
            <div className="space-y-3">
              <p className="text-xs text-slate-500 text-center py-4">No previous history available.</p>
            </div>
          </Card>
        </div>

        {/* Main: Clinical Notes */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="p-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <AlertCircle size={16} className="text-orange-500" />
                  Chief Complaint
                </h3>
                <textarea 
                  className="w-full min-h-[80px] p-3 rounded-xl border border-slate-200 text-sm focus:ring-1 focus:ring-[#1FA971] outline-none"
                  placeholder="Why is the patient visiting today?"
                  value={formData.chiefComplaint}
                  onChange={(e) => handleInputChange('chiefComplaint', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileText size={16} className="text-[#1FA971]" />
                  Clinical Assessment / Findings
                </h3>
                <textarea 
                  className="w-full min-h-[150px] p-3 rounded-xl border border-slate-200 text-sm focus:ring-1 focus:ring-[#1FA971] outline-none"
                  placeholder="Record your clinical findings, diagnosis, and observations..."
                  value={formData.clinicalAssessment}
                  onChange={(e) => handleInputChange('clinicalAssessment', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <CheckCircle size={16} className="text-blue-500" />
                  Treatment Plan
                </h3>
                <textarea 
                  className="w-full min-h-[120px] p-3 rounded-xl border border-slate-200 text-sm focus:ring-1 focus:ring-[#1FA971] outline-none"
                  placeholder="Outline the treatment plan, follow-up instructions, etc."
                  value={formData.treatmentPlan}
                  onChange={(e) => handleInputChange('treatmentPlan', e.target.value)}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
