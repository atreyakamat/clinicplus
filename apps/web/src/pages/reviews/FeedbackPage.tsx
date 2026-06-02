import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { MessageSquare, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useMutation, useQuery } from '@tanstack/react-query';

export const FeedbackPage = () => {
  const [submitted, setSubmitted] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/feedback', data),
    onSuccess: () => {
      setSubmitted(true);
      reset();
      setTimeout(() => setSubmitted(false), 5000);
    }
  });

  const { data: feedbacks } = useQuery<any[]>({
    queryKey: ['my-feedback'],
    queryFn: () => api.get('/feedback'),
  });

  const onSubmit = (data: any) => mutation.mutate(data);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader 
        title="Feedback & Support" 
        description="Help us improve ClinicOS. Report bugs or suggest new features."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-[#1FA971]" />
              Submit Feedback
            </h3>
            
            {submitted ? (
              <div className="bg-green-50 text-green-700 p-6 rounded-xl text-center space-y-3">
                <CheckCircle2 size={32} className="mx-auto" />
                <p className="font-bold">Thank You!</p>
                <p className="text-sm">Your feedback has been received. Our team will review it shortly.</p>
                <Button variant="outline" size="sm" onClick={() => setSubmitted(false)}>Submit Another</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Category</label>
                  <select {...register('category')} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-1 focus:ring-[#1FA971]">
                    <option value="BUG">Report a Bug</option>
                    <option value="FEATURE">Feature Request</option>
                    <option value="UX">Improvement Suggestion</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <Input label="Subject" {...register('subject', { required: true })} placeholder="Short summary" />
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Description</label>
                  <textarea 
                    {...register('content', { required: true })}
                    className="w-full min-h-[120px] p-3 rounded-lg border border-slate-200 text-sm outline-none focus:ring-1 focus:ring-[#1FA971]" 
                    placeholder="Tell us more details..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Priority</label>
                  <div className="flex gap-4">
                    {['LOW', 'MEDIUM', 'HIGH'].map(p => (
                      <label key={p} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input type="radio" value={p} {...register('priority')} defaultChecked={p === 'MEDIUM'} className="text-[#1FA971] focus:ring-[#1FA971]" />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={mutation.isPending}>
                  <Send size={16} /> {mutation.isPending ? 'Sending...' : 'Send Feedback'}
                </Button>
              </form>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-900">Recent Submissions</h3>
            </div>
            <div className="divide-y divide-slate-100 min-h-[400px]">
              {!feedbacks?.length ? (
                <div className="p-12 text-center text-slate-400">
                  No feedback submitted yet.
                </div>
              ) : (
                feedbacks.map((f) => (
                  <div key={f.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 ${f.category === 'BUG' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                          {f.category}
                        </span>
                        <h4 className="inline font-bold text-slate-900">{f.subject}</h4>
                      </div>
                      <span className={`text-[10px] font-bold uppercase ${f.status === 'OPEN' ? 'text-orange-500' : 'text-green-500'}`}>
                        {f.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-2 mb-2">{f.content}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                      <span>Submitted by {f.user.firstName} {f.user.lastName}</span>
                      <span>{new Date(f.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
