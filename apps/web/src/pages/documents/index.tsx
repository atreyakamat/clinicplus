import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@clinicplus/ui';
import { HasPermission, useCan } from '../../app/components/HasPermission';
import { Empty, Section } from '../patients/shared';
import { DocumentsList, DocumentUploader } from './DocumentsPanel';

export const DocumentsPage = () => {
  const can = useCan();
  const qc = useQueryClient();
  return (
    <div className="space-y-4">
      <PageHeader title="Document vault" description="Lab reports, imaging and other patient files, stored privately and scanned on upload." />
      <div className="grid gap-4 lg:grid-cols-3">
        <HasPermission permission="documents.upload">
          <Section title="Upload document" className="lg:col-span-1">
            <DocumentUploader onUploaded={() => qc.invalidateQueries({ queryKey: ['documents'] })} />
          </Section>
        </HasPermission>
        <div className={can('documents.upload') ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <HasPermission
            permission="documents.view"
            fallback={<Empty title="Upload only" hint="Your role can upload documents but not view the vault." />}
          >
            <DocumentsList />
          </HasPermission>
        </div>
      </div>
    </div>
  );
};
