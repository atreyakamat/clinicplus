import React, { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText, Image as ImageIcon, Pencil, Trash2, UploadCloud, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@clinicplus/ui';
import { api } from '../../app/lib/api';
import { useCan } from '../../app/components/HasPermission';
import {
  Empty,
  ErrorBox,
  errorMessage,
  fetchBlobUrl,
  Field,
  fmtDateTime,
  fmtSize,
  fullName,
  getPage,
  inputCls,
  Loading,
  Modal,
  Pager,
  PatientPicker,
  qs,
  unwrap,
  useDebounced,
  type PatientHit,
} from '../patients/shared';

export const DOCUMENT_TYPES = [
  { value: 'LAB_REPORT', label: 'Lab report' },
  { value: 'IMAGING', label: 'Imaging' },
  { value: 'PRESCRIPTION', label: 'Prescription' },
  { value: 'DISCHARGE_SUMMARY', label: 'Discharge summary' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'CONSENT', label: 'Consent form' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'ID_PROOF', label: 'ID proof' },
  { value: 'OTHER', label: 'Other' },
];
const typeLabel = (v: string) => DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? v;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.dcm,application/pdf,image/png,image/jpeg,application/dicom';

interface Doc {
  id: string;
  title: string;
  documentType: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt: string;
  hasFile?: boolean;
  patient?: { id: string; firstName: string; lastName: string; patientCode?: string };
  uploader?: { firstName: string; lastName: string };
}

/** Drag & drop uploader. Works for users with documents.upload only (no listing needed). */
export const DocumentUploader = ({
  patient: fixedPatient,
  consultationId,
  onUploaded,
}: {
  patient?: PatientHit | null;
  consultationId?: string;
  onUploaded?: (doc: any) => void;
}) => {
  const [patient, setPatient] = useState<PatientHit | null>(fixedPatient ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('LAB_REPORT');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPatient(fixedPatient ?? null), [fixedPatient?.id]);

  const pick = (f?: File | null) => {
    if (!f) return;
    setFile(f);
    setDone(null);
    setError(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    if (/\.dcm$/i.test(f.name)) setDocumentType('IMAGING');
  };

  const upload = async () => {
    if (!file || !patient) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('patientId', patient.id);
      form.append('documentType', documentType);
      form.append('title', title.trim() || file.name);
      if (consultationId) form.append('consultationId', consultationId);
      const doc = await unwrap(api.upload('/documents/upload', form));
      setDone(`Uploaded “${doc.title}” (${fmtSize(doc.fileSize)})`);
      setFile(null);
      setTitle('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded?.(doc);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!fixedPatient && (
        <Field label="Patient">
          <PatientPicker value={patient} onChange={setPatient} />
        </Field>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${
          dragging ? 'border-[#1FA971] bg-[#1FA971]/5' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
        }`}
      >
        <UploadCloud className="text-slate-400" size={28} />
        {file ? (
          <span className="font-medium text-slate-700">
            {file.name} · {fmtSize(file.size)}
          </span>
        ) : (
          <span className="text-slate-500">Drop a PDF, PNG, JPEG or DICOM file here, or click to browse</span>
        )}
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Title" className="sm:col-span-2">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorBox error={error} />
      {done && (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> {done}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={upload} disabled={!file || !patient || busy} className="gap-2">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} Upload
        </Button>
      </div>
    </div>
  );
};

/** Preview modal: images and PDFs are rendered from an authenticated blob URL. */
const Preview = ({ doc, onClose }: { doc: Doc; onClose: () => void }) => {
  const [src, setSrc] = useState<{ url: string; type: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let url: string | null = null;
    fetchBlobUrl(`/documents/${doc.id}/download?disposition=inline`)
      .then((r) => {
        url = r.url;
        setSrc(r);
      })
      .catch(setError);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.id]);
  const isImage = doc.mimeType?.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';
  return (
    <Modal title={doc.title} onClose={onClose} wide>
      <ErrorBox error={error} />
      {!src && !error && <Loading label="Loading preview…" />}
      {src && isImage && <img src={src.url} alt={doc.title} className="mx-auto max-h-[75vh] object-contain" />}
      {src && isPdf && <iframe src={src.url} title={doc.title} className="h-[75vh] w-full rounded border" />}
      {src && !isImage && !isPdf && (
        <p className="text-sm text-slate-600">No in-browser preview for {doc.mimeType}. Use Download to open it in a DICOM viewer.</p>
      )}
    </Modal>
  );
};

/** Document list (documents.view) with filters, preview, download, edit and delete. */
export const DocumentsList = ({ patientId, consultationId, compact = false }: { patientId?: string; consultationId?: string; compact?: boolean }) => {
  const can = useCan();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => setPage(1), [type, q, patientId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', { patientId, consultationId, type, q, page }],
    queryFn: () => getPage<Doc>(`/documents${qs({ patientId, consultationId, documentType: type, q, page, limit: compact ? 10 : 20 })}`),
    placeholderData: keepPreviousData,
  });

  const download = async (d: Doc) => {
    setActionError(null);
    try {
      await api.download(`/documents/${d.id}/download`, d.title);
    } catch (e) {
      setActionError(e);
    }
  };
  const remove = async (d: Doc) => {
    if (!window.confirm(`Delete “${d.title}”? The file is permanently removed.`)) return;
    setActionError(null);
    try {
      await api.delete(`/documents/${d.id}`);
      qc.invalidateQueries({ queryKey: ['documents'] });
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={`${inputCls} sm:col-span-2`} placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Document type">
            <option value="">All types</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <ErrorBox error={actionError} />
      {isLoading ? (
        <Loading label="Loading documents…" />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !data?.items.length ? (
        <Empty title="No documents" hint="Uploaded reports and files will appear here." />
      ) : (
        <>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {data.items.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 text-slate-400">{d.mimeType?.startsWith('image/') ? <ImageIcon size={20} /> : <FileText size={20} />}</div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{d.title}</p>
                    <p className="text-xs text-slate-500">
                      {typeLabel(d.documentType)} · {fmtSize(d.fileSize)} · {fmtDateTime(d.uploadedAt)}
                      {d.uploader && ` · by ${fullName(d.uploader)}`}
                    </p>
                    {!patientId && d.patient && (
                      <Link to={`/patients/${d.patient.id}?tab=documents`} className="text-xs text-[#1FA971] hover:underline">
                        {fullName(d.patient)} {d.patient.patientCode}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {d.hasFile !== false && (
                    <>
                      <IconBtn label="Preview" onClick={() => setPreview(d)}>
                        <Eye size={16} />
                      </IconBtn>
                      <IconBtn label="Download" onClick={() => download(d)}>
                        <Download size={16} />
                      </IconBtn>
                    </>
                  )}
                  {can('documents.update') && (
                    <IconBtn label="Edit" onClick={() => setEditing(d)}>
                      <Pencil size={16} />
                    </IconBtn>
                  )}
                  {can('documents.delete') && (
                    <IconBtn label="Delete" onClick={() => remove(d)} danger>
                      <Trash2 size={16} />
                    </IconBtn>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pager meta={data.meta} onPage={setPage} />
        </>
      )}
      {preview && <Preview doc={preview} onClose={() => setPreview(null)} />}
      {editing && <EditDoc doc={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

const IconBtn = ({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 ${
      danger ? 'hover:text-red-600' : 'hover:text-slate-900'
    }`}
  >
    {children}
  </button>
);

const EditDoc = ({ doc, onClose }: { doc: Doc; onClose: () => void }) => {
  const qc = useQueryClient();
  const [title, setTitle] = useState(doc.title);
  const [documentType, setDocumentType] = useState(doc.documentType);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      await api.patch(`/documents/${doc.id}`, { title, documentType });
      qc.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal title="Edit document" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
};
