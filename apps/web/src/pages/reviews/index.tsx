import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, PageHeader, Button } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const ReviewsPage = () => {
  const { data: feedback } = useQuery<any[]>({
    queryKey: ['feedback'],
    queryFn: () => api.get('/feedback'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews & Referrals"
        description="Keep an eye on feedback loops today, with room for a fuller reputation workflow next."
      >
        <Link to="/reviews/feedback">
          <Button size="sm">Open Feedback Inbox</Button>
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Internal Feedback Volume</h3>
          <div className="mt-4 text-4xl font-semibold text-slate-900">{feedback?.length ?? 0}</div>
          <p className="mt-2 text-sm text-slate-500">
            Team-submitted feedback items are flowing into the clinic feedback inbox for review and resolution.
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Referral Workflow</h3>
          <p className="mt-4 text-sm text-slate-500">
            Referral analytics are still light in this build, but the module is no longer a dead end. Use the feedback inbox today and extend referral tracking from here.
          </p>
        </Card>
      </div>
    </div>
  );
};
