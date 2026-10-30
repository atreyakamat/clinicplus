import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckSquare2,
  Clock3,
  MessageSquare,
  Plus,
  Play,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { useAuthStore } from '../../app/store/auth.store';
import {
  Drawer,
  ErrorBox,
  Modal,
  PatientPicker,
  dateInputToIso,
  fmtDate,
  fmtDateTime,
  getData,
  getList,
  inputCls,
  personName,
  qs,
  toDateInput,
} from './ui';
import type { PatientOption } from './ui';

type Status = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
  dueDate?: string | null;
  completedAt?: string | null;
  assignedTo?: string | null;
  createdBy?: string | null;
  sourceType?: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  patient?: { id: string; firstName: string; lastName: string; phone?: string | null } | null;
  _count?: { comments: number };
}

interface Assignee {
  id: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

interface Step {
  title: string;
  description?: string;
  offsetDays: number;
  assigneeRole?: string;
  priority?: Priority;
}

interface Template {
  id: string;
  name: string;
  description?: string | null;
  trigger?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  steps: Step[] | null;
}

const COLUMNS: { status: Status; label: string; tone: string }[] = [
  { status: 'OPEN', label: 'Open', tone: 'border-t-slate-400' },
  { status: 'IN_PROGRESS', label: 'In progress', tone: 'border-t-[#2563EB]' },
  { status: 'COMPLETED', label: 'Completed', tone: 'border-t-[#1FA971]' },
];

const PRIORITY_VARIANT: Record<Priority, 'default' | 'info' | 'warning' | 'error'> = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

const SOURCE_LABEL: Record<string, string> = {
  FOLLOW_UP_MISSED: 'Missed follow-up',
  INVOICE_OVERDUE: 'Overdue invoice',
  WORKFLOW: 'Workflow',
};

const ROLE_OPTIONS = ['Receptionist', 'Nurse', 'Doctor', 'Branch Manager', 'Accountant', 'Clinic Admin'];

const isOverdue = (t: Task) =>
  !!t.dueDate && (t.status === 'OPEN' || t.status === 'IN_PROGRESS') && new Date(t.dueDate) < new Date();

export const TasksPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'workflows' ? 'workflows' : 'board';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    if (t === 'board') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Follow-through for calls, clinical to-dos, collections and care workflows."
      />
      <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
        {[
          { id: 'board', label: 'Task board', icon: CheckSquare2 },
          { id: 'workflows', label: 'Workflow templates', icon: Workflow },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'board' ? <TaskBoard /> : <WorkflowTemplates />}
    </div>
  );
};

// ------------------------------------------------------------------ board

const TaskBoard = () => {
  const can = useCan();
  const queryClient = useQueryClient();
  const canAssign = can('tasks.assign');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [priority, setPriority] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const effectiveScope = canAssign ? scope : 'mine';

  const listQuery = useQuery({
    queryKey: ['tasks', effectiveScope, priority, overdueOnly],
    queryFn: () =>
      getList<Task>(
        `/tasks${qs({ scope: effectiveScope, priority, overdue: overdueOnly, includeClosed: !overdueOnly, limit: 200 })}`,
      ),
  });
  const summaryQuery = useQuery({
    queryKey: ['tasks', 'summary', effectiveScope],
    queryFn: () =>
      getData<{ open: number; inProgress: number; overdue: number; urgent: number; completedToday: number }>(
        `/tasks/summary${qs({ scope: effectiveScope })}`,
      ),
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const tasks = listQuery.data?.items ?? [];
  const grouped = useMemo(() => {
    const g: Record<Status, Task[]> = { OPEN: [], IN_PROGRESS: [], COMPLETED: [], CANCELLED: [] };
    for (const t of tasks) g[t.status]?.push(t);
    g.COMPLETED = g.COMPLETED.slice(0, 30);
    return g;
  }, [tasks]);
  const s = summaryQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile icon={<CheckSquare2 size={16} className="text-[#1FA971]" />} label="Open" value={s ? s.open + s.inProgress : '—'} />
        <SummaryTile icon={<Clock3 size={16} className="text-red-500" />} label="Overdue" value={s?.overdue ?? '—'} />
        <SummaryTile icon={<AlertCircle size={16} className="text-orange-500" />} label="Urgent" value={s?.urgent ?? '—'} />
        <SummaryTile icon={<CheckSquare2 size={16} className="text-[#2563EB]" />} label="Done today" value={s?.completedToday ?? '—'} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canAssign && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm" role="group" aria-label="Task scope">
            {(['mine', 'all'] as const).map((sc) => (
              <button
                key={sc}
                onClick={() => setScope(sc)}
                className={`rounded-md px-3 py-1 font-medium ${scope === sc ? 'bg-[#1FA971] text-white' : 'text-slate-600'}`}
              >
                {sc === 'mine' ? 'My tasks' : 'All branch tasks'}
              </button>
            ))}
          </div>
        )}
        <select className={`${inputCls} w-auto`} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <div className="ml-auto">
          <HasPermission permission="tasks.create">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={16} className="mr-1" /> New task
            </Button>
          </HasPermission>
        </div>
      </div>

      <ErrorBox error={listQuery.error || move.error} />

      {listQuery.isLoading ? (
        <div className="p-6 text-slate-500">Loading tasks…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.status} className={`rounded-xl border border-t-4 border-slate-200 bg-slate-50 ${col.tone}`}>
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                <span className="text-xs text-slate-500">{grouped[col.status].length}</span>
              </div>
              <div className="space-y-3 px-3 pb-3">
                {!grouped[col.status].length && (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                    {col.status === 'OPEN' ? 'Nothing waiting. Nice.' : 'No tasks here'}
                  </p>
                )}
                {grouped[col.status].map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    canUpdate={can('tasks.update')}
                    onOpen={() => setOpenTaskId(t.id)}
                    onMove={(status) => move.mutate({ id: t.id, status })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateTaskModal open={creating} onClose={() => setCreating(false)} canAssign={canAssign} />
      <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} canAssign={canAssign} />
    </div>
  );
};

const SummaryTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <Card className="p-4">
    <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
      {icon}
      {label}
    </div>
    <div className="text-2xl font-semibold text-slate-900">{value}</div>
  </Card>
);

const TaskCard = ({
  task,
  canUpdate,
  onOpen,
  onMove,
}: {
  task: Task;
  canUpdate: boolean;
  onOpen: () => void;
  onMove: (s: Status) => void;
}) => {
  const overdue = isOverdue(task);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium ${task.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
            {task.title}
          </p>
          <Badge variant={PRIORITY_VARIANT[task.priority]} className="shrink-0">
            {task.priority.toLowerCase()}
          </Badge>
        </div>
        <div className="mt-2 space-y-1 text-xs text-slate-500">
          {task.patient && <div>Patient: {personName(task.patient)}</div>}
          <div>Assignee: {task.assignee ? personName(task.assignee) : <span className="text-amber-600">Unassigned</span>}</div>
          {task.dueDate && (
            <div className={overdue ? 'font-medium text-red-600' : ''}>
              Due {fmtDate(task.dueDate)}
              {overdue && ' · overdue'}
            </div>
          )}
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {task.sourceType && SOURCE_LABEL[task.sourceType] && (
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
              <Zap size={11} /> {SOURCE_LABEL[task.sourceType]}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MessageSquare size={12} /> {task._count?.comments ?? 0}
          </span>
        </div>
        {canUpdate && (
          <select
            aria-label="Move task"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
            value={task.status}
            onChange={(e) => onMove(e.target.value as Status)}
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        )}
      </div>
    </div>
  );
};

const useAssignees = (enabled: boolean) =>
  useQuery({
    queryKey: ['task-assignees'],
    queryFn: () => getData<Assignee[]>('/tasks/assignees'),
    enabled,
    staleTime: 5 * 60_000,
  });

const CreateTaskModal = ({ open, onClose, canAssign }: { open: boolean; onClose: () => void; canAssign: boolean }) => {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const assignees = useAssignees(open && canAssign);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [patient, setPatient] = useState<PatientOption | null>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDueDate('');
    setAssignedTo('');
    setPatient(null);
  };
  const create = useMutation({
    mutationFn: () =>
      api.post('/tasks', {
        title,
        description: description || undefined,
        priority,
        dueDate: dueDate ? dateInputToIso(dueDate, 18) : undefined,
        patientId: patient?.id,
        assignedTo: canAssign ? assignedTo || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal open={open} title="New task" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="task-title">Title</label>
          <input id="task-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="task-desc">Details</label>
          <textarea
            id="task-desc"
            className={`${inputCls} h-24 py-2`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="task-priority">Priority</label>
            <select id="task-priority" className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((p) => (
                <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="task-due">Due date</label>
            <input id="task-due" type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {canAssign ? (
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="task-assignee">Assign to</label>
            <select id="task-assignee" className={inputCls} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {assignees.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {personName(u)}
                  {u.id === me?.id ? ' (me)' : ''} — {u.roles.join(', ')}
                </option>
              ))}
            </select>
            <ErrorBox error={assignees.error} />
          </div>
        ) : (
          <p className="text-xs text-slate-500">This task will be assigned to you.</p>
        )}
        <PatientPicker value={patient} onChange={setPatient} label="Patient (optional)" />
        <ErrorBox error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!title.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const TaskDrawer = ({ taskId, onClose, canAssign }: { taskId: string | null; onClose: () => void; canAssign: boolean }) => {
  const queryClient = useQueryClient();
  const can = useCan();
  const [comment, setComment] = useState('');
  const taskQuery = useQuery({
    queryKey: ['tasks', 'detail', taskId],
    queryFn: () => getData<Task>(`/tasks/${taskId}`),
    enabled: !!taskId,
  });
  const commentsQuery = useQuery({
    queryKey: ['tasks', 'comments', taskId],
    queryFn: () =>
      getData<{ id: string; comment: string; createdAt: string; user: { firstName: string; lastName: string } }[]>(
        `/tasks/${taskId}/comments`,
      ),
    enabled: !!taskId,
  });
  const assignees = useAssignees(!!taskId && canAssign);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const addComment = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/comments`, { comment }),
    onSuccess: () => {
      setComment('');
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/tasks/${taskId}`, body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const t = taskQuery.data;
  return (
    <Drawer open={!!taskId} title={t?.title ?? 'Task'} onClose={onClose}>
      {taskQuery.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      <ErrorBox error={taskQuery.error || update.error || remove.error} />
      {t && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority.toLowerCase()}</Badge>
            <Badge variant={t.status === 'COMPLETED' ? 'success' : 'outline'}>{t.status.replace('_', ' ').toLowerCase()}</Badge>
            {t.sourceType && SOURCE_LABEL[t.sourceType] && <Badge variant="info">{SOURCE_LABEL[t.sourceType]}</Badge>}
            {isOverdue(t) && <Badge variant="error">overdue</Badge>}
          </div>
          {t.description && <p className="whitespace-pre-line text-sm text-slate-700">{t.description}</p>}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Patient</dt>
              <dd className="text-slate-900">
                {t.patient ? personName(t.patient) : '—'}
                {t.patient?.phone && <div className="text-xs text-slate-500">{t.patient.phone}</div>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Due</dt>
              <dd className="text-slate-900">{fmtDate(t.dueDate)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="mb-1 text-xs text-slate-500">Assignee</dt>
              {canAssign ? (
                <select
                  className={inputCls}
                  value={t.assignedTo ?? ''}
                  onChange={(e) => update.mutate({ assignedTo: e.target.value || null })}
                  aria-label="Assignee"
                >
                  <option value="">Unassigned</option>
                  {assignees.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {personName(u)} — {u.roles.join(', ')}
                    </option>
                  ))}
                </select>
              ) : (
                <dd className="text-slate-900">{t.assignee ? personName(t.assignee) : 'Unassigned'}</dd>
              )}
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {can('tasks.update') && t.status !== 'COMPLETED' && (
              <Button size="sm" onClick={() => update.mutate({ status: 'COMPLETED' })} disabled={update.isPending}>
                Mark complete
              </Button>
            )}
            {can('tasks.update') && t.status === 'OPEN' && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ status: 'IN_PROGRESS' })}>
                Start
              </Button>
            )}
            {can('tasks.update') && t.status === 'COMPLETED' && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ status: 'OPEN' })}>
                Reopen
              </Button>
            )}
            <HasPermission permission="tasks.delete">
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={() => window.confirm('Cancel and remove this task?') && remove.mutate()}
              >
                <Trash2 size={14} className="mr-1" /> Delete
              </Button>
            </HasPermission>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Comments</h3>
            <ErrorBox error={commentsQuery.error} />
            <ul className="space-y-3">
              {commentsQuery.data?.length === 0 && <li className="text-sm text-slate-500">No comments yet.</li>}
              {commentsQuery.data?.map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{personName(c.user)}</span>
                    <span>{fmtDateTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-slate-800">{c.comment}</p>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (comment.trim()) addComment.mutate();
              }}
            >
              <textarea
                className={`${inputCls} h-20 py-2`}
                placeholder="Add a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={4000}
                aria-label="Comment"
              />
              <ErrorBox error={addComment.error} />
              <div className="flex justify-end">
                <Button size="sm" type="submit" disabled={!comment.trim() || addComment.isPending}>
                  Post comment
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Drawer>
  );
};

// ------------------------------------------------------------------ workflows

const WorkflowTemplates = () => {
  const can = useCan();
  const queryClient = useQueryClient();
  const canManage = can('workflows.manage');
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [starting, setStarting] = useState<Template | null>(null);
  const list = useQuery({
    queryKey: ['workflow-templates', canManage],
    queryFn: () => getData<Template[]>(`/workflow-templates${qs({ includeInactive: canManage })}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/workflow-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflow-templates'] }),
  });
  const toggle = useMutation({
    mutationFn: (t: Template) =>
      api.patch(`/workflow-templates/${t.id}`, { status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflow-templates'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Reusable care pathways. Starting one for a patient creates a dated task per step, assigned by role.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus size={16} className="mr-1" /> New template
          </Button>
        )}
      </div>
      <ErrorBox error={list.error || remove.error || toggle.error} />
      {list.isLoading && <p className="text-sm text-slate-500">Loading templates…</p>}
      {list.data?.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-500">
          No workflow templates yet.{canManage ? ' Create one, e.g. "Post-surgery care".' : ''}
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {list.data?.map((t) => (
          <Card key={t.id} className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{t.name}</h3>
                {t.description && <p className="text-sm text-slate-500">{t.description}</p>}
              </div>
              <Badge variant={t.status === 'ACTIVE' ? 'success' : 'default'}>{t.status.toLowerCase()}</Badge>
            </div>
            <ol className="space-y-1 text-sm text-slate-700">
              {(t.steps ?? []).map((s, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {i + 1}. {s.title}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    day {s.offsetDays}
                    {s.assigneeRole ? ` · ${s.assigneeRole}` : ''}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 pt-1">
              <HasPermission permission={['tasks.assign']}>
                {t.status === 'ACTIVE' && can('tasks.create') && (
                  <Button size="sm" onClick={() => setStarting(t)}>
                    <Play size={14} className="mr-1" /> Start for patient
                  </Button>
                )}
              </HasPermission>
              {canManage && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => toggle.mutate(t)}>
                    {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => window.confirm(`Delete "${t.name}"?`) && remove.mutate(t.id)}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
      {editing && <TemplateEditor template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <StartWorkflowModal template={starting} onClose={() => setStarting(null)} />
    </div>
  );
};

const emptyStep = (): Step => ({ title: '', offsetDays: 0, assigneeRole: 'Receptionist', priority: 'MEDIUM' });

const TemplateEditor = ({ template, onClose }: { template: Template | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [steps, setSteps] = useState<Step[]>(template?.steps?.length ? template.steps : [emptyStep()]);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        description: description || undefined,
        steps: steps.map((s) => ({
          title: s.title,
          offsetDays: Number(s.offsetDays) || 0,
          ...(s.assigneeRole ? { assigneeRole: s.assigneeRole } : {}),
          ...(s.priority ? { priority: s.priority } : {}),
          ...(s.description ? { description: s.description } : {}),
        })),
      };
      return template ? api.patch(`/workflow-templates/${template.id}`, body) : api.post('/workflow-templates', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      onClose();
    },
  });
  const setStep = (i: number, patch: Partial<Step>) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Modal open title={template ? 'Edit workflow template' : 'New workflow template'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="wf-name">Name</label>
          <input id="wf-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="wf-desc">Description</label>
          <input id="wf-desc" className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </div>
        <datalist id="wf-roles">
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Steps</h3>
          {steps.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 p-3">
              <input
                className={`${inputCls} col-span-12 sm:col-span-5`}
                placeholder="Step title"
                value={s.title}
                onChange={(e) => setStep(i, { title: e.target.value })}
                required
                aria-label={`Step ${i + 1} title`}
              />
              <input
                className={`${inputCls} col-span-4 sm:col-span-2`}
                type="number"
                min={0}
                max={365}
                value={s.offsetDays}
                onChange={(e) => setStep(i, { offsetDays: Number(e.target.value) })}
                aria-label={`Step ${i + 1} day offset`}
                title="Days after start"
              />
              <input
                className={`${inputCls} col-span-8 sm:col-span-3`}
                list="wf-roles"
                placeholder="Assignee role"
                value={s.assigneeRole ?? ''}
                onChange={(e) => setStep(i, { assigneeRole: e.target.value })}
                aria-label={`Step ${i + 1} assignee role`}
              />
              <div className="col-span-12 flex items-center gap-2 sm:col-span-2">
                <select
                  className={inputCls}
                  value={s.priority ?? 'MEDIUM'}
                  onChange={(e) => setStep(i, { priority: e.target.value as Priority })}
                  aria-label={`Step ${i + 1} priority`}
                >
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((p) => (
                    <option key={p} value={p}>{p.toLowerCase()}</option>
                  ))}
                </select>
                {steps.length > 1 && (
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove step ${i + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setSteps((p) => [...p, emptyStep()])}>
            <Plus size={14} className="mr-1" /> Add step
          </Button>
          <p className="text-xs text-slate-500">Day offset = days after the workflow start date that the task is due.</p>
        </div>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !name.trim() || steps.some((s) => !s.title.trim())}>
            {save.isPending ? 'Saving…' : 'Save template'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const StartWorkflowModal = ({ template, onClose }: { template: Template | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [result, setResult] = useState<{ tasks: Task[]; unassigned: number } | null>(null);
  const start = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/workflow-templates/${template!.id}/start`, {
        patientId: patient!.id,
        startDate: dateInputToIso(startDate),
      });
      return res.data as { tasks: Task[]; unassigned: number };
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const close = () => {
    setPatient(null);
    setResult(null);
    start.reset();
    onClose();
  };

  return (
    <Modal open={!!template} title={`Start "${template?.name ?? ''}"`} onClose={close}>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Created {result.tasks.length} task(s) for {personName(patient)}.
            {result.unassigned > 0 && (
              <span className="text-amber-700"> {result.unassigned} could not be matched to staff with that role and are unassigned.</span>
            )}
          </p>
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (patient) start.mutate();
          }}
        >
          <PatientPicker value={patient} onChange={setPatient} />
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="wf-start">Start date</label>
            <input id="wf-start" type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <ErrorBox error={start.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!patient || start.isPending}>
              {start.isPending ? 'Starting…' : 'Start workflow'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

