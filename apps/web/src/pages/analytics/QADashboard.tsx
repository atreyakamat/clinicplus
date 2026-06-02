import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { StatCard, Card, PageHeader, Button } from '@clinicplus/ui';
import { Activity, ShieldAlert, Zap, Server, Database, Globe, Bug, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export const QADashboard = () => {
  // In real app, this would fetch from a monitoring endpoint / internal analytics
  const healthData = [
    { time: '09:00', latency: 120, errors: 0 },
    { time: '10:00', latency: 145, errors: 2 },
    { time: '11:00', latency: 180, errors: 5 },
    { time: '12:00', latency: 130, errors: 1 },
    { time: '13:00', latency: 110, errors: 0 },
    { time: '14:00', latency: 155, errors: 3 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="QA & System Integrity Dashboard" 
        description="Monitor system health, error rates, and multi-tenant performance."
      >
        <div className="flex gap-2">
           <Button variant="outline" size="sm" className="text-red-600 border-red-100">Clear Logs</Button>
           <Button className="bg-[#1FA971]" size="sm">Run E2E Suite</Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="API Uptime" value="99.98%" change="Healthy" className="border-green-100" />
        <StatCard label="Error Rate" value="0.04%" change="-0.01% from yesterday" className="border-green-100" />
        <StatCard label="Avg Latency" value="142ms" change="+5ms" />
        <StatCard label="Active Sessions" value="12" change="Across 3 Orgs" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            API Performance & Errors
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={healthData}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip />
                <Area type="monotone" dataKey="latency" stroke="#2563EB" fillOpacity={1} fill="url(#colorLatency)" strokeWidth={2} />
                <Line type="monotone" dataKey="errors" stroke="#EF4444" strokeWidth={2} dot={{r: 4, fill: '#EF4444'}} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ShieldAlert size={18} className="text-orange-500" />
              Security & RBAC Audit
            </h3>
            <div className="space-y-4">
               <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Unauthorized Attempts</span>
                  <span className="font-bold text-slate-900">0</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Cross-Tenant Requests</span>
                  <span className="font-bold text-slate-900">0</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Admin Logins</span>
                  <span className="font-bold text-slate-900">4</span>
               </div>
            </div>
            <div className="mt-6 pt-4 border-t">
               <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Isolation Status</p>
               <div className="flex items-center gap-2 text-xs font-medium text-green-600">
                  <Globe size={14} /> 3 Organizations Isolated
               </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Bug size={18} className="text-red-500" />
              Recent System Logs
            </h3>
            <div className="space-y-3">
               <div className="text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-100 text-slate-600">
                  [INFO] 14:22:01 - Prescription PDF generated (ID: RX-422)
               </div>
               <div className="text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-100 text-slate-600">
                  [WARN] 14:15:33 - Database latency spike (230ms)
               </div>
               <div className="text-[11px] font-mono bg-red-50 p-2 rounded border border-red-100 text-red-600">
                  [ERROR] 14:10:12 - Failed to send WhatsApp (Template ID mismatch)
               </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
