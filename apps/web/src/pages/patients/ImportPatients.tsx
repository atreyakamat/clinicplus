import React, { useRef, useState } from 'react';
import { ArrowLeft, Download, FileUp, Upload } from 'lucide-react';
import { Button, PageHeader } from '@clinicplus/ui';
import { api, apiErrorMessage, unwrap } from '../../app/lib/api';
import { ErrorBox, Section } from './shared';

type RowStatus = 'created' | 'skipped-duplicate' | 'error';

interface ImportRow {
  row: number;
  status: RowStatus;
  message?: string;
  patientCode?: string;
}

interface ImportResult {
  dryRun: boolean;
  total: number;
  created: number;
  skippedDuplicates: number;
  errors: number;
  rows: ImportRow[];
}

const STATUS_STYLE: Record<RowStatus, string> = {
  created: 'bg-emerald-100 text-emerald-700',
  'skipped-duplicate': 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<RowStatus, string> = {
  created: 'Created',
  'skipped-duplicate': 'Duplicate',
  error: 'Error',
};

/**
 * Bulk patient import: pick a CSV → dry-run preview with per-row results →
 * confirm to insert. Reachable from the patients list; gated by patients.import.
 */
export const ImportPatients = ({ onBack }: { onBack: () => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [imported, setImported] = useState(false);

  const downloadTemplate = async () => {
    setError(null);
    try {
      await api.download('/patients/import/template', 'patient-import-template.csv');
    } catch (e) {
      setError(e);
    }
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? 'preview' : 'import');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const body = await api.upload(`/patients/import${dryRun ? '?dryRun=true' : ''}`, form);
      const res = unwrap<ImportResult>(body);
      setResult(res);
      if (!dryRun) setImported(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const pickFile = (f: File | null) => {
    setFile(f);
    setResult(null);
    setImported(false);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
          <ArrowLeft size={16} /> Patients
        </Button>
      </div>
      <PageHeader title="Import patients" description="Upload a CSV to register many patients at once. Duplicates are skipped automatically." />

      <Section
        title="1. Choose a CSV file"
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
            <Download size={16} /> Download template
          </Button>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#1FA971] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#1A8D5E]"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file && <span className="shrink-0 text-xs text-slate-500">{file.name}</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Columns: firstName, lastName, gender, dateOfBirth (YYYY-MM-DD), phone, email, bloodGroup, address, city, state, country, postalCode. Up to 5000 rows.
        </p>
      </Section>

      <Section title="2. Preview and import">
        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" disabled={!file || busy !== null} onClick={() => run(true)}>
            <FileUp size={16} /> {busy === 'preview' ? 'Checking…' : 'Preview (dry run)'}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!file || busy !== null || !result || result.dryRun === false || imported}
            onClick={() => run(false)}
          >
            <Upload size={16} /> {busy === 'import' ? 'Importing…' : 'Confirm import'}
          </Button>
        </div>
        <ErrorBox error={error} className="mt-3" />
        {result && (
          <p className="mt-3 text-sm text-slate-600">
            {imported ? 'Imported.' : 'Preview only — nothing saved yet.'} Run a preview, review the rows below, then confirm.
          </p>
        )}
      </Section>

      {result && (
        <Section title={imported ? 'Import result' : 'Preview result'}>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total rows" value={result.total} />
            <Stat label={imported ? 'Created' : 'To create'} value={result.created} tone="emerald" />
            <Stat label="Duplicates skipped" value={result.skippedDuplicates} tone="amber" />
            <Stat label="Errors" value={result.errors} tone="red" />
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 w-16">Row</th>
                    <th className="px-3 py-2 w-32">Status</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-slate-500">{r.row}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.patientCode ? r.patientCode : r.message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {imported && (
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={onBack}>Back to patients</Button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'red' }) => {
  const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
};
