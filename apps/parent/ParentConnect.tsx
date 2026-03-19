
import React, { useState } from 'react';
import { ChevronLeft, QrCode, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ParentConnectProps {
  onBack: () => void;
}

const ParentConnect: React.FC<ParentConnectProps> = ({ onBack }) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'verifying' | 'success'>('idle');

  const handleConnect = () => {
    if (code.length < 6) return;
    setStatus('verifying');
    setTimeout(() => setStatus('success'), 2000);
  };

  const handleScan = () => {
    setStatus('scanning');
    setTimeout(() => {
       setCode('STU-882');
       setStatus('idle');
    }, 2000);
  };

  if (status === 'success') {
     return (
        <motion.div 
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           className="h-full bg-slate-50 flex flex-col font-sans items-center justify-center p-8 text-center"
        >
           <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-500 mb-6"
           >
              <CheckCircle size={48} />
           </motion.div>
           <h2 className="text-2xl font-bold text-slate-800 mb-2">Connected!</h2>
           <p className="text-slate-500 mb-8">You are now linked to Leo's profile.</p>
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
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-20 flex items-center gap-2">
         <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full -ml-2">
           <ChevronLeft size={24} className="text-slate-600" />
         </button>
         <h1 className="font-bold text-lg text-slate-800">Add Child</h1>
      </header>

      {/* Content */}
      <div className="flex-1 p-6 flex flex-col">
         
         <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center -mt-12"
         >
            <div className="mb-8 text-center">
               <h2 className="text-2xl font-bold text-slate-800 mb-2">Enter Student Code</h2>
               <p className="text-slate-500 text-sm max-w-xs mx-auto">
                  Enter the 6-character code provided by the teacher or found on the student passport.
               </p>
            </div>

            {/* Input */}
            <div className="relative w-full max-w-xs mb-8">
               <input 
                  type="text" 
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC-123"
                  maxLength={7}
                  className="w-full h-16 text-3xl font-mono font-bold text-center tracking-[0.2em] uppercase border-2 border-slate-200 rounded-2xl focus:border-cyan-500 focus:outline-none transition-colors text-slate-800"
               />
            </div>

            <div className="flex items-center gap-4 w-full max-w-xs mb-8">
               <div className="h-px bg-slate-200 flex-1"></div>
               <span className="text-xs font-bold text-slate-400 uppercase">Or</span>
               <div className="h-px bg-slate-200 flex-1"></div>
            </div>

            <button 
               onClick={handleScan}
               disabled={status !== 'idle'}
               className="w-full max-w-xs bg-white border-2 border-slate-200 text-slate-700 font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 transition-colors"
            >
               <AnimatePresence mode="wait">
                  {status === 'scanning' ? (
                     <motion.div 
                        key="scanning"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-3"
                     >
                        <Loader2 size={24} className="animate-spin" /> Scanning...
                     </motion.div>
                  ) : (
                     <motion.div 
                        key="idle"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-3"
                     >
                        <QrCode size={24} /> Scan QR Code
                     </motion.div>
                  )}
               </AnimatePresence>
            </button>
         </motion.div>

         {/* Footer Action */}
         <button 
            onClick={handleConnect}
            disabled={code.length < 6 || status === 'verifying'}
            className={`
               w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg
               ${code.length >= 6 ? 'bg-cyan-500 text-white shadow-cyan-200 active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
            `}
         >
            {status === 'verifying' ? (
               <Loader2 size={24} className="animate-spin" />
            ) : (
               <>
                  Connect Profile <ArrowRight size={20} />
               </>
            )}
         </button>

      </div>
    </div>
  );
};

export default ParentConnect;
