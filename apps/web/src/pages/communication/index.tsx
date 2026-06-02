import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Search, Clock, Check, MoreVertical } from 'lucide-react';
import { Button, PageHeader, Card, Input } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const CommunicationPage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('WHATSAPP');
  const [messageText, setMessageText] = useState('');

  const { data: messages, isLoading } = useQuery<any[]>({
    queryKey: ['messages'],
    queryFn: () => api.get('/messages'),
  });

  const sendMutation = useMutation({
    mutationFn: (data: { patientId: string, content: string }) => 
      api.post('/messages/whatsapp', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setMessageText('');
    },
  });

  if (isLoading) return <div className="p-6">Loading communication center...</div>;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Communication Center" 
        description="Manage WhatsApp and Email communications with patients."
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-2">
            <button 
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'WHATSAPP' ? 'bg-[#1FA971]/10 text-[#1FA971]' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setActiveTab('WHATSAPP')}
            >
              WhatsApp
            </button>
            <button 
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'EMAIL' ? 'bg-[#1FA971]/10 text-[#1FA971]' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setActiveTab('EMAIL')}
            >
              Email Campaigns
            </button>
            <button 
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'TEMPLATES' ? 'bg-[#1FA971]/10 text-[#1FA971]' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setActiveTab('TEMPLATES')}
            >
              Templates
            </button>
          </Card>

          <Card className="p-4 bg-[#1FA971] text-white">
            <h4 className="font-bold text-sm mb-1">WhatsApp Balance</h4>
            <p className="text-2xl font-bold">1,420</p>
            <p className="text-xs opacity-80 mt-1">Messages remaining</p>
            <Button variant="outline" className="w-full mt-4 bg-white/10 border-white/20 text-white hover:bg-white/20">
              Top Up
            </Button>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <Card className="flex flex-col h-[600px] p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <MessageSquare size={18} className="text-[#1FA971]" />
                Recent Outbound Messages
              </h3>
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input type="text" placeholder="Search logs..." className="w-full pl-9 pr-4 h-8 rounded-lg border border-slate-200 text-xs outline-none" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages?.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <MessageSquare size={48} className="opacity-20 mb-2" />
                  <p>No message history found.</p>
                </div>
              ) : (
                messages?.map((msg) => (
                  <div key={msg.id} className="flex gap-4 p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold shrink-0">
                      {msg.patient.firstName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {msg.patient.firstName} {msg.patient.lastName}
                        </h4>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock size={10} /> {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2">{msg.content}</p>
                      <div className="flex items-center gap-4 mt-2">
                         <span className="text-[10px] font-bold text-[#1FA971] bg-green-50 px-1.5 py-0.5 rounded uppercase">{msg.channel}</span>
                         <span className="text-[10px] text-slate-400 flex items-center gap-1">
                           <Check size={10} className="text-blue-500" /> Delivered
                         </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
              <div className="flex gap-3">
                <input 
                  type="text" 
                  className="flex-1 h-11 px-4 rounded-xl border border-slate-200 text-sm focus:ring-1 focus:ring-[#1FA971] outline-none" 
                  placeholder="Type a message or select a template..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
                <Button className="gap-2" onClick={() => sendMutation.mutate({ patientId: messages?.[0]?.patientId || 'temp', content: messageText })} disabled={!messageText || sendMutation.isPending}>
                  <Send size={16} /> Send
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
