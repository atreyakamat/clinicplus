import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { StatCard, Card, PageHeader, Button } from '@clinicplus/ui';
import { Building2, Users, Activity, BarChart3, ShieldCheck, Globe, Zap, AlertTriangle } from 'lucide-react';

export const PilotAdminPanel = () => {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Founder Control Panel" 
        description="Global overview of all active clinics, system health, and pilot metrics."
      >
        <div className="flex gap-2">
           <Button variant="outline" size="sm">System Logs</Button>
           <Button className="bg-[#2563EB]" size="sm">Global Broadcast</Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Clinics" value="3" change="Pilot Stage" className="border-blue-100" />
        <StatCard label="Total Patients" value="1,242" change="+120 today" />
        <StatCard label="Platform Revenue" value="$4,500.00" change="MTD" />
        <StatCard label="System Uptime" value="100%" change="Operational" className="border-green-100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-0 overflow-hidden">
           <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Building2 size={18} className="text-[#2563EB]" />
                Clinic Performance
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time</span>
           </div>
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-50 text-slate-500 font-medium">
               <tr>
                 <th className="px-6 py-3">Clinic Name</th>
                 <th className="px-6 py-3">Users</th>
                 <th className="px-6 py-3">Activity</th>
                 <th className="px-6 py-3">Health</th>
                 <th className="px-6 py-3 text-right">Status</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {[
                 { name: 'City General Hospital', users: 12, activity: 'High', health: 'Healthy', status: 'LIVE' },
                 { name: 'Metro Dental Care', users: 5, activity: 'Medium', health: 'Healthy', status: 'LIVE' },
                 { name: 'Westside Pediatrics', users: 8, activity: 'Low', health: 'Warning', status: 'ONBOARDING' },
               ].map((clinic, i) => (
                 <tr key={i} className="hover:bg-slate-50">
                   <td className="px-6 py-4 font-bold text-slate-900">{clinic.name}</td>
                   <td className="px-6 py-4">{clinic.users} staff</td>
                   <td className="px-6 py-4">
                     <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600">{clinic.activity}</span>
                   </td>
                   <td className="px-6 py-4">
                     <div className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full ${clinic.health === 'Healthy' ? 'bg-green-500' : 'bg-orange-500'}`} />
                        {clinic.health}
                     </div>
                   </td>
                   <td className="px-6 py-4 text-right">
                      <span className={`text-[10px] font-bold ${clinic.status === 'LIVE' ? 'text-green-600' : 'text-blue-600'}`}>{clinic.status}</span>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        </Card>

        <div className="lg:col-span-1 space-y-6">
           <Card className="p-6">
             <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
               <ShieldCheck size={18} className="text-emerald-500" />
               Global Security
             </h3>
             <div className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center">
                   <span className="text-xs text-slate-600">Failed Logins (24h)</span>
                   <span className="font-bold text-slate-900">0</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center">
                   <span className="text-xs text-slate-600">Data Backups</span>
                   <span className="text-xs font-bold text-green-600">Success</span>
                </div>
             </div>
           </Card>

           <Card className="p-6">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertTriangle size={18} className="text-orange-500" />
                Critical Alerts
              </h3>
              <div className="space-y-3">
                 <div className="text-[11px] p-2 rounded bg-orange-50 border border-orange-100 text-orange-700">
                    Westside Pediatrics reported a branding issue on PDF.
                 </div>
                 <div className="text-[11px] p-2 rounded bg-blue-50 border border-blue-100 text-blue-700">
                    New clinic "Riverside Physio" requested access.
                 </div>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
};
