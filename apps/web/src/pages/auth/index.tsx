import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@clinicplus/ui';
import { useAuthStore } from '../../app/store/auth.store';
import { api, ApiError } from '../../app/lib/api';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

const registerSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  firstName: z.string().min(1, { message: 'First name is required' }),
  lastName: z.string().min(1, { message: 'Last name is required' }),
  clinicName: z.string().min(1, { message: 'Clinic name is required' }),
  clinicSlug: z.string().min(1, { message: 'Clinic slug is required' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export const AuthPage = () => {
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('login');

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onLoginSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    try {
      const response = await api.post('/auth/login', data);
      loginStore(response.user, response.accessToken);
      navigate('/');
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.data?.message || 'Login failed. Please check your credentials.');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setServerError(null);
    try {
      await api.post('/auth/register', data);
      // Auto-login after registration
      const loginRes = await api.post('/auth/login', { email: data.email, password: data.password });
      loginStore(loginRes.user, loginRes.accessToken);
      navigate('/onboarding');
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.data?.message || 'Registration failed. Please try again.');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#1FA971]">ClinicOS</h1>
          <p className="text-sm text-gray-500 mt-2">Healthcare Operating System</p>
        </div>

        {serverError && (
          <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5">
              <Input
                label="Email"
                type="email"
                placeholder="admin@clinicos.com"
                {...loginForm.register('email')}
                error={loginForm.formState.errors.email?.message}
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                {...loginForm.register('password')}
                error={loginForm.formState.errors.password?.message}
              />
              <Button type="submit" disabled={loginForm.formState.isSubmitting} className="w-full bg-[#1FA971] hover:bg-[#1A8D5E]">
                {loginForm.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="First Name"
                  {...registerForm.register('firstName')}
                  error={registerForm.formState.errors.firstName?.message}
                />
                <Input
                  label="Last Name"
                  {...registerForm.register('lastName')}
                  error={registerForm.formState.errors.lastName?.message}
                />
              </div>
              <Input
                label="Email"
                type="email"
                placeholder="you@clinic.com"
                {...registerForm.register('email')}
                error={registerForm.formState.errors.email?.message}
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                {...registerForm.register('password')}
                error={registerForm.formState.errors.password?.message}
              />
              <div className="pt-2 border-t mt-4">
                <Input
                  label="Clinic Name"
                  placeholder="e.g. City Dental Care"
                  {...registerForm.register('clinicName')}
                  error={registerForm.formState.errors.clinicName?.message}
                />
                <Input
                  label="URL Slug"
                  placeholder="e.g. city-dental"
                  {...registerForm.register('clinicSlug')}
                  error={registerForm.formState.errors.clinicSlug?.message}
                />
              </div>
              <Button type="submit" disabled={registerForm.formState.isSubmitting} className="w-full bg-[#1FA971] hover:bg-[#1A8D5E] mt-4">
                {registerForm.formState.isSubmitting ? 'Creating Account...' : 'Get Started Free'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
