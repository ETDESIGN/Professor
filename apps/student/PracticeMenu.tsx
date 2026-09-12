// PracticeMenu — Practice Arena Hub with Active Unit Context Banner,
// SRS due badge, and pedagogical tiering (Daily Habit, Skill Studio, Arcade Zone).
// Zero dead "coming soon" cards — all tiles are active and playable.
//
// Redesigned to Wonder Atlas warmth × Duolingo accents per Stitch screens
// 26/1.html (Hub with active unit banner) and 26/2.html (Unit switcher drawer).

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  RotateCcw,
  Headphones,
  Mic,
  BookOpen,
  Zap,
  SpellCheck,
  Dumbbell,
  Sparkles,
  ChevronDown,
  X,
  Check,
  Flame,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Engine } from '../../services/SupabaseService';
import { useSoloSession } from '../../store/SoloSessionContext';

interface PracticeMenuProps {
  onBack: () => void;
  onNavigate: (view: string) => void;
}

const PracticeMenu: React.FC<PracticeMenuProps> = ({ onBack, onNavigate }) => {
  const [srsCount, setSrsCount] = useState(0);
  const [srsError, setSrsError] = useState(false);
  const [showUnitDrawer, setShowUnitDrawer] = useState(false);
  const { t } = useTranslation();
  const { state: solo, setActiveUnit } = useSoloSession();

  const fetchSrs = async () => {
    setSrsError(false);
    try {
      const items = await Engine.fetchSRSItems();
      setSrsCount(items.length);
    } catch {
      setSrsError(true);
    }
  };

  useEffect(() => {
    fetchSrs();
  }, []);

  const activeUnit = useMemo(() => {
    return solo.activeUnit || (solo.units && solo.units.length > 0 ? solo.units[0] : null);
  }, [solo.activeUnit, solo.units]);

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none relative overflow-hidden">
      {/* Universal 64px Header */}
      <header className="h-16 w-full bg-[#FDFBF7] border-b-2 border-[#E2D7C3] px-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="w-11 h-11 rounded-2xl bg-[#F7F3EB] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] flex items-center justify-center text-[#1D3557] hover:bg-[#EAE0D0] active:translate-y-0.5 transition-all"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="text-center flex-1 px-2">
          <h1 className="font-fredoka font-bold text-[19px] leading-tight text-[#1D3557]">
            {t('student.practiceArena', 'Practice Arena')}
          </h1>
          <p className="text-[11px] font-bold text-[#264653]/70 uppercase tracking-wider -mt-0.5">
            Voluntary Skill Training
          </p>
        </div>

        <div className="h-10 px-3 bg-amber-50 border-2 border-amber-200/90 rounded-2xl flex items-center gap-1.5 shadow-sm">
          <Flame size={16} className="text-[#E76F51]" />
          <span className="font-fredoka font-bold text-xs text-[#E76F51]">Daily</span>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4 pb-12">
        {/* Active Unit Context Banner */}
        <div className="bg-[#FDFBF7] rounded-[24px] p-4 border-[2.5px] border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-fredoka font-black uppercase px-2 py-0.5 rounded bg-[#2A9D8F]/15 text-[#1E6F5C]">
                Active Practice Unit
              </span>
              <h2 className="font-fredoka font-bold text-[16px] text-[#1D3557] mt-1 truncate">
                {activeUnit ? activeUnit.title : 'No unit selected'}
              </h2>
              <p className="text-[11px] font-bold text-[#264653]/60 mt-0.5">
                {activeUnit?.topic ? `${activeUnit.topic} • ` : ''}Phonics, Reading & Speaking target
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowUnitDrawer(true)}
              className="px-3.5 py-2 bg-[#E9C46A] hover:bg-[#dfba5f] text-[#1D3557] font-fredoka font-bold text-xs rounded-xl shadow-[0_2.5px_0_#C99E32] active:translate-y-0.5 transition-all flex items-center gap-1 shrink-0"
            >
              <span>Change Unit</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Daily Training Goal Incentive */}
        <div className="bg-[#FFF8E7] border-2 border-amber-200 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 shadow-xs">
          <span className="text-xl">⚡</span>
          <p className="text-xs font-bold text-amber-900 leading-tight">
            <strong>Daily Goal:</strong> Practice 2 skills today to reinforce memory retention!
          </p>
        </div>

        {/* TIER 1: Daily Habit */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[12px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/80">
              🌿 1. Daily Habit
            </span>
            <span className="text-[10px] font-bold text-[#264653]/60 uppercase">Memory & Ear Training</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Tile 1: Daily Review (SRS) */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('srs')}
              className="bg-[#FDFBF7] p-4 rounded-[22px] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] hover:border-[#E76F51] transition-all text-left flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 bg-orange-100 text-[#E76F51] rounded-2xl flex items-center justify-center border border-orange-200">
                  <RotateCcw size={24} />
                </div>
                {srsCount > 0 ? (
                  <span className="px-2 py-0.5 bg-[#FF4B4B] text-white font-fredoka font-bold text-[11px] rounded-full shadow-xs animate-pulse">
                    🚨 {srsCount} Due
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-emerald-100 text-[#1E6F5C] font-fredoka font-bold text-[10px] rounded-full">
                    ✓ Clean
                  </span>
                )}
              </div>

              <div>
                <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] leading-tight">
                  Daily Review
                </h3>
                <p className="text-[11px] text-[#264653]/65 font-medium mt-0.5">
                  Spaced Repetition
                </p>
              </div>
            </motion.button>

            {/* Tile 2: Phonics Sound Lab */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('phonics')}
              className="bg-[#FDFBF7] p-4 rounded-[22px] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] hover:border-[#1CB0F6] transition-all text-left flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 bg-sky-100 text-[#1CB0F6] rounded-2xl flex items-center justify-center border border-sky-200">
                  <Headphones size={24} />
                </div>
                <span className="px-2 py-0.5 bg-sky-100 text-[#0284C7] font-fredoka font-bold text-[10px] rounded-full">
                  Acoustic
                </span>
              </div>

              <div>
                <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] leading-tight">
                  Phonics Lab
                </h3>
                <p className="text-[11px] text-[#264653]/65 font-medium mt-0.5">
                  Minimal Pairs
                </p>
              </div>
            </motion.button>
          </div>
        </div>

        {/* TIER 2: Skill Studio */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[12px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/80">
              🎙️ 2. Skill Studio
            </span>
            <span className="text-[10px] font-bold text-[#264653]/60 uppercase">Literacy & Speaking</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Tile 3: Speaking Coach */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('pronounce')}
              className="bg-[#FDFBF7] p-4 rounded-[22px] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] hover:border-[#E91E63] transition-all text-left flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 bg-pink-100 text-[#E91E63] rounded-2xl flex items-center justify-center border border-pink-200">
                  <Mic size={24} />
                </div>
                <span className="px-2 py-0.5 bg-pink-100 text-[#BE185D] font-fredoka font-bold text-[10px] rounded-full">
                  Voice
                </span>
              </div>

              <div>
                <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] leading-tight">
                  Speaking Coach
                </h3>
                <p className="text-[11px] text-[#264653]/65 font-medium mt-0.5">
                  Pronunciation
                </p>
              </div>
            </motion.button>

            {/* Tile 4: Story Reader */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('reading')}
              className="bg-[#FDFBF7] p-4 rounded-[22px] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] hover:border-[#2A9D8F] transition-all text-left flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 bg-emerald-100 text-[#2A9D8F] rounded-2xl flex items-center justify-center border border-emerald-200">
                  <BookOpen size={24} />
                </div>
                <span className="px-2 py-0.5 bg-emerald-100 text-[#1E6F5C] font-fredoka font-bold text-[10px] rounded-full">
                  Story
                </span>
              </div>

              <div>
                <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] leading-tight">
                  Reading Reader
                </h3>
                <p className="text-[11px] text-[#264653]/65 font-medium mt-0.5">
                  Illustrated Stories
                </p>
              </div>
            </motion.button>
          </div>
        </div>

        {/* TIER 3: Arcade Zone */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[12px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/80">
              ⚡ 3. Arcade Zone
            </span>
            <span className="text-[10px] font-bold text-[#264653]/60 uppercase">Speed & Reflexes</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Tile 5: Fast Vocab */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('fast-vocab')}
              className="bg-[#FDFBF7] p-4 rounded-[22px] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] hover:border-amber-400 transition-all text-left flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 bg-amber-100 text-[#D87A29] rounded-2xl flex items-center justify-center border border-amber-200">
                  <Zap size={24} />
                </div>
                <span className="px-2 py-0.5 bg-amber-100 text-[#D87A29] font-fredoka font-bold text-[10px] rounded-full">
                  Arcade
                </span>
              </div>

              <div>
                <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] leading-tight">
                  Fast Vocab
                </h3>
                <p className="text-[11px] text-[#264653]/65 font-medium mt-0.5">
                  Lightning Match
                </p>
              </div>
            </motion.button>

            {/* Tile 6: Spelling Bee */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('spelling-bee')}
              className="bg-[#FDFBF7] p-4 rounded-[22px] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] hover:border-amber-400 transition-all text-left flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 bg-yellow-100 text-[#CCA047] rounded-2xl flex items-center justify-center border border-yellow-200">
                  <SpellCheck size={24} />
                </div>
                <span className="px-2 py-0.5 bg-yellow-100 text-[#A67C1E] font-fredoka font-bold text-[10px] rounded-full">
                  15s Clocks
                </span>
              </div>

              <div>
                <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] leading-tight">
                  Spelling Bee
                </h3>
                <p className="text-[11px] text-[#264653]/65 font-medium mt-0.5">
                  Sudden Death Solo
                </p>
              </div>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Unit Switcher Modal Drawer (Stitch Screen 2) */}
      <AnimatePresence>
        {showUnitDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex flex-col justify-end"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="bg-[#FDFBF7] rounded-t-[32px] border-t-[3px] border-[#E2D7C3] max-h-[75vh] flex flex-col p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E2D7C3]">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📚</span>
                  <div>
                    <h3 className="font-fredoka font-bold text-base text-[#1D3557]">
                      Select Practice Unit
                    </h3>
                    <p className="text-[11px] text-[#264653]/60 font-semibold">
                      Sets active unit for Phonics, Reading & Speaking
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUnitDrawer(false)}
                  className="w-9 h-9 rounded-xl bg-[#F7F3EB] flex items-center justify-center text-[#1D3557]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-2">
                {(solo.units || []).map((u) => {
                  const isSelected = activeUnit?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        void setActiveUnit(u.id);
                        setShowUnitDrawer(false);
                      }}
                      className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#E6F4F1] border-[#2A9D8F] shadow-[0_3px_0_#1E6F5C]'
                          : 'bg-[#FDFBF7] border-[#E2D7C3] hover:bg-[#F7F3EB]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <h4 className="font-fredoka font-bold text-sm text-[#1D3557] truncate">
                          {u.title}
                        </h4>
                        <p className="text-[11px] text-[#264653]/70 font-semibold">
                          {u.topic || 'Curriculum Deck'}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="px-2.5 py-1 bg-[#2A9D8F] text-white font-fredoka font-bold text-xs rounded-xl shadow-xs shrink-0">
                          Active ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowUnitDrawer(false)}
                className="w-full py-3 bg-[#2A9D8F] text-white font-fredoka font-bold text-sm rounded-2xl shadow-[0_3px_0_#1E6F5C] mt-2"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PracticeMenu;
