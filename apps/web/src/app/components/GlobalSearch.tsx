import React, { useState, useEffect, useRef } from 'react';
import { Search, User, X, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.length > 2) {
        setIsLoading(true);
        try {
          const data = await api.get(`/patients/search?q=${query}`);
          setResults(data);
          setIsOpen(true);
        } catch (error) {
          console.error('Search failed', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleSelect = (patientId: string) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/patients/${patientId}`);
  };

  return (
    <div className="relative w-full max-w-xl" ref={searchRef}>
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1FA971] transition-colors" size={18} />
        <input
          type="text"
          placeholder="Global Patient Search (Name, Phone, ID)..."
          className="w-full pl-10 pr-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white focus:border-[#1FA971] focus:ring-4 focus:ring-[#1FA971]/5 transition-all"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length > 2 && setIsOpen(true)}
        />
        {query && (
          <button 
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="p-2 border-b bg-slate-50/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Search Results</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {results.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No patients found matching "{query}"
              </div>
            ) : (
              results.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelect(patient.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-[#1FA971]/5 transition-colors border-b last:border-0 border-slate-50 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold group-hover:bg-[#1FA971]/10 group-hover:text-[#1FA971] transition-colors">
                      {patient.firstName[0]}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-900 group-hover:text-[#1FA971] transition-colors">{patient.firstName} {patient.lastName}</p>
                      <p className="text-xs text-slate-500">{patient.phone} • {patient.patientCode}</p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              ))
            )}
          </div>
          {results.length > 0 && (
            <div className="p-3 bg-slate-50 border-t text-center">
               <button 
                 onClick={() => navigate(`/patients?q=${query}`)}
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
