
import React, { useState } from 'react';
import { ChevronLeft, ArrowRight, CheckCircle, Loader2, Link2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useConnectParentByToken } from '../../hooks/useQueries';

interface ParentConnectProps {
  onBack: () => void;
}

/** Accepts a claim token OR a full claim link (/claim?t=...) from the teacher. */
function parseToken(input: string): string {
  const trimmed = input.trim();
  try {
    if (/^https?:\/\//i.test(trimmed) && trimmed.includes('t=')) {
      const url = new URL(trimmed);
      return url.searchParams.get('t') || trimmed;
    }
  } catch { /* not a URL — treat as raw token */ }
  // also handle a pasted "?t=abc" fragment
  const m = trimmed.match(/t=([^&\s]+)/);
  return m ? m[1] : trimmed;
}

const ParentConnect: React.FC<ParentConnectProps> = ({ onBack }) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success'>('idle');
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');
  const connectMut = useConnectParentByToken();

  const handleConnect = async () => {
    const token = parseToken(code);
    if (!token) {
      setError('Paste the link or code your teacher shared.');
      return;
    }
    setStatus('verifying');
    setError('');
    try {
      const res = await connectMut.mutateAsync(token);
      if (res === 'already_active') {
        setResultMsg("You're already linked to this student.");
      } else if (res === 'already_pending') {
        setResultMsg('A link request is already waiting for teacher approval.');
      } else {
        setResultMsg('Request sent! The teacher will approve the link shortly.');
      }
      setStatus('success');
    } catch (e: any) {
      setError(e?.message || 'Could not connect. Check the link and try again.');
      setStatus('idle');
    }
  };

  if (status === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="h-full bg-slate-50 flex flex-col font-sans items-center justify-center p-8 text-center"
      >
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}
          className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-500 mb-6"
        >
          <CheckCircle size={48} />
        </motion.div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Request sent</h2>
        <p className="text-slate-500 mb-8 max-w-xs">{resultMsg}</p>
        <button
          onClick={onBack}
          className="w-full bg-cyan-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
        >
          Go to Dashboard
        </button>
      </motion.div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans">
      <header className="px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-20 flex items-center gap-2">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full -ml-2">
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="font-bold text-lg text-slate-800">Add Child</h1>
      </header>

      <div className="flex-1 p-6 flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col items-center justify-center -mt-12"
        >
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Connect to your child</h2>
            <p className="text-slate-500 text-sm max-w-xs mx-auto">
              Paste the claim link your child&apos;s teacher shared (or the code from the student passport).
              The teacher approves the connection.
            </p>
          </div>

          <div className="relative w-full max-w-xs mb-4">
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="Paste link or code"
              className="w-full h-14 text-base font-mono text-center tracking-wide border-2 border-slate-200 rounded-2xl focus:border-cyan-500 focus:outline-none transition-colors text-slate-800 px-3"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}
        </motion.div>

        <button
          onClick={handleConnect}
          disabled={!code.trim() || status === 'verifying' || connectMut.isPending}
          className={`
            w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg
            ${code.trim() ? 'bg-cyan-500 text-white shadow-cyan-200 active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
          `}
        >
          {status === 'verifying' || connectMut.isPending ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <>Request Link <ArrowRight size={20} /></>
          )}
        </button>
        <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-slate-400">
          <Link2 size={13} /> Pending teacher approval before it appears here.
        </div>
      </div>
    </div>
  );
};

export default ParentConnect;
