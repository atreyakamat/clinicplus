import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { MainLayout } from './layouts/MainLayout';
import { AuthPage } from '../pages/auth';
import { DashboardPage } from '../pages/dashboard';
import { PatientsPage } from '../pages/patients';
import { AppointmentsPage } from '../pages/appointments';
import { QueuePage } from '../pages/queue';
import { ConsultationsPage } from '../pages/consultations';
import { PrescriptionsPage } from '../pages/prescriptions';
import { DocumentsPage } from '../pages/documents';
import { FollowUpsPage } from '../pages/follow-ups';
import { BillingPage } from '../pages/billing';
import { CommunicationPage } from '../pages/communication';
import { ReviewsPage } from '../pages/reviews';
import { AnalyticsPage } from '../pages/analytics';
import { TasksPage } from '../pages/tasks';
import { SettingsPage } from '../pages/settings';
import { RootRoute } from './RootRoute';

import { ProtectedRoute } from './layouts/ProtectedRoute';

import { PatientFormPage } from '../pages/patients/PatientFormPage';
import { PatientProfilePage } from '../pages/patients/PatientProfilePage';

import { AppointmentFormPage } from '../pages/appointments/AppointmentFormPage';
import { AppointmentDetailPage } from '../pages/appointments/AppointmentDetailPage';

import { ConsultationWorkspace } from '../pages/consultations/ConsultationWorkspace';

import { PrescriptionForm } from '../pages/prescriptions/PrescriptionForm';
import { PrescriptionDetailPage } from '../pages/prescriptions/PrescriptionDetailPage';

import { InvoiceDetailPage } from '../pages/billing/InvoiceDetailPage';

import { FeedbackPage } from '../pages/reviews/FeedbackPage';

import { OnboardingWizard } from '../pages/onboarding';
import { BrandingSettings } from '../pages/settings/BrandingSettings';
import { StaffManagement } from '../pages/settings/StaffManagement';
import { PilotAdminPanel } from '../pages/admin';
import { BranchesSettings } from '../pages/settings/BranchesSettings';
import { ClinicSetup } from '../pages/settings/ClinicSetup';
import { SecuritySettings } from '../pages/settings/SecuritySettings';
import { RolesSettings } from '../pages/settings/RolesSettings';
import { DoctorsPage } from '../pages/doctors';
import { DoctorProfilePage } from '../pages/doctors/DoctorProfilePage';
import { ReportsPage } from '../pages/reports';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { AcceptInvitePage } from '../pages/auth/AcceptInvitePage';
import { ReviewSubmitPage } from '../pages/public/ReviewSubmitPage';
import { PaymentResultPage } from '../pages/public/PaymentResultPage';
import { PatientPortal } from '../pages/portal';
import { SubscriptionSettings } from '../pages/settings/SubscriptionSettings';

export const router = createBrowserRouter([
  {
    path: '/auth/login',
    element: <AuthPage />,
  },
  // Public (no login): password recovery, staff invites, patient review links, payment return.
  { path: '/auth/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/auth/reset-password', element: <ResetPasswordPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },
  { path: '/r/:token', element: <ReviewSubmitPage /> },
  { path: '/pay/result', element: <PaymentResultPage /> },
  { path: '/portal/*', element: <PatientPortal /> },
  {
    path: '/onboarding',
    element: <ProtectedRoute><OnboardingWizard /></ProtectedRoute>,
  },
  {
    path: '/admin',
    element: <ProtectedRoute><PilotAdminPanel /></ProtectedRoute>,
  },
  {
    path: '/',
    element: <RootRoute />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'patients', element: <PatientsPage /> },
      { path: 'patients/new', element: <PatientFormPage /> },
      { path: 'patients/:id', element: <PatientProfilePage /> },
      { path: 'patients/:id/edit', element: <PatientFormPage /> },
      { path: 'appointments', element: <AppointmentsPage /> },
      { path: 'appointments/new', element: <AppointmentFormPage /> },
      { path: 'appointments/:id', element: <AppointmentDetailPage /> },
      { path: 'queue', element: <QueuePage /> },
      { path: 'consultations/:id', element: <ConsultationWorkspace /> },
      { path: 'consultations', element: <ConsultationsPage /> },
      { path: 'prescriptions/new', element: <PrescriptionForm /> },
      { path: 'prescriptions/:id', element: <PrescriptionDetailPage /> },
      { path: 'prescriptions', element: <PrescriptionsPage /> },
      { path: 'billing/:id', element: <InvoiceDetailPage /> },
      { path: 'billing', element: <BillingPage /> },
      { path: 'documents/*', element: <DocumentsPage /> },
      { path: 'follow-ups/*', element: <FollowUpsPage /> },
      { path: 'communication/*', element: <CommunicationPage /> },
      { path: 'reviews/feedback', element: <FeedbackPage /> },
      { path: 'reviews/*', element: <ReviewsPage /> },
      { path: 'analytics/*', element: <AnalyticsPage /> },
      { path: 'reports/*', element: <ReportsPage /> },
      { path: 'doctors', element: <DoctorsPage /> },
      { path: 'doctors/:id', element: <DoctorProfilePage /> },
      { path: 'tasks/*', element: <TasksPage /> },
      { path: 'settings/subscription', element: <SubscriptionSettings /> },
      { path: 'settings/branding', element: <BrandingSettings /> },
      { path: 'settings/staff', element: <StaffManagement /> },
      { path: 'settings/branches', element: <BranchesSettings /> },
      { path: 'settings/clinic', element: <ClinicSetup /> },
      { path: 'settings/security', element: <SecuritySettings /> },
      { path: 'settings/roles', element: <RolesSettings /> },
      { path: 'settings/*', element: <SettingsPage /> },
    ],
  },
]);