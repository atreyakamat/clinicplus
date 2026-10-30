import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@clinicplus/ui';
import { useAuthStore, type AuthSession } from '../../app/store/auth.store';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { AuthShell, ErrorBanner, passwordSchema } from './shared';

const loginSchema = z.object({
  email: z.string().email({ message: 'Enter a valid e-mail address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const registerSchema = z.object({
  firstName: z.string().trim().min(1, { message: 'First name is required' }).max(80),
  lastName: z.string().trim().min(1, { message: 'Last name is required' }).max(80),
  email: z.string().email({ message: 'Enter a valid e-mail address' }),
  phone: z.string().max(20).optional(),
  password: passwordSchema,
  clinicName: z.string().trim().min(2, { message: 'Clinic name is required' }).max(120),
  clinicSlug: z
    .string()
    .min(3, { message: 'At least 3 characters' })
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Lowercase letters, digits and single hyphens only' }),
  isPractitioner: z.boolean(),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export const AuthPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(params.get('mode') === 'register' ? 'register' : 'login');

  const loginForm = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { isPractitioner: true },
  });

  const signIn = async (email: string, password: string) => {
    const session = unwrap<AuthSession>(await api.post('/auth/login', { email, password }));
    setSession(session);
    return session;
  };

  const onLoginSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    try {
      await signIn(data.email, data.password);
      navigate('/');
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Login failed. Please check your credentials.'));
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setServerError(null);
    try {
      await api.post('/auth/register', { ...data, phone: data.phone || undefined });
      await signIn(data.email, data.password);
      navigate('/onboarding');
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Registration failed. Please try again.'));
    }
  };

  const clinicName = registerForm.register('clinicName');

  return (
    <AuthShell subtitle="Clinic management for modern practices">
      {serverError && <ErrorBanner message={serverError} />}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setServerError(null); }}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="login">Sign in</TabsTrigger>
          <TabsTrigger value="register">Create clinic</TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5" noValidate>
            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              placeholder="you@clinic.com"
              {...loginForm.register('email')}
              error={loginForm.formState.errors.email?.message}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              {...loginForm.register('password')}
              error={loginForm.formState.errors.password?.message}
            />
            <div className="flex justify-end -mt-2">
              <Link to="/auth/forgot-password" className="text-sm font-medium text-[#1FA971] hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" disabled={loginForm.formState.isSubmitting} className="w-full bg-[#1FA971] hover:bg-[#1A8D5E]">
              {loginForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="register">
          <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="First name" autoComplete="given-name" {...registerForm.register('firstName')} error={registerForm.formState.errors.firstName?.message} />
              <Input label="Last name" autoComplete="family-name" {...registerForm.register('lastName')} error={registerForm.formState.errors.lastName?.message} />
            </div>
            <Input label="E-mail" type="email" autoComplete="email" placeholder="you@clinic.com" {...registerForm.register('email')} error={registerForm.formState.errors.email?.message} />
            <Input label="Mobile (optional)" type="tel" autoComplete="tel" {...registerForm.register('phone')} error={registerForm.formState.errors.phone?.message} />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              helperText="8+ characters with upper- and lower-case letters and a digit or symbol"
              {...registerForm.register('password')}
              error={registerForm.formState.errors.password?.message}
            />
            <div className="space-y-4 border-t pt-4">
              <Input
                label="Clinic name"
                placeholder="e.g. City Dental Care"
                {...clinicName}
                onChange={(e) => {
                  clinicName.onChange(e);
                  if (!registerForm.formState.dirtyFields.clinicSlug) {
                    registerForm.setValue('clinicSlug', slugify(e.target.value));
                  }
                }}
                error={registerForm.formState.errors.clinicName?.message}
              />
              <Input
                label="Clinic web address"
                placeholder="city-dental"
                helperText="Used to identify your clinic; lowercase letters, digits and hyphens"
                {...registerForm.register('clinicSlug')}
                error={registerForm.formState.errors.clinicSlug?.message}
              />
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1FA971]" {...registerForm.register('isPractitioner')} />
                <span>
                  <span className="font-medium text-slate-900">I am also a practitioner</span>
                  <span className="block text-xs text-slate-500">
                    Gives your account the Doctor role too, so you can run consultations and write prescriptions.
                  </span>
                </span>
              </label>
            </div>
            <Button type="submit" disabled={registerForm.formState.isSubmitting} className="w-full bg-[#1FA971] hover:bg-[#1A8D5E]">
              {registerForm.formState.isSubmitting ? 'Creating your clinic…' : 'Create clinic'}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </AuthShell>
  );
};
