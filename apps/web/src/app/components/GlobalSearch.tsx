import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, ArrowRight, CalendarClock, Wallet, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useCan } from './HasPermission';

interface SearchHit {
  id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
  phone?: string;
  lastVisit?: string | null;
  nextAppointment?: string | null;
  pendingFollowUps?: number;
  outstandingBalance?: string;
}

const short = (v?: string | null) => (v ? new Date(v).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' }) : null);

/** Header patient search; results are enriched server-side and fields appear only when the user may see them. */
export const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const can = useCan();
  const allowed = can('patients.view');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!allowed || term.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.get(`/patients/search?q=${encodeURIComponent(term)}`);
        if (!cancelled) {
          setResults(res?.data ?? []);
          setActive(-1);
          setIsOpen(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Search failed');
          setResults([]);
          setIsOpen(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, allowed]);

  const select = (patientId: string) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/patients/${patientId}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      select(results[active].id);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  if (!allowed) return null;

  return (
    <div className="relative w-full max-w-xl" ref={searchRef}>
      <div className="group relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#1FA971]" size={18} />
        <input
          type="text"
          placeholder="Search patients (name, phone, ID)…"
          aria-label="Search patients"
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none transition-all focus:border-[#1FA971] focus:bg-white focus:ring-4 focus:ring-[#1FA971]/5"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search">
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-[100] mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="max-h-[420px] overflow-y-auto">
            {error ? (
              <div className="p-4 text-center text-sm text-red-600">{error}</div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No patients found matching “{query}”</div>
            ) : (
              results.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => select(p.id)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 p-3 text-left last:border-0 ${active === i ? 'bg-[#1FA971]/5' : ''}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-500">{p.firstName[0]}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.phone || '—'} · {p.patientCode}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={11} /> Last visit {short(p.lastVisit) ?? 'never'}
                        </span>
                        {p.nextAppointment && (
                          <span className="inline-flex items-center gap-1 text-blue-600">
                            <CalendarClock size={11} /> Next {short(p.nextAppointment)}
                          </span>
                        )}
                        {!!p.pendingFollowUps && <span className="text-amber-600">{p.pendingFollowUps} follow-up(s) due</span>}
                        {p.outstandingBalance !== undefined && Number(p.outstandingBalance) > 0 && (
                          <span className="inline-flex items-center gap-1 font-medium text-red-600">
                            <Wallet size={11} /> {p.outstandingBalance} due
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-slate-300" />
                </button>
              ))
            )}
          </div>
          {results.length > 0 && (
            <div className="border-t bg-slate-50 p-2 text-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate(`/patients?q=${encodeURIComponent(query.trim())}`);
                }}
                className="text-xs font-bold text-[#1FA971] hover:underline"
              >
                View all results
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
