import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, User, ArrowRight, CheckCircle2, Play, PhoneOutgoing } from 'lucide-react';
import { Button, PageHeader, Card, Badge } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

interface QueueEntry {
  id: string;
  tokenNumber: number;
  status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  checkInTime: string;
  appointment: {
    patient: {
      firstName: string;
      lastName: string;
    };
    doctor: {
      firstName: string;
      lastName: string;
    };
  };
}

interface Queue {
  id: string;
  name: string;
  entries: QueueEntry[];
}

export const QueuePage = () => {
  const queryClient = useQueryClient();

  const { data: queue, isLoading, error } = useQuery<Queue>({
    queryKey: ['queue'],
    queryFn: () => api.get('/queues/live'),
    refetchInterval: 10000, // Refresh every 10 seconds for live updates
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      api.patch(`/queues/entries/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });

  if (isLoading) return <div className="p-6">Loading queue...</div>;

  const entries = queue?.entries || [];
  const activeEntry = entries.find(e => e.status === 'CALLED' || e.status === 'IN_PROGRESS');
  const waitingEntries = entries.filter(e => e.status === 'WAITING');

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Live Queue" 
        description="Monitor and manage patient flow in real-time."
      >
        <div className="flex gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
          <Clock size={16} className="text-[#1FA971]" />
          Avg. wait time: <span className="font-semibold text-slate-900">12 mins</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Currently Calling / In Progress */}
        <div className="lg:col-span-1 space-y-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Current Serving</h2>
          {activeEntry ? (
            <Card className="p-6 border-2 border-[#1FA971] bg-green-50/30">
              <div className="flex flex-col items-center text-center">
                <span className="text-xs font-bold text-[#1FA971] bg-[#1FA971]/10 px-3 py-1 rounded-full mb-4">
                  TOKEN #{activeEntry.tokenNumber}
                </span>
                <h3 className="text-2xl font-bold text-slate-900 mb-1">
                  {activeEntry.appointment.patient.firstName} {activeEntry.appointment.patient.lastName}
                </h3>
                <p className="text-slate-500 mb-6 flex items-center gap-1">
                  <User size={14} /> Dr. {activeEntry.appointment.doctor.lastName}
                </p>
                
                <div className="grid grid-cols-2 gap-3 w-full">
                  <Button 
                    className="w-full gap-2" 
                    onClick={() => updateStatusMutation.mutate({ id: activeEntry.id, status: 'IN_PROGRESS' })}
                    disabled={activeEntry.status === 'IN_PROGRESS' || updateStatusMutation.isPending}
                  >
                    <Play size={16} /> Start
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 text-green-700 border-green-200 hover:bg-green-50"
                    onClick={() => updateStatusMutation.mutate({ id: activeEntry.id, status: 'COMPLETED' })}
                  >
                    <CheckCircle2 size={16} /> Finish
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center border-dashed flex flex-col items-center">
              <Clock className="text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">No active patient</p>
              {waitingEntries.length > 0 && (
                <Button 
                  className="mt-4" 
                  onClick={() => updateStatusMutation.mutate({ id: waitingEntries[0].id, status: 'CALLED' })}
                >
                  Call Next Patient
                </Button>
              )}
            </Card>
          )}
        </div>

        {/* Waiting List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Waiting ({waitingEntries.length})</h2>
          </div>
          
          <div className="space-y-3">
            {waitingEntries.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500">
                No patients waiting in queue.
              </div>
            ) : (
              waitingEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                      <span className="text-xs text-slate-400 font-medium">TOKEN</span>
                      <span className="text-lg font-bold text-slate-900">{entry.tokenNumber}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">
                        {entry.appointment.patient.firstName} {entry.appointment.patient.lastName}
                      </h4>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <User size={12} /> Dr. {entry.appointment.doctor.lastName} • Checked in {new Date(entry.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'CALLED' })}
                    >
                      <PhoneOutgoing size={14} /> Call
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-500 border-red-100 hover:bg-red-50"
                      onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'CANCELLED' })}
                    >
                      Skip
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
