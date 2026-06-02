import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Palette, Image as ImageIcon, Layout, Save, Upload } from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../app/store/auth.store';

export const BrandingSettings = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ['my-organization'],
    queryFn: () => api.get(`/organizations/${user?.organizationId}`),
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.patch(`/organizations/${user?.organizationId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organization'] });
    }
  });

  const { register, handleSubmit } = useForm({
    values: org ? {
      name: org.name,
      primaryColor: org.primaryColor || '#1FA971',
      secondaryColor: org.secondaryColor || '#2563EB',
      footerText: org.footerText || '',
    } : undefined
  });

  const onSubmit = (data: any) => mutation.mutate(data);

  if (isLoading) return <div className="p-6">Loading settings...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader 
        title="Clinic Branding" 
        description="Customize how your clinic appears on prescriptions, invoices, and the web app."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Palette size={18} className="text-[#1FA971]" />
              Visual Identity
            </h3>
            
            <div className="space-y-4">
              <Input label="Clinic Name" {...register('name')} />
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Primary Color</label>
                  <div className="flex gap-2">
                    <input type="color" {...register('primaryColor')} className="h-10 w-12 rounded border p-1 cursor-pointer" />
                    <input type="text" {...register('primaryColor')} className="flex-1 h-10 border rounded px-3 text-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Secondary Color</label>
                  <div className="flex gap-2">
                    <input type="color" {...register('secondaryColor')} className="h-10 w-12 rounded border p-1 cursor-pointer" />
                    <input type="text" {...register('secondaryColor')} className="flex-1 h-10 border rounded px-3 text-sm" />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ImageIcon size={18} className="text-[#1FA971]" />
              Logo & Assets
            </h3>
            
            <div className="space-y-6">
               <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50">
                  <ImageIcon size={32} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-xs text-slate-500 mb-4">Upload your clinic logo (PNG or SVG)</p>
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <Upload size={14} /> Select File
                  </Button>
               </div>

               <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Invoice/Prescription Footer</label>
                  <textarea 
                    {...register('footerText')}
                    className="w-full min-h-[80px] p-3 rounded-lg border border-slate-200 text-sm outline-none focus:ring-1 focus:ring-[#1FA971]" 
                    placeholder="e.g. Terms and conditions, license info..."
                  />
               </div>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Layout size={18} className="text-[#1FA971]" />
            Live Preview
          </h3>
          <div className="border rounded-xl overflow-hidden shadow-sm">
             <div className="h-12 bg-white border-b flex items-center px-4 justify-between">
                <div className="font-bold text-sm" style={{ color: org?.primaryColor || '#1FA971' }}>{org?.name}</div>
                <div className="h-6 w-6 rounded-full bg-slate-200" />
             </div>
             <div className="p-8 bg-slate-50 min-h-[100px]">
                <div className="h-4 w-1/3 bg-slate-200 rounded mb-4" />
                <div className="h-24 bg-white rounded-lg border shadow-sm" />
             </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline">Reset Changes</Button>
          <Button type="submit" className="gap-2" disabled={mutation.isPending}>
            <Save size={16} /> {mutation.isPending ? 'Saving...' : 'Save Branding'}
          </Button>
        </div>
      </form>
    </div>
  );
};
