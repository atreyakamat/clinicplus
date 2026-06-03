import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Layout, Palette, Users, Upload, Building, ArrowRight } from 'lucide-react';
import { Button, Card, Input } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

const steps = [
  { id: 1, title: 'Clinic Info', icon: Building },
  { id: 2, title: 'Identity', icon: Palette },
  { id: 3, title: 'Doctors', icon: Users },
  { id: 4, title: 'Go Live', icon: Check },
];

export const OnboardingWizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    primaryColor: '#1FA971',
    secondaryColor: '#2563EB',
  });

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-6">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">Welcome to ClinicOS</h1>
          <p className="text-slate-500 text-lg">Let's set up your clinic for success.</p>
        </div>

        {/* Stepper */}
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;
            
            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-2 relative">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center border-2 transition-all ${
                    isCompleted ? 'bg-[#1FA971] border-[#1FA971] text-white' : 
                    isActive ? 'border-[#1FA971] text-[#1FA971] bg-white' : 
                    'border-slate-200 text-slate-400 bg-white'
                  }`}>
                    {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-[#1FA971]' : 'text-slate-400'}`}>
                    {step.title}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-4 transition-all ${currentStep > step.id ? 'bg-[#1FA971]' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <Card className="p-8 mt-12 shadow-xl border-none">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900">Basic Information</h2>
                <p className="text-sm text-slate-500">How should patients and staff identify your clinic?</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="Clinic Name" placeholder="e.g. City General Hospital" />
                <Input label="Clinic URL Slug" placeholder="e.g. city-general" />
                <Input label="Business Email" placeholder="contact@citygeneral.com" />
                <Input label="Phone Number" placeholder="+1 (555) 000-0000" />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900">Clinic Identity</h2>
                <p className="text-sm text-slate-500">Upload your logo and choose your brand colors.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                   <label className="text-sm font-medium text-slate-700">Primary Color</label>
                   <div className="flex gap-3">
                      <input type="color" className="h-12 w-16 rounded border p-1" defaultValue="#1FA971" />
                      <input type="text" className="flex-1 border rounded px-4 h-12" defaultValue="#1FA971" />
                   </div>
                   <p className="text-xs text-slate-400 italic">This color will be used for buttons, headers, and PDFs.</p>
                </div>
                <div className="border-2 border-dashed rounded-xl p-8 text-center bg-slate-50 flex flex-col items-center">
                  <Upload size={32} className="text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-500">Upload Logo</p>
                  <button className="mt-4 text-[#1FA971] text-xs font-bold">Browse Files</button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
               <div className="space-y-2 text-center">
                <h2 className="text-xl font-bold text-slate-900">Add Your Team</h2>
                <p className="text-sm text-slate-500">Invite doctors and staff to start using the system.</p>
              </div>
              <div className="space-y-3">
                 <div className="flex gap-3">
                    <Input className="flex-1" placeholder="Email Address" />
                    <select className="border rounded-xl px-4 text-sm bg-white">
                      <option>Doctor</option>
                      <option>Receptionist</option>
                    </select>
                    <Button variant="outline">Invite</Button>
                 </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-400">
                 No invitations sent yet.
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="text-center space-y-6 py-8">
               <div className="h-20 w-20 bg-green-100 text-[#1FA971] rounded-full flex items-center justify-center mx-auto">
                 <Check size={40} />
               </div>
               <div className="space-y-2">
                 <h2 className="text-2xl font-bold text-slate-900">Setup Complete!</h2>
                 <p className="text-slate-500">Your clinic "City General Hospital" is ready for action.</p>
               </div>
               <div className="max-w-md mx-auto bg-blue-50 text-blue-700 p-4 rounded-xl text-sm flex gap-3 text-left">
                  <Layout size={20} className="shrink-0" />
                  <p>Next: Import your existing patients or book your first appointment from the dashboard.</p>
               </div>
            </div>
          )}

          <div className="flex justify-between mt-12 pt-8 border-t border-slate-100">
            <Button variant="ghost" onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)} disabled={currentStep === 1}>
              Back
            </Button>
            <Button className="gap-2" onClick={handleNext}>
              {currentStep === steps.length ? 'Go to Dashboard' : 'Continue'}
              <ArrowRight size={18} />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
