import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare2, Clock3, AlertCircle } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const TasksPage = () => {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const items = tasks ?? [];
  const openCount = items.filter((task) => task.status === 'OPEN' || task.status === 'IN_PROGRESS').length;
  const urgentCount = items.filter((task) => task.priority === 'URGENT').length;

  if (isLoading) {
    return <div className="p-6 text-slate-500">Loading tasks...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Dashboard"
        description="Track operational follow-through across staff, patients, and recurring clinic work."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <CheckSquare2 size={16} className="text-[#1FA971]" />
            Open work
          </div>
          <div className="text-3xl font-semibold text-slate-900">{openCount}</div>
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <AlertCircle size={16} className="text-orange-500" />
            Urgent tasks
          </div>
          <div className="text-3xl font-semibold text-slate-900">{urgentCount}</div>
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <Clock3 size={16} className="text-[#2563EB]" />
            Total tracked
          </div>
          <div className="text-3xl font-semibold text-slate-900">{items.length}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-6 py-4">Task</th>
              <th className="px-6 py-4">Assignee</th>
              <th className="px-6 py-4">Patient</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Priority</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!items.length ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  No tasks have been logged for this branch yet.
                </td>
              </tr>
            ) : (
              items.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{task.title}</div>
                    <div className="text-xs text-slate-500">{task.description || 'No description provided'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'Unassigned'}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {task.patient ? `${task.patient.firstName} ${task.patient.lastName}` : 'General'}
                  </td>
                  <td className="px-6 py-4">
                    <Badge>{task.status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline">{task.priority}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateMutation.isPending || task.status === 'COMPLETED'}
                      onClick={() => updateMutation.mutate({ id: task.id, status: 'COMPLETED' })}
                    >
                      Mark Complete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
