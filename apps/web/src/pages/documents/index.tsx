import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBadge2, ExternalLink } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@clinicplus/ui';
import { api } from '../../app/lib/api';

export const DocumentsPage = () => {
  const { data: documents, isLoading } = useQuery<any[]>({
    queryKey: ['documents'],
    queryFn: () => api.get('/documents'),
  });

  if (isLoading) {
    return <div className="p-6 text-slate-500">Loading documents...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Vault"
        description="Browse patient uploads, lab reports, and supporting files captured by the clinic."
      />

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-6 py-4">Document</th>
              <th className="px-6 py-4">Patient</th>
              <th className="px-6 py-4">Uploaded By</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4 text-right">File</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!documents?.length ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No documents have been uploaded yet.
                </td>
              </tr>
            ) : (
              documents.map((document) => (
                <tr key={document.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-[#1FA971]/10 p-2 text-[#1FA971]">
                        <FileBadge2 size={16} />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{document.title}</div>
                        <div className="text-xs text-slate-500">{new Date(document.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {document.patient?.firstName} {document.patient?.lastName}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {document.uploader?.firstName} {document.uploader?.lastName}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline">{document.documentType}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a href={document.fileUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="gap-2">
                        Open <ExternalLink size={14} />
                      </Button>
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
