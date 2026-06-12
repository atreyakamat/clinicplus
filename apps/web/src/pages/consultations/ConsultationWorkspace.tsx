import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { Save, CheckCircle, Clock, FileText, Activity, AlertCircle, ArrowLeft, Plus, Trash2, Pill } from 'lucide-react';

export const ConsultationWorkspace = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: consultation, isLoading } = useQuery({
    queryKey: ['consultation', id],
    queryFn: () => api.get(`/consultations/${id}`),
  });

  const { data: lastConsultation } = useQuery({
    queryKey: ['last-consultation', consultation?.patientId],
    queryFn: () => api.get(`/consultations?patientId=${consultation?.patientId}&limit=1&excludeId=${id}`),
    enabled: !!consultation?.patientId,
  });

  const lastVisit = lastConsultation?.[0];

  const [formData, setFormData] = useState<any>(null);

  React.useEffect(() => {
    if (consultation && !formData) {
      setFormData({
        chiefComplaint: consultation.chiefComplaint || '',
        clinicalAssessment: consultation.clinicalAssessment || '',
        treatmentPlan: consultation.treatmentPlan || '',
        vitals: consultation.vitals?.[0] || {
          height: '', weight: '', temperature: '', pulse: '', 
          bloodPressureSystolic: '', bloodPressureDiastolic: '', spo2: ''
        },
        diagnoses: consultation.diagnoses || []
      });
    }
  }, [consultation, formData]);

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

  const addDiagnosis = () => {
    setFormData((prev: any) => ({
      ...prev,
      diagnoses: [...prev.diagnoses, { diagnosisName: '', icdCode: '', severity: 'NORMAL' }]
    }));
  };

  const removeDiagnosis = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      diagnoses: prev.diagnoses.filter((_: any, i: number) => i !== index)
    }));
  };

  const handleDiagnosisChange = (index: number, field: string, value: string) => {
    const newDiagnoses = [...formData.diagnoses];
    newDiagnoses[index] = { ...newDiagnoses[index], [field]: value };
    setFormData((prev: any) => ({ ...prev, diagnoses: newDiagnoses }));
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
              Last Visit Summary
            </h3>
            <div className="space-y-3">
              {lastVisit ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Chief Complaint</p>
                    <p className="text-xs text-slate-700 line-clamp-3">{lastVisit.chiefComplaint}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Diagnoses</p>
                    <div className="flex flex-wrap gap-1">
                      {lastVisit.diagnoses?.map((d: any) => (
                        <span key={d.id} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md font-medium">{d.diagnosisName}</span>
                      ))}
                    </div>
                  </div>
                  <Link to={`/consultations/${lastVisit.id}`} target="_blank" className="block text-center text-xs text-[#1FA971] font-medium hover:underline">
                    View Full History
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">No previous history available.</p>
              )}
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

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Activity size={16} className="text-red-500" />
                    Diagnoses
                  </h3>
                  <Button variant="outline" size="sm" onClick={addDiagnosis} className="gap-1 h-8">
                    <Plus size={14} /> Add Diagnosis
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {formData.diagnoses.map((diag: any, index: number) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 relative group">
                      <div className="md:col-span-3">
                        <Input 
                          placeholder="ICD Code" 
                          value={diag.icdCode} 
                          onChange={(e) => handleDiagnosisChange(index, 'icdCode', e.target.value)} 
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="md:col-span-6">
                        <Input 
                          placeholder="Diagnosis Name" 
                          value={diag.diagnosisName} 
                          onChange={(e) => handleDiagnosisChange(index, 'diagnosisName', e.target.value)} 
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <select 
                          className="w-full h-9 rounded-lg border border-slate-200 text-sm outline-none px-2"
                          value={diag.severity}
                          onChange={(e) => handleDiagnosisChange(index, 'severity', e.target.value)}
                        >
                          <option value="NORMAL">Normal</option>
                          <option value="MILD">Mild</option>
                          <option value="MODERATE">Moderate</option>
                          <option value="SEVERE">Severe</option>
                          <option value="CHRONIC">Chronic</option>
                        </select>
                      </div>
                      <div className="md:col-span-1 flex items-center justify-center">
                        <button onClick={() => removeDiagnosis(index)} className="text-slate-400 hover:text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {formData.diagnoses.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-2">No diagnoses added yet.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileText size={16} className="text-[#1FA971]" />
                  Clinical Assessment / Findings
                </h3>
                <textarea 
                  className="w-full min-h-[150px] p-3 rounded-xl border border-slate-200 text-sm focus:ring-1 focus:ring-[#1FA971] outline-none"
                  placeholder="Record your clinical findings, observations..."
                  value={formData.clinicalAssessment}
                  onChange={(e) => handleInputChange('clinicalAssessment', e.target.value)}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Pill size={16} className="text-purple-500" />
                    Prescriptions
                  </h3>
                  <Link to={`/prescriptions/new?patientId=${consultation.patientId}&consultationId=${consultation.id}`}>
                    <Button variant="outline" size="sm" className="gap-1 h-8">
                      <Plus size={14} /> Add Prescription
                    </Button>
                  </Link>
                </div>
                
                <div className="space-y-2">
                  {consultation.prescriptions?.length > 0 ? (
                    consultation.prescriptions.map((p: any) => (
                      <Card key={p.id} className="p-3 bg-slate-50 border-slate-100 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-slate-900">Prescription #{p.id.slice(0,8)}</p>
                          <p className="text-xs text-slate-500">{p.items.length} items • {new Date(p.issuedAt).toLocaleDateString()}</p>
                        </div>
                        <Link to={`/prescriptions/${p.id}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </Link>
                      </Card>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic text-center py-2">No prescriptions generated for this consultation.</p>
                  )}
                </div>
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
