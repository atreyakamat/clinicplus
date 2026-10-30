import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Link2Off, Star } from 'lucide-react';

/**
 * Public patient review form (/r/:token). No login: the one-time token in the
 * SMS link is the only credential. Mobile-first.
 */

interface ReviewInfo {
  clinicName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  doctorName?: string | null;
  patientFirstName?: string | null;
  expiresAt: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; info: ReviewInfo }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'done'; clinicName: string };

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`/api/v1/public/reviews/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw Object.assign(new Error(msg || res.statusText || 'Request failed'), { status: res.status });
  }
  return body?.data ?? body;
}

export const ReviewSubmitPage = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    call(encodeURIComponent(token))
      .then((info: ReviewInfo) => !cancelled && setState({ kind: 'ready', info }))
      .catch((err) => !cancelled && setState({ kind: 'error', status: err.status ?? 0, message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accent = (state.kind === 'ready' && state.info.primaryColor) || '#1FA971';

  const submit = async () => {
    if (!rating || state.kind !== 'ready') return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await call(encodeURIComponent(token), {
        method: 'POST',
        body: JSON.stringify({ rating, ...(nps !== null ? { npsScore: nps } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) }),
      });
      setState({ kind: 'done', clinicName: state.info.clinicName });
    } catch (err: any) {
      if (err.status === 409 || err.status === 410 || err.status === 404) {
        setState({ kind: 'error', status: err.status, message: err.message });
      } else {
        setSubmitError(err.message || 'Could not submit your review. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <main className="mx-auto w-full max-w-md">
        {state.kind === 'loading' && (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading…</div>
        )}

        {state.kind === 'error' && <ErrorState status={state.status} message={state.message} />}

        {state.kind === 'done' && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: accent }} />
            <h1 className="text-xl font-semibold">Thank you!</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your feedback helps {state.clinicName} take better care of every patient.
            </p>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <header className="mb-6 text-center">
              {state.info.logoUrl && (
                <img src={state.info.logoUrl} alt="" className="mx-auto mb-3 h-12 w-auto object-contain" />
              )}
              <p className="text-sm font-medium text-slate-500">{state.info.clinicName}</p>
              <h1 className="mt-2 text-xl font-semibold">
                {state.info.patientFirstName ? `Hi ${state.info.patientFirstName}, how` : 'How'} was your visit
                {state.info.doctorName ? ` with ${state.info.doctorName}` : ''}?
              </h1>
            </header>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-6"
            >
              <fieldset>
                <legend className="sr-only">Rating</legend>
                <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = n <= (hover || rating);
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                        aria-pressed={rating === n}
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHover(n)}
                        className="rounded-lg p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      >
                        <Star size={40} className={active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 h-5 text-center text-sm text-slate-500">{RATING_LABELS[hover || rating]}</p>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">
                  How likely are you to recommend us to a friend or family member?
                </legend>
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} out of 10`}
                      aria-pressed={nps === n}
                      onClick={() => setNps(nps === n ? null : n)}
                      className={`h-10 rounded-md border text-sm font-medium transition ${
                        nps === n ? 'border-transparent text-white' : 'border-slate-200 text-slate-700'
                      }`}
                      style={nps === n ? { backgroundColor: accent } : undefined}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
              </fieldset>

              <div>
                <label htmlFor="review-comment" className="mb-2 block text-sm font-medium text-slate-700">
                  Anything you'd like to share? <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base outline-none focus:border-slate-400"
                  placeholder="What went well? What could be better?"
                />
              </div>

              {submitError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={!rating || submitting}
                className="h-12 w-full rounded-xl text-base font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {submitting ? 'Submitting…' : rating ? 'Submit review' : 'Tap a star to rate'}
              </button>
              <p className="text-center text-xs text-slate-400">This link can be used once.</p>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};

const ErrorState = ({ status, message }: { status: number; message: string }) => {
  const used = status === 409;
  const expired = status === 410;
  const Icon = used ? CheckCircle2 : expired ? Clock : Link2Off;
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
      <Icon size={44} className={`mx-auto mb-4 ${used ? 'text-[#1FA971]' : 'text-slate-400'}`} />
      <h1 className="text-xl font-semibold">
        {used ? 'Already submitted' : expired ? 'This link has expired' : status === 404 ? 'Link not found' : 'Something went wrong'}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {used
          ? 'Thank you, we have already received your feedback.'
          : expired
            ? 'Review links are valid for 14 days. Please contact the clinic if you would still like to share feedback.'
            : status === 404
              ? 'Please check that you opened the full link from your message.'
              : message}
      </p>
    </div>
  );
};
