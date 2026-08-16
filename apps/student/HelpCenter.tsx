import React, { useState } from 'react';
import { ChevronLeft, Search, HelpCircle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HelpCenterProps {
  onBack: () => void;
}

const HelpCenter: React.FC<HelpCenterProps> = ({ onBack }) => {
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const faqs = [
    { id: 'xp', q: "How do I earn XP?", a: "You earn XP by completing lessons, winning class games, and keeping your daily streak alive!" },
    { id: 'offline', q: "Can I learn offline?", a: "Yes! Once you open a unit, it is saved to your device for 24 hours." },
    { id: 'streak', q: "I lost my streak!", a: "Don't worry! You can use a Streak Freeze from the shop to repair it." },
    { id: 'password', q: "How do I reset my password?", a: "Ask your teacher or parent to help you reset your PIN from their dashboard." }
  ];

  const visibleFaqs = faqs.filter(faq =>
    faq.q.toLowerCase().includes(query.trim().toLowerCase()) ||
    faq.a.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center gap-4">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
           <ChevronLeft size={24} />
        </button>
        <span className="font-bold text-slate-800">Help Center</span>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
         
         {/* Hero */}
         <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-duo-green/10 text-duo-green rounded-2xl flex items-center justify-center mx-auto mb-4">
               <HelpCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">How can we help?</h1>
            <p className="text-slate-500">Search the answers below.</p>
         </div>

         {/* Search */}
         <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
               type="text"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               placeholder="Search help articles..."
               className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-duo-green focus:outline-none font-medium text-slate-700 placeholder:text-slate-400 transition-colors"
            />
         </div>

         {/* FAQ */}
         <div>
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
               <span className="w-1 h-4 bg-duo-yellow rounded-full"></span>
               Frequently Asked
            </h3>
            <div className="space-y-3">
               {visibleFaqs.length === 0 && (
                  <div className="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
                     No articles match "{query}".
                  </div>
               )}
               {visibleFaqs.map((faq, index) => (
                  <motion.div 
                     key={faq.id} 
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: index * 0.1 }}
                     className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                  >
                     <button 
                        onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                     >
                        <span className="font-bold text-slate-700">{faq.q}</span>
                        <ChevronDown 
                           size={20} 
                           className={`text-slate-400 transition-transform duration-300 ${openFaq === faq.id ? 'rotate-180' : ''}`} 
                        />
                     </button>
                     <AnimatePresence>
                        {openFaq === faq.id && (
                           <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="px-4 pb-4 text-slate-600 text-sm leading-relaxed border-t border-slate-50 pt-3 overflow-hidden"
                           >
                              {faq.a}
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </motion.div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default HelpCenter;