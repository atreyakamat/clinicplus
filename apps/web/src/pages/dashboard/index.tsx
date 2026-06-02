import React from 'react';
import { StatCard, PageHeader, Card, Button } from '@clinicplus/ui';
import { Users, Calendar, TrendingUp, Clock } from 'lucide-react';

export const DashboardPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Organization Dashboard" 
        description="Overview of your clinic's performance and operations today."
      >
        <Button>Generate Report</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Patients Today" 
          value="45" 
          change="+12% from yesterday" 
        />
        <StatCard 
          label="Appointments" 
          value="32" 
          change="8 remaining" 
        />
        <StatCard 
          label="Revenue Today" 
          value="$1,240.00" 
          change="+5% from yesterday" 
        />
        <StatCard 
          label="Avg. Wait Time" 
          value="14 mins" 
          change="-2 mins" 
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="text-gray-400" size={20} />
            <h2 className="text-lg font-semibold">Live Queue</h2>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-sm">Token #12</p>
                <p className="text-xs text-gray-500">Dr. Sarah Jenkins</p>
              </div>
              <span className="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded">In Progress</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-sm">Token #13</p>
                <p className="text-xs text-gray-500">Dr. Michael Chen</p>
              </div>
              <span className="text-xs font-medium bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Waiting</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="text-gray-400" size={20} />
            <h2 className="text-lg font-semibold">Upcoming Appointments</h2>
          </div>
          <div className="space-y-4">
             <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-sm">John Doe</p>
                <p className="text-xs text-gray-500">Follow-up • 10:30 AM</p>
              </div>
              <Button size="sm" variant="outline">View</Button>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-sm">Emily Smith</p>
                <p className="text-xs text-gray-500">Consultation • 11:00 AM</p>
              </div>
              <Button size="sm" variant="outline">View</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
