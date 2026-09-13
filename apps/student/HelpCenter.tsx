import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Search, HelpCircle, ChevronDown, Compass, Lock, Volume2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playCue } from '../board/templates/playCue';

interface HelpCenterProps {
  onBack: () => void;
}

interface FaqItem {
  id: string;
  tag: string;
  q: string;
  a: string;
  pills?: { label: string; color: string }[];
}

const HelpCenter: React.FC<HelpCenterProps> = ({ onBack }) => {
  const [openFaq, setOpenFaq] = useState<string | null>('xp');
  const [query, setQuery] = useState('');
  const { t } = useTranslation();

  const playSound = (cue: 'streak' | 'correct' | 'win') => {
    try {
      const raw = localStorage.getItem('student-settings');
      if (raw && JSON.parse(raw).sound === false) return;
      playCue(cue);
    } catch {
      /* swallow */
    }
  };

  const faqs: FaqItem[] = [
    {
      id: 'xp',
      tag: 'Q1',
      q: t('student.faqXpQ', 'How do I earn XP and Gems?'),
      a: t(
        'student.faqXpA',
        'You earn XP by completing lesson steps (+15 XP), finishing speed quizzes, and keeping your daily streak alive. Gems are awarded when you complete 5-star lessons and claim daily quests!'
      ),
      pills: [
        { label: '⚡ +15 XP per step', color: 'bg-[#E76F51]/10 text-[#E76F51] border-[#E76F51]/30' },
        { label: '💎 +20 Gems quests', color: 'bg-[#1CB0F6]/10 text-[#0284C7] border-[#1CB0F6]/30' },
      ],
    },
    {
      id: 'offline',
      tag: 'Q2',
      q: t('student.faqOfflineQ', 'Can I practice offline without internet?'),
      a: t(
        'student.faqOfflineA',
        'Yes! Once you open a unit, it is saved to your device for 24 hours. You can continue your practice anywhere even without an active internet connection.'
      ),
    },
    {
      id: 'streak',
      tag: 'Q3',
      q: t('student.faqStreakQ', 'I lost my streak! How do I repair it?'),
      a: t(
        'student.faqStreakA',
        "Don't worry! You can use a Streak Freeze from the shop to repair it, or complete today's lesson before midnight to keep your flame blazing."
      ),
    },
    {
      id: 'password',
      tag: 'Q4',
      q: t('student.faqPasswordQ', 'How do I reset my student PIN or password?'),
      a: t(
        'student.faqPasswordA',
        'Ask your teacher or parent to help you reset your PIN from their dashboard. All your progress, stars, and gems will remain completely safe.'
      ),
    },
  ];

  const visibleFaqs = faqs.filter(
    (faq) =>
      faq.q.toLowerCase().includes(query.trim().toLowerCase()) ||
      faq.a.toLowerCase().includes(query.trim().toLowerCase())
  );

  const toggleFaq = (id: string) => {
    playSound('correct');
    setOpenFaq((prev) => (prev === id ? null : id));
  };

  const handleBack = () => {
    playSound('streak');
    onBack();
  };

  const handleTour = () => {
    playSound('win');
    window.location.href = '/onboarding/student';
  };

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito select-none">
      {/* 1. Top Sticky Bar (Header per Stitch 7.html) */}
      <header className="sticky top-0 z-30 bg-[#FDFBF7] px-4 py-2.5 border-b border-[#E2D7C3] flex items-center justify-between shadow-[0_2px_8px_rgba(38,70,83,0.04)]">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          className="w-10 h-10 rounded-2xl bg-[#F7F3E8] border border-[#E2D7C3] flex items-center justify-center text-[#1D3557] shadow-[0_3px_0_#E2D7C3] active:translate-y-[2px] active:shadow-[0_1px_0_#E2D7C3] transition-all cursor-pointer"
        >
          <ChevronLeft size={22} strokeWidth={2.75} />
        </button>

        <h1 className="font-wa-display text-xl font-bold text-[#1D3557] tracking-wide text-center">
          {t('student.helpCenter', 'Help Center')}
        </h1>

        {/* Audio feedback cue button */}
        <div className="w-10 h-10 rounded-2xl bg-[#F7F3E8] border border-[#E2D7C3] flex items-center justify-center text-[#2A9D8F] shadow-[0_3px_0_#E2D7C3]">
          <Volume2 size={18} />
        </div>
      </header>

      {/* Scrollable Main Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-8 space-y-4 overscroll-contain">
        {/* 2. Friendly Hero Banner (NO OWL MASCOT per owner directive — clean paper-card with Lucide icon) */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-b from-[#F7F3E8] to-[#FFFDF9] rounded-3xl p-4 border border-[#E2D7C3] shadow-[0_3px_0_#D8CDBC] flex items-center gap-3.5 relative overflow-hidden"
        >
          <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-[#E8F4F2] rounded-2xl border-2 border-[#2A9D8F]/30" />
            <HelpCircle size={32} className="relative z-10 text-[#2A9D8F]" />
          </div>

          <div className="flex-1 pr-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#2A9D8F]/15 text-[#2A9D8F] text-[11px] font-extrabold uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F]" />
              {t('student.studentGuide', 'Student Guide')}
            </div>
            <h2 className="font-wa-display text-[20px] leading-tight font-bold text-[#1D3557]">
              {t('student.howCanWeHelp', 'How can we help?')}
            </h2>
            <p className="text-[12.5px] font-semibold text-[#8C7A68] leading-snug mt-0.5">
              {t('student.helpSubtitle', 'Find quick answers or take an interactive tour.')}
            </p>
          </div>
        </motion.section>

        {/* 3. Search Input Card (Stitch 7.html) */}
        <section className="relative">
          <div className="bg-[#FDFBF7] rounded-2xl border-2 border-[#E2D7C3] shadow-[0_3px_0_#D8CDBC] flex items-center px-3.5 py-2.5 focus-within:border-[#2A9D8F] focus-within:ring-2 focus-within:ring-[#2A9D8F]/20 transition-all">
            <Search className="w-5 h-5 text-[#8C7A68] shrink-0 mr-2.5" strokeWidth={2.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('student.searchHelp', 'Search help articles (e.g. XP, offline, streak)...')}
              className="w-full bg-transparent text-[13.5px] font-semibold text-[#264653] placeholder-[#8C7A68]/70 focus:outline-none tracking-tight"
            />
          </div>
        </section>

        {/* 4. Interactive App Tour Card (Stitch 7.html) */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#EEF2FF] rounded-3xl border-2 border-[#C7D2FE] shadow-[0_4px_0_#C7D2FE] p-4 relative overflow-hidden"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-[#C7D2FE] shadow-sm flex items-center justify-center text-2xl shrink-0">
              <Compass size={24} className="text-[#4F46E5]" />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-wa-display text-[17px] font-bold text-[#1E1B4B] tracking-wide">
                  {t('student.takeTour', 'Take the App Tour')}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[#4F46E5] text-white font-extrabold text-[10px] tracking-wider uppercase">
                  1 Min
                </span>
              </div>
              <p className="text-[12.5px] font-bold text-[#4338CA] leading-snug">
                {t('student.takeTourHint', 'See how lessons, star ratings, and avatar rewards work in 1 minute!')}
              </p>
            </div>
          </div>

          <div className="mt-3.5 pt-2 border-t border-[#C7D2FE]/60 flex justify-end">
            <button
              type="button"
              onClick={handleTour}
              className="w-full py-2.5 px-4 rounded-2xl bg-[#4F46E5] shadow-[0_4px_0_#3730A3] active:translate-y-[2px] active:shadow-[0_1px_0_#3730A3] text-white font-wa-display font-bold text-[15px] tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>{t('student.startTour', 'Start Tour')}</span>
              <span className="text-base">→</span>
            </button>
          </div>
        </motion.section>

        {/* 5. Frequently Asked Questions (Interactive Accordions — Stitch 7.html) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1 pt-1">
            <h3 className="font-wa-display text-[17px] font-bold text-[#1D3557] flex items-center gap-2">
              <span>{t('student.faq', 'Frequently Asked Questions')}</span>
              <span className="text-xs font-bold text-[#8C7A68] bg-[#F7F3E8] px-2 py-0.5 rounded-full border border-[#E2D7C3]">
                {visibleFaqs.length}
              </span>
            </h3>
            <span className="text-[11px] font-extrabold text-[#2A9D8F] tracking-wide uppercase">
              All Topics
            </span>
          </div>

          {visibleFaqs.length === 0 && (
            <div className="bg-[#FDFBF7] p-6 rounded-2xl border-2 border-[#E2D7C3] text-center text-[#8C7A68] text-sm font-semibold">
              {t('student.noHelpMatch', { defaultValue: 'No articles match "{{q}}".', q: query })}
            </div>
          )}

          {visibleFaqs.map((faq) => {
            const isOpen = openFaq === faq.id;
            return (
              <article
                key={faq.id}
                className={`bg-[#FDFBF7] rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
                  isOpen
                    ? 'border-[#2A9D8F] shadow-[0_3px_0_#1E6F5C]'
                    : 'border-[#E2D7C3] shadow-[0_3px_0_#D8CDBC] hover:border-[#8C7A68]/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(faq.id)}
                  className={`w-full text-left p-3.5 flex items-center justify-between gap-3 transition cursor-pointer ${
                    isOpen ? 'bg-[#2A9D8F]/10' : 'hover:bg-[#F7F3E8]'
                  }`}
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                        isOpen ? 'bg-[#2A9D8F] text-white' : 'bg-[#8C7A68]/20 text-[#264653]'
                      }`}
                    >
                      {faq.tag}
                    </span>
                    <span className="font-wa-display text-[14.5px] font-bold text-[#1D3557] leading-snug">
                      {faq.q}
                    </span>
                  </div>

                  <div
                    className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen
                        ? 'bg-white border-[#2A9D8F]/30 text-[#2A9D8F] rotate-180'
                        : 'bg-[#F7F3E8] border-[#E2D7C3] text-[#8C7A68]'
                    }`}
                  >
                    <ChevronDown size={16} strokeWidth={2.5} />
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="p-3.5 pt-2.5 bg-[#FDFBF7] border-t border-[#2A9D8F]/20 text-[13px] font-semibold text-[#264653] leading-relaxed space-y-2 overflow-hidden"
                    >
                      <p>{faq.a}</p>
                      {faq.pills && (
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          {faq.pills.map((pill, idx) => (
                            <div
                              key={idx}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11.5px] font-bold ${pill.color}`}
                            >
                              {pill.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </article>
            );
          })}
        </section>

        {/* 6. Parent & Teacher Help Note (Stitch 7.html) */}
        <section className="bg-[#F7F3E8] rounded-2xl border border-[#E2D7C3] p-3.5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white border border-[#E2D7C3] flex items-center justify-center text-[#E76F51] shrink-0 shadow-xs">
            <Lock size={18} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h4 className="font-wa-display text-[13.5px] font-bold text-[#1D3557]">
                Parent & Teacher Portal
              </h4>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#8C7A68] bg-white px-1.5 py-0.2 rounded border border-[#E2D7C3]">
                Protected
              </span>
            </div>
            <p className="text-[12px] font-semibold text-[#8C7A68] leading-relaxed">
              Need to change your class or account settings? Ask your teacher or parent to open their dashboard.
            </p>
          </div>
        </section>

        {/* 7. Reassuring Support Footer (NO OWL MASCOT — clean prompt) */}
        <div className="pt-1 pb-4 text-center">
          <p className="text-[12px] font-bold text-[#8C7A68]">
            Still stuck? Ask your teacher or parent for help anytime.
          </p>
        </div>
      </main>
    </div>
  );
};

export default HelpCenter;