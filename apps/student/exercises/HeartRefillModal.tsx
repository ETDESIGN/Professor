import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, X, Sparkles } from 'lucide-react';
import { useStudentGems } from '../../../hooks/useQueries';

interface HeartRefillModalProps {
  studentId: string;
  currentHearts?: number;
  onPracticeReview: () => void | Promise<void>;
  onClose: () => void;
}

export const HeartRefillModal: React.FC<HeartRefillModalProps> = ({
  currentHearts = 0,
  onPracticeReview,
  onClose,
}) => {
  const { t } = useTranslation();
  const { data: gemCount } = useStudentGems();
  const gems = gemCount ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#264653]/65 backdrop-blur-[5px] animate-fadeIn">
      {/* Centered Floating Paper Dialog Card */}
      <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[32px] border-2 border-[#E2D7C3] p-6 shadow-[0_20px_48px_rgba(29,53,87,0.32)] flex flex-col items-center text-center relative overflow-hidden">
        {/* Dismiss Top-Right 'X' Icon Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#F7F3E8] border-2 border-[#E2D7C3] text-[#8C7A68] hover:text-[#264653] flex items-center justify-center shadow-[0_3px_0_#D8CEBB] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer focus:outline-none"
          title="Dismiss and finish session"
        >
          <X size={16} strokeWidth={3} />
        </button>

        {/* Hero Heart Graphic */}
        <div className="relative mt-1 mb-4 flex flex-col items-center">
          {/* Ambient Sparkles */}
          <div className="absolute -top-3 -left-4 text-[#FFC800] text-xl animate-bounce">✨</div>
          <div className="absolute -top-4 -right-3 text-[#E9C46A] text-lg animate-pulse">⭐</div>
          <div className="absolute -bottom-2 -left-3 text-[#2A9D8F] text-sm">✦</div>

          {/* Decorative Badge Container */}
          <div className="px-4 py-3 rounded-2xl bg-gradient-to-b from-[#FFFDF9] to-[#F7F3E8] border-2 border-[#E9C46A] shadow-[0_4px_12px_rgba(233,196,106,0.25)] flex items-center gap-2">
            {/* Slot 1: Currently remaining filled heart */}
            <div className="w-10 h-10 rounded-xl bg-[#FFEAEA] border-2 border-[#FF4B4B] flex items-center justify-center shadow-inner relative">
              <Heart size={24} className="fill-[#FF4B4B] text-[#FF4B4B] filter drop-shadow-[0_2px_3px_rgba(255,75,75,0.3)]" />
              <span className="absolute -top-1.5 -left-1.5 px-1 bg-[#264653] text-[#FDFBF7] font-wa-display text-[9px] font-bold rounded-full leading-none py-0.5 border border-[#FDFBF7]">
                {currentHearts}/5
              </span>
            </div>

            {/* Arrow indicator of restoration */}
            <div className="text-[#E76F51] font-wa-display font-bold text-xs px-0.5">➔</div>

            {/* Pulsing Target Slots 2, 3, 4, 5 (Restoring back to full 5/5) */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#FFF8F0] border border-dashed border-[#F4A261]/60">
              {[2, 3, 4, 5].map((slot) => (
                <div
                  key={slot}
                  className="w-8 h-8 rounded-lg bg-[#FFEFEA] border-2 border-[#FF4B4B]/60 flex items-center justify-center animate-pulse"
                >
                  <Heart size={16} className="fill-[#FF4B4B]/80 text-[#FF4B4B]/80" />
                </div>
              ))}
            </div>
          </div>

          {/* Full health restoration chip */}
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E9C46A]/20 border border-[#E9C46A]/50 text-[#9C7008] font-wa-display font-bold text-[11px] tracking-wide">
            <Sparkles size={13} className="text-[#9C7008]" />
            <span>FULL HEALTH RESTORATION</span>
          </div>
        </div>

        {/* Headline & Child-Friendly Explanation */}
        <h2 className="font-wa-display font-bold text-[22px] leading-tight text-[#1D3557] mb-1.5">
          {t('student.restoreHeartsTitle', 'Restore All Hearts?')}
        </h2>
        <p className="text-[#264653] text-[14px] leading-snug max-w-[290px] font-medium mb-4">
          {t('student.restoreHeartsDesc', 'Refill all 5 hearts right now so you can keep learning and practicing without interruption!')}
        </p>

        {/* Economy Exchange Box */}
        <div className="w-full bg-[#F7F3E8] border-2 border-[#E2D7C3] rounded-2xl p-3.5 mb-5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            {/* Current Gems Balance */}
            <div className="flex items-center gap-1.5 text-left">
              <span className="text-lg">💎</span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8C7A68] leading-none mb-0.5">
                  {t('student.yourGems', 'Your Gems')}
                </p>
                <p className="font-wa-display font-bold text-[16px] text-[#1D3557] leading-none">
                  {gems}
                </p>
              </div>
            </div>

            {/* Divider line */}
            <div className="h-7 w-[1.5px] bg-[#E2D7C3]" />

            {/* Refill Cost */}
            <div className="flex items-center gap-1.5 text-right">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8C7A68] leading-none mb-0.5">
                  {t('student.refillCost', 'Refill Cost')}
                </p>
                <p className="font-wa-display font-bold text-[16px] text-[#E76F51] leading-none">
                  50 💎
                </p>
              </div>
              <div className="w-7 h-7 rounded-full bg-[#FFEFEA] border border-[#E76F51]/30 flex items-center justify-center text-xs">
                🏷️
              </div>
            </div>
          </div>

          {/* Reassuring badge strip */}
          <div className="pt-2 border-t border-[#E2D7C3]/80 flex items-center justify-between px-1">
            <span className="text-[12px] font-bold text-[#2A9D8F] flex items-center gap-1">
              ✓ {t('student.restoresToMax', 'Restores to 5/5 Hearts ❤️')}
            </span>
            <span className="text-[11px] font-extrabold text-[#8C7A68]">
              {gems >= 50 ? `${gems - 50} 💎 left` : '50 💎 needed'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          {/* Button 1: Refill with Gems — Disabled (Coming Soon) per Owner Verdict & Data-Write Discipline */}
          <button
            type="button"
            disabled
            className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-2 bg-[#E76F51]/60 text-[#FDFBF7] font-wa-display font-bold text-[15px] tracking-wide cursor-not-allowed border border-[#C4553B]/30 opacity-75 shadow-none"
            title="Direct gem-spend refill coming soon"
          >
            <span className="text-xl">❤️</span>
            <span>{t('student.refill5Hearts', 'REFILL 5 HEARTS')}</span>
            <span className="px-2 py-0.5 rounded-lg bg-[#C4553B]/50 text-[#FDFBF7] text-xs font-sans font-extrabold border border-[#FDFBF7]/30">
              50 💎
            </span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold uppercase tracking-wider">
              {t('student.comingSoon', 'Coming soon')}
            </span>
          </button>

          {/* Button 2: Free Pedagogical Alternative — Practice in Review (+1 Heart Free) */}
          <button
            type="button"
            onClick={onPracticeReview}
            className="w-full h-[50px] rounded-2xl border-2 border-[#2A9D8F] bg-[#FDFBF7] text-[#2A9D8F] font-wa-display font-bold text-[14px] flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_0_#E2D7C3] hover:bg-[#F0FDF4] active:translate-y-[2px] active:shadow-[0_2px_0_#E2D7C3] transition-all"
          >
            <span className="text-base">🧠</span>
            <span>{t('student.practiceReviewRestore', 'Practice in Review (Earn +1 ❤️ Free)')}</span>
          </button>

          {/* Button 3: Dismiss Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full h-[44px] rounded-xl text-[#8C7A68] hover:text-[#264653] font-bold text-[14px] transition-colors flex items-center justify-center cursor-pointer"
          >
            {t('student.notNowFinish', 'Not now, finish session')}
          </button>
        </div>

        {/* Economy Safety Guarantee Footer */}
        <div className="mt-4 pt-3 border-t border-[#E2D7C3]/60 w-full flex items-center justify-center">
          <p className="text-[11px] font-bold text-[#8C7A68] flex items-center gap-1 leading-tight">
            <span>🔒</span>
            <span>{t('student.noRealMoneyGuarantee', 'Gems are earned purely by learning — no real money, ever.')}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default HeartRefillModal;
