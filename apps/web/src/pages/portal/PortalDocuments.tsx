import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { portalApi, portalErrorMessage, unwrap } from './portal.api';
import { Card, PageTitle, QueryState, fmtDate } from './portal.ui';

export function PortalDocuments() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['portal', 'documents'], queryFn: () => portalApi.get('/documents').then(unwrap) });

  const download = async (id: string, title: string) => {
    setDownloading(id);
    setError(null);
    try {
      await portalApi.download(`/documents/${id}/download`, title || 'document');
    } catch (err) {
      setError(portalErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <PageTitle title="Documents" subtitle="Your reports and records" />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <QueryState isLoading={list.isLoading} error={list.error} isEmpty={!(list.data ?? []).length} emptyText="No documents yet.">
        <div className="space-y-2">
          {(list.data ?? []).map((doc: any) => (
            <Card key={doc.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                  <p className="text-xs text-slate-500">{(doc.documentType || '').replace(/_/g, ' ')} · {fmtDate(doc.uploadedAt)}</p>
                </div>
              </div>
              {doc.hasFile && (
                <button
                  onClick={() => download(doc.id, doc.title)}
                  disabled={downloading === doc.id}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-50 shrink-0"
                  aria-label="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
