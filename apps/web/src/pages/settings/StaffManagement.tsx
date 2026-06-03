import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Mail, Shield, Trash2, CheckCircle, Clock } from 'lucide-react';
import { Button, Card, Input, PageHeader, Badge } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const StaffManagement = () => {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);

  const { data: staff, isLoading: staffLoading } = useQuery<any[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/users'),
  });

  const { data: invitations, isLoading: invitesLoading } = useQuery<any[]>({
    queryKey: ['staff-invitations'],
    queryFn: () => api.get('/staff-invitations'),
  });

  const { data: roles } = useQuery<any[]>({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles'),
  });

  const inviteMutation = useMutation({
    mutationFn: (data: any) => api.post('/staff-invitations/invite', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-invitations'] });
      setShowInviteModal(false);
    }
  });

  if (staffLoading || invitesLoading) return <div className="p-6">Loading staff records...</div>;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Staff & User Management" 
        description="Invite doctors and staff, manage roles, and control access levels."
      >
        <Button onClick={() => setShowInviteModal(true)} className="gap-2">
          <UserPlus size={16} /> Invite Staff
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50">
              <h3 className="font-bold text-slate-900">Active Team Members</h3>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {staff?.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-3">
                         <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">
                           {user.firstName[0]}{user.lastName[0]}
                         </div>
                         <span className="font-medium text-slate-900">{user.firstName} {user.lastName}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       {user.roles?.map((r: any) => (
                         <Badge key={r.role.id} variant="info" className="bg-blue-50 text-blue-700 border-blue-100">
                           {r.role.name}
                         </Badge>
                       ))}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{user.email}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50">
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="p-0 overflow-hidden">
             <div className="p-4 border-b bg-slate-50/50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Clock size={16} className="text-orange-500" />
                  Pending Invitations
                </h3>
             </div>
             <div className="divide-y">
                {!invitations?.length ? (
                  <div className="p-8 text-center text-slate-400 text-xs">No pending invites.</div>
                ) : (
                  invitations.map((invite) => (
                    <div key={invite.id} className="p-4 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900 text-sm">{invite.email}</span>
                        <span className="text-[10px] font-bold uppercase text-orange-500">{invite.status}</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
                    </div>
                  ))
                )}
             </div>
          </Card>

          <Card className="p-6 bg-[#1FA971] text-white">
             <Shield className="mb-4 opacity-50" size={32} />
             <h4 className="font-bold mb-2">RBAC Control</h4>
             <p className="text-xs opacity-90 leading-relaxed">
               Every invited user must be assigned a role. Roles define exactly what screens and data a user can access.
             </p>
          </Card>
        </div>
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
           <Card className="w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
              <h2 className="text-xl font-bold mb-6">Invite New Staff Member</h2>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                inviteMutation.mutate({
                  email: formData.get('email'),
                  roleId: formData.get('roleId'),
                });
              }} className="space-y-4">
                 <Input name="email" label="Email Address" type="email" placeholder="staff@clinic.com" required />
                 <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Assign Role</label>
                    <select name="roleId" className="w-full h-11 border rounded-xl px-3 bg-white" required>
                       <option value="">Select a Role</option>
                       {roles?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                 </div>
                 <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                    <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)}>Cancel</Button>
                    <Button type="submit" disabled={inviteMutation.isPending}>
                       {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                    </Button>
                 </div>
              </form>
           </Card>
        </div>
      )}
    </div>
  );
};
