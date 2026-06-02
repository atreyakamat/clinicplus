import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Phone, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { Button, PageHeader, Card } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const FollowUpsPage = () => {
  const queryClient = useQueryClient();
  const { data: followUps, isLoading } = useQuery<any[]>({
    queryKey: ['follow-ups'],
    queryFn: () => api.get('/follow-ups'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => 
      api.patch(`/follow-ups/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-ups'] }),
  });

  if (isLoading) return <div className="p-6">Loading follow-ups...</div>;

  const pendingFollowUps = followUps?.filter(f => f.status === 'PENDING' || !f.status) || [];
  const completedFollowUps = followUps?.filter(f => f.status === 'COMPLETED') || [];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Follow-Up Management" 
        description="Track patient recovery and scheduled check-ins."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Clock size={16} className="text-orange-500" />
            Pending Follow-ups ({pendingFollowUps.length})
          </h2>
          
          <div className="space-y-3">
            {pendingFollowUps.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed text-slate-400">
                No pending follow-ups.
              </div>
            ) : (
              pendingFollowUps.map((fu) => (
                <Card key={fu.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                      <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 font-bold">
                        {fu.patient.firstName[0]}{fu.patient.lastName[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{fu.patient.firstName} {fu.patient.lastName}</h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(fu.scheduledDate).toLocaleDateString()}</span>
                          <span className="flex items-center gap-1"><Phone size={12} /> {fu.patient.phone}</span>
                        </div>
                        {fu.notes && <p className="mt-2 text-sm text-slate-600 italic">"{fu.notes}"</p>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" className="bg-[#1FA971] h-8 text-xs px-3" onClick={() => updateStatusMutation.mutate({ id: fu.id, status: 'COMPLETED' })}>
                        Complete
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-xs px-3 text-red-500 border-red-100" onClick={() => updateStatusMutation.mutate({ id: fu.id, status: 'CANCELLED' })}>
                        Skip
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#1FA971]" />
            Recent Outcomes
          </h2>
          
          <div className="space-y-3">
            {completedFollowUps.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed text-slate-400">
                No completed follow-ups yet.
              </div>
            ) : (
              completedFollowUps.map((fu) => (
                <div key={fu.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                   <div className="flex items-center gap-3">
                     <CheckCircle2 size={18} className="text-[#1FA971]" />
                     <div>
                       <p className="text-sm font-bold text-slate-900">{fu.patient.firstName} {fu.patient.lastName}</p>
                       <p className="text-xs text-slate-500">Recovered • {new Date(fu.updatedAt).toLocaleDateString()}</p>
                     </div>
                   </div>
                   <span className="text-xs font-medium text-slate-400">Dr. {fu.doctor.lastName}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
