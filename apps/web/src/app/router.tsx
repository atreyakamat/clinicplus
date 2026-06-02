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

export const router = createBrowserRouter([
  {
    path: '/auth/login',
    element: <AuthPage />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'patients/*', element: <PatientsPage /> },
      { path: 'appointments/*', element: <AppointmentsPage /> },
      { path: 'queue/*', element: <QueuePage /> },
      { path: 'consultations/*', element: <ConsultationsPage /> },
      { path: 'prescriptions/*', element: <PrescriptionsPage /> },
      { path: 'documents/*', element: <DocumentsPage /> },
      { path: 'follow-ups/*', element: <FollowUpsPage /> },
      { path: 'billing/*', element: <BillingPage /> },
      { path: 'communication/*', element: <CommunicationPage /> },
      { path: 'reviews/*', element: <ReviewsPage /> },
      { path: 'analytics/*', element: <AnalyticsPage /> },
      { path: 'tasks/*', element: <TasksPage /> },
      { path: 'settings/*', element: <SettingsPage /> },
    ],
  },
]);
