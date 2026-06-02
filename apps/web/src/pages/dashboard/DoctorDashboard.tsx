import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/lib/api';
import { StatCard, Card, PageHeader, Button } from '@clinicplus/ui';
import { Users, Calendar, TrendingUp, Clock, CheckSquare, MessageSquare, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Link } from 'react-router-dom';

export const DoctorDashboard = () => {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['doctor-dashboard'],
    queryFn: () => api.get('/analytics/dashboard/doctor'),
  });

  if (isLoading) return <div className="p-6">Loading dashboard data...</div>;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Doctor Intelligence Dashboard" 
        description="Daily insights into your clinical performance and patient load."
      >
        <div className="flex gap-2">
           <Button variant="outline" size="sm">Last 7 Days</Button>
           <Button className="bg-[#1FA971]" size="sm">Export Report</Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Appointments Today" 
          value={dashboard?.stats.todayAppointments.toString() || '0'} 
          change="+2 from yesterday" 
        />
        <StatCard 
          label="Total Patients" 
          value={dashboard?.stats.totalPatients.toString() || '0'} 
          change="+12% this month" 
        />
        <StatCard 
          label="Total Revenue" 
          value={`$${parseFloat(dashboard?.stats.totalRevenue).toFixed(2)}`} 
          change="+5% from last month" 
        />
        <StatCard 
          label="Retention Rate" 
          value="84%" 
          change="+2% improvement" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
            <TrendingUp size={18} className="text-[#1FA971]" />
            Appointment Trends (7 Days)
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard?.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                />
                <Bar dataKey="appointments" fill="#1FA971" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
               <h3 className="font-bold text-slate-900 flex items-center gap-2">
                 <CheckSquare size={18} className="text-blue-500" />
                 Pending Tasks
               </h3>
               <Link to="/tasks" className="text-xs text-[#1FA971] font-bold">View all</Link>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                 <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-[#1FA971]" />
                 <div className="flex-1">
                   <p className="text-sm font-medium text-slate-900">Review Lab Report #42</p>
                   <p className="text-[10px] text-slate-400 font-bold uppercase">Urgent</p>
                 </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                 <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-[#1FA971]" />
                 <div className="flex-1">
                   <p className="text-sm font-medium text-slate-900">Follow up with Mrs. Smith</p>
                   <p className="text-[10px] text-slate-400 font-bold uppercase">Pending</p>
                 </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-orange-500" />
              Patient Feedbacks
            </h3>
            <div className="space-y-4">
               <div className="p-3 border border-slate-100 rounded-xl">
                  <div className="flex gap-1 text-yellow-400 mb-1">
                     {Array.from({length: 5}).map((_, i) => <span key={i} className="text-xs font-bold">★</span>)}
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">"Dr. Jenkins was extremely thorough and explained everything clearly..."</p>
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">- John D.</p>
               </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
