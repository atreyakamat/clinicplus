import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { Button, PageHeader, Card, Tabs, TabsList, TabsTrigger, TabsContent, Badge } from '@clinicplus/ui';
import { 
  ArrowLeft, Edit2, Trash2, Phone, Mail, 
  User as UserIcon, Droplet, Activity, 
  Clock, Calendar, Stethoscope, FileText, CreditCard 
} from 'lucide-react';

export const PatientProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('timeline');

  const { data: patient, isLoading, error } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`),
  });

  const { data: timeline } = useQuery<any[]>({
    queryKey: ['patient-timeline', id],
    queryFn: () => api.get(`/timeline?patientId=${id}`),
    enabled: !!id,
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

  if (isLoading) return <div className="p-12 text-center text-slate-500">Loading patient profile...</div>;
  if (error || !patient) return <div className="p-12 text-center text-red-500">Failed to load profile.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/patients" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft size={20} />
          </Link>
          <PageHeader 
            title={`${patient.firstName} ${patient.lastName}`} 
            description={`Patient ID: ${patient.patientCode}`}
          />
        </div>
        <div className="flex gap-2">
          <Link to={`/patients/${id}/edit`}>
            <Button variant="outline" className="gap-2">
              <Edit2 size={16} /> Edit Profile
            </Button>
          </Link>
          <Button variant="outline" className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={handleDelete}>
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Sticky Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-full bg-[#1FA971]/10 flex items-center justify-center text-[#1FA971] text-3xl font-bold mb-4">
                {patient.firstName[0]}{patient.lastName[0]}
              </div>
              <h2 className="text-xl font-bold text-slate-900">{patient.firstName} {patient.lastName}</h2>
              <div className="flex gap-2 mt-2">
                 <Badge variant="outline" className="bg-green-50 text-green-700 border-green-100">Active</Badge>
                 {patient.bloodGroup && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-100">{patient.bloodGroup}</Badge>}
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-3 text-sm">
                <Phone size={16} className="text-slate-400" />
                <span className="text-slate-700 font-medium">{patient.phone || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail size={16} className="text-slate-400" />
                <span className="text-slate-700 font-medium truncate" title={patient.email}>{patient.email || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <UserIcon size={16} className="text-slate-400" />
                <span className="text-slate-700 font-medium">{patient.gender || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={16} className="text-slate-400" />
                <span className="text-slate-700 font-medium">{patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>

            <div className="pt-6 border-t space-y-3">
              <Link to={`/appointments/new?patientId=${patient.id}`} className="block">
               <Button className="w-full justify-start gap-2 bg-[#1FA971]">
                  <Calendar size={16} /> Book Appointment
               </Button>
              </Link>
               <Button variant="outline" className="w-full justify-start gap-2" disabled>
                  <Stethoscope size={16} /> Start Consultation
               </Button>
            </div>
          </Card>

          <Card className="p-5">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Medical Summary</h3>
             <div className="space-y-3">
                <div className="flex justify-between text-sm">
                   <span className="text-slate-500">Last Visit</span>
                   <span className="font-bold text-slate-900">12 Days Ago</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span className="text-slate-500">Total Visits</span>
                   <span className="font-bold text-slate-900">{patient.consultations?.length || 0}</span>
                </div>
             </div>
          </Card>
        </div>

        {/* Right Content: Tabs */}
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-white border-b rounded-none p-0 h-auto w-full justify-start overflow-x-auto no-scrollbar">
              <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1FA971] data-[state=active]:bg-transparent px-6 py-4">Timeline</TabsTrigger>
              <TabsTrigger value="appointments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1FA971] data-[state=active]:bg-transparent px-6 py-4">Appointments</TabsTrigger>
              <TabsTrigger value="consultations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1FA971] data-[state=active]:bg-transparent px-6 py-4">Consultations</TabsTrigger>
              <TabsTrigger value="prescriptions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1FA971] data-[state=active]:bg-transparent px-6 py-4">Prescriptions</TabsTrigger>
              <TabsTrigger value="billing" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1FA971] data-[state=active]:bg-transparent px-6 py-4">Billing</TabsTrigger>
              <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1FA971] data-[state=active]:bg-transparent px-6 py-4">Documents</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="timeline">
                <Card className="p-6">
                   <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                      {!timeline?.length ? (
                        <div className="text-center py-12 text-slate-400">No activity history.</div>
                      ) : (
                        timeline.map((event) => (
                          <div key={event.id} className="relative pl-10">
                             <div className={`absolute left-0 top-1 h-8 w-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${
                               event.eventCategory === 'PATIENT' ? 'bg-blue-500' :
                               event.eventCategory === 'CLINICAL' ? 'bg-[#1FA971]' :
                               'bg-slate-400'
                             }`}>
                                <Activity size={14} className="text-white" />
                             </div>
                             <div>
                                <div className="flex justify-between items-start">
                                   <h4 className="font-bold text-slate-900 text-sm">{event.title}</h4>
                                   <span className="text-[10px] text-slate-400 font-medium">{new Date(event.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-sm text-slate-600 mt-1">{event.description}</p>
                             </div>
                          </div>
                        ))
                      )}
                   </div>
                </Card>
              </TabsContent>

              <TabsContent value="appointments">
                <Card className="p-0 overflow-hidden">
                   <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 border-b">
                         <tr>
                            <th className="px-6 py-4">Date & Time</th>
                            <th className="px-6 py-4">Doctor</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Action</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y">
                         {patient.appointments?.map((appt: any) => (
                           <tr key={appt.id} className="hover:bg-slate-50">
                              <td className="px-6 py-4 font-medium">{new Date(appt.scheduledStart).toLocaleString()}</td>
                              <td className="px-6 py-4">Dr. {appt.doctor?.lastName}</td>
                              <td className="px-6 py-4"><Badge>{appt.status}</Badge></td>
                              <td className="px-6 py-4 text-right"><Button variant="ghost" size="sm">View</Button></td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </Card>
              </TabsContent>

              <TabsContent value="consultations">
                 <div className="space-y-4">
                    {patient.consultations?.map((cons: any) => (
                      <Card key={cons.id} className="p-6 hover:shadow-md transition-shadow">
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <h4 className="font-bold text-slate-900">{new Date(cons.consultationDate).toLocaleDateString()}</h4>
                               <p className="text-xs text-slate-500">Dr. {cons.doctor?.lastName}</p>
                            </div>
                            <Button variant="outline" size="sm">View Record</Button>
                         </div>
                         <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
                            <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Chief Complaint</p>
                               <p className="text-sm text-slate-700">{cons.chiefComplaint}</p>
                            </div>
                            <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Diagnoses</p>
                               <div className="flex gap-1 flex-wrap">
                                  {cons.diagnoses?.map((d: any) => <Badge key={d.id} variant="default">{d.diagnosisName}</Badge>)}
                               </div>
                            </div>
                         </div>
                      </Card>
                    ))}
                 </div>
              </TabsContent>

              <TabsContent value="prescriptions">
                <Card className="p-0 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b">
                      <tr>
                        <th className="px-6 py-4">Issued</th>
                        <th className="px-6 py-4">Doctor</th>
                        <th className="px-6 py-4">Medications</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {!patient.prescriptions?.length ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-slate-400">No prescriptions found.</td>
                        </tr>
                      ) : patient.prescriptions.map((prescription: any) => (
                        <tr key={prescription.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4">{new Date(prescription.issuedAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4">Dr. {prescription.doctor?.lastName}</td>
                          <td className="px-6 py-4">{prescription.items?.length || 0} items</td>
                          <td className="px-6 py-4 text-right">
                            <Link to={`/prescriptions/${prescription.id}`}>
                              <Button variant="ghost" size="sm">Open</Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>

              <TabsContent value="billing">
                <Card className="p-0 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b">
                      <tr>
                        <th className="px-6 py-4">Invoice</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Total</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {!patient.invoices?.length ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-slate-400">No billing history.</td>
                        </tr>
                      ) : patient.invoices.map((invoice: any) => (
                        <tr key={invoice.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4">{invoice.invoiceNumber}</td>
                          <td className="px-6 py-4"><Badge>{invoice.status}</Badge></td>
                          <td className="px-6 py-4">${Number(invoice.total ?? 0).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right">
                            <Link to={`/billing/${invoice.id}`}>
                              <Button variant="ghost" size="sm">Open</Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>

              <TabsContent value="documents">
                <Card className="p-0 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b">
                      <tr>
                        <th className="px-6 py-4">Document</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Uploaded</th>
                        <th className="px-6 py-4 text-right">File</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {!patient.documents?.length ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-slate-400">No documents uploaded.</td>
                        </tr>
                      ) : patient.documents.map((document: any) => (
                        <tr key={document.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4">{document.title}</td>
                          <td className="px-6 py-4">{document.documentType}</td>
                          <td className="px-6 py-4">{new Date(document.createdAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-right">
                            <a href={document.fileUrl} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="sm">Open</Button>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
