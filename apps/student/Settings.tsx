import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Volume2, Mic, Bell, LogOut, Sliders, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { playCue } from '../board/templates/playCue';

interface SettingsProps {
  onBack: () => void;
  onSignOut?: () => void;
}

const PREFS_KEY = 'student-settings';

interface StudentPrefs {
  sound: boolean;
  speaking: boolean;
  notifications: boolean;
  speechSpeed: 'normal' | 'slower';
}

const DEFAULT_PREFS: StudentPrefs = {
  sound: true,
  speaking: true,
  notifications: true,
  speechSpeed: 'normal',
};

const loadPrefs = (): StudentPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* corrupted prefs fall back to defaults */
  }
  return DEFAULT_PREFS;
};

const Settings: React.FC<SettingsProps> = ({ onBack, onSignOut }) => {
  const [toggles, setToggles] = useState<StudentPrefs>(loadPrefs);
  const { t } = useTranslation();
  const { userProfile } = useAppStore();
  const displayName = userProfile?.full_name || userProfile?.email || 'Student';

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(toggles));
    } catch {
      /* storage quota fallback */
    }
  }, [toggles]);

  const toggle = (key: 'sound' | 'speaking' | 'notifications') => {
    setToggles((prev) => {
      const nextVal = !prev[key];
      // Audio cue feedback when sound is toggled ON
      if (key === 'sound' && nextVal) {
        try {
          playCue('correct');
        } catch {
          /* swallow */
        }
      } else if (key !== 'sound' && prev.sound) {
        try {
          playCue('correct');
        } catch {
          /* swallow */
        }
      }
      return { ...prev, [key]: nextVal };
    });
  };

  const setSpeed = (speed: 'normal' | 'slower') => {
    if (toggles.sound) {
      try {
        playCue('correct');
      } catch {
        /* swallow */
      }
    }
    setToggles((prev) => ({ ...prev, speechSpeed: speed }));
  };

  const handleBack = () => {
    if (toggles.sound) {
      try {
        playCue('streak');
      } catch {
        /* swallow */
      }
    }
    onBack();
  };

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito select-none">
      {/* 1. Header (Sticky Paper #FDFBF7 per Stitch 6.html) */}
      <header className="sticky top-0 z-30 bg-[#FDFBF7] px-5 pt-3 pb-3.5 border-b border-[#E2D7C3] flex items-center justify-between shadow-[0_2px_8px_rgba(38,70,83,0.04)]">
        <button
          type="button"
          onClick={handleBack}
          className="w-10 h-10 rounded-2xl bg-[#F7F3E8] border border-[#E2D7C3] flex items-center justify-center text-[#1D3557] shadow-[0_3px_0_#E2D7C3] active:translate-y-[2px] active:shadow-[0_1px_0_#E2D7C3] transition-all cursor-pointer"
          aria-label="Go back"
        >
          <ChevronLeft size={22} strokeWidth={2.75} />
        </button>

        <h1 className="font-wa-display text-[22px] font-bold text-[#1D3557] tracking-tight">
          {t('student.settings', 'Settings')}
        </h1>

        {/* Balanced spacer with status dot */}
        <div className="w-10 h-10 flex items-center justify-center text-[#8C7A68]">
          <div className="w-2.5 h-2.5 rounded-full bg-[#2A9D8F] ring-4 ring-[#2A9D8F]/20" />
        </div>
      </header>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 space-y-4 overscroll-contain">
        {/* 2. Student Account Card (Stitch 6.html — no owl mascot, clean lion/student badge) */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#FDFBF7] rounded-[24px] p-4 border border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] flex items-center justify-between"
        >
          <div className="flex items-center space-x-3.5">
            {/* Student Avatar Tile */}
            <div className="relative w-14 h-14 rounded-2xl bg-[#FFE4D6] border-2 border-[#E2D7C3] flex items-center justify-center shadow-inner overflow-visible">
              <span className="text-3xl">🦁</span>
              <div
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#2A9D8F] border-2 border-white shadow-sm flex items-center justify-center text-[10px] text-white font-black"
                title="Active Student"
              >
                ✓
              </div>
            </div>

            {/* Account Details */}
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-wa-display text-[18px] font-bold text-[#1D3557] leading-tight">
                  {displayName}
                </h2>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
                  Active
                </span>
              </div>
              <p className="text-[13px] font-semibold text-[#8C7A68] mt-0.5">
                {t('student.studentAccount', 'Student Account')} •{' '}
                <span className="text-[#2A9D8F] font-bold">Grade 5</span>
              </p>
            </div>
          </div>

          <span className="text-[12px] font-extrabold text-[#2A9D8F] py-1.5 px-3 rounded-xl bg-[#F7F3E8] border border-[#E2D7C3]/80">
            {t('student.verified', 'Saved')}
          </span>
        </motion.section>

        {/* 3. Audio & Exercise Preferences Section (REAL WIRED CONTROLS — Stitch 6.html) */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#FDFBF7] rounded-[24px] p-4 border border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] space-y-4"
        >
          {/* Section Header */}
          <div className="flex items-center justify-between pb-1 border-b border-[#F7F3E8]">
            <h3 className="text-[11px] font-extrabold text-[#8C7A68] tracking-wider uppercase font-nunito">
              {t('student.audioExercisePrefs', 'Audio & Exercise Preferences')}
            </h3>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#E0F2FE] text-[#0284C7]">
              Live Engine
            </span>
          </div>

          {/* Setting 1: Sound Effects Toggle */}
          <div className="flex items-start justify-between space-x-3 pt-1">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] flex-shrink-0 flex items-center justify-center text-[#0284C7] shadow-sm mt-0.5">
                <Volume2 size={20} />
              </div>
              <div className="flex-1 pr-1">
                <label
                  onClick={() => toggle('sound')}
                  className="font-wa-display text-[16px] font-bold text-[#1D3557] block leading-tight cursor-pointer"
                >
                  {t('student.soundEffects', 'Sound Effects')}
                </label>
                <p className="text-[12.5px] font-medium text-[#8C7A68] leading-snug mt-1">
                  {t('student.soundEffectsDesc', 'Plays celebratory fanfare, click sounds, and audio feedback during lessons.')}
                </p>
              </div>
            </div>

            {/* Tactile Sliding Toggle Switch in Duolingo Pink */}
            <button
              type="button"
              role="switch"
              aria-checked={toggles.sound}
              onClick={() => toggle('sound')}
              className={`flex-shrink-0 relative w-[58px] h-8 p-1 rounded-full cursor-pointer select-none transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#E91E63]/40 ${
                toggles.sound ? 'bg-[#E91E63] shadow-[inset_0_-3px_0_#BE185D]' : 'bg-[#D1C5B2] shadow-[inset_0_-3px_0_#BAAC96]'
              }`}
            >
              <div className="w-full h-full rounded-full flex items-center justify-between px-2 text-[10px] font-black text-white">
                <span className={toggles.sound ? 'opacity-100 ml-0.5' : 'opacity-0'}>ON</span>
                <span className={!toggles.sound ? 'opacity-100 mr-0.5' : 'opacity-0'}>OFF</span>
              </div>
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.22)] flex items-center justify-center transition-transform duration-200 ${
                  toggles.sound ? 'translate-x-[26px]' : 'translate-x-0'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${toggles.sound ? 'bg-[#E91E63]' : 'bg-[#BAAC96]'}`} />
              </div>
            </button>
          </div>

          <div className="h-px bg-[#EAE0D0]/80" />

          {/* Setting 2: Speaking Exercises Toggle */}
          <div className="flex items-start justify-between space-x-3">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-[#F3E8FF] border border-[#E9D5FF] flex-shrink-0 flex items-center justify-center text-[#7E22CE] shadow-sm mt-0.5">
                <Mic size={20} />
              </div>
              <div className="flex-1 pr-1">
                <div className="flex items-center space-x-1.5">
                  <label
                    onClick={() => toggle('speaking')}
                    className="font-wa-display text-[16px] font-bold text-[#1D3557] block leading-tight cursor-pointer"
                  >
                    {t('student.speakingExercises', 'Speaking Exercises')}
                  </label>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-[#F7F3E8] text-[#8C7A68] border border-[#E2D7C3]">
                    Quiet mode
                  </span>
                </div>
                <p className="text-[12.5px] font-medium text-[#8C7A68] leading-snug mt-1">
                  {t('student.speakingExercisesDesc', 'Turn off if in a quiet room or library. Speech tasks will automatically be replaced by listening exercises.')}
                </p>
              </div>
            </div>

            {/* Tactile Sliding Toggle Switch in Duolingo Pink */}
            <button
              type="button"
              role="switch"
              aria-checked={toggles.speaking}
              onClick={() => toggle('speaking')}
              className={`flex-shrink-0 relative w-[58px] h-8 p-1 rounded-full cursor-pointer select-none transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#E91E63]/40 ${
                toggles.speaking ? 'bg-[#E91E63] shadow-[inset_0_-3px_0_#BE185D]' : 'bg-[#D1C5B2] shadow-[inset_0_-3px_0_#BAAC96]'
              }`}
            >
              <div className="w-full h-full rounded-full flex items-center justify-between px-2 text-[10px] font-black text-white">
                <span className={toggles.speaking ? 'opacity-100 ml-0.5' : 'opacity-0'}>ON</span>
                <span className={!toggles.speaking ? 'opacity-100 mr-0.5' : 'opacity-0'}>OFF</span>
              </div>
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.22)] flex items-center justify-center transition-transform duration-200 ${
                  toggles.speaking ? 'translate-x-[26px]' : 'translate-x-0'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${toggles.speaking ? 'bg-[#E91E63]' : 'bg-[#BAAC96]'}`} />
              </div>
            </button>
          </div>

          <div className="h-px bg-[#EAE0D0]/80" />

          {/* Setting 3: Audio Speech Speed (NO OWL MASCOT — clean paper-card speed control) */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[#B45309]">
                  <Sliders size={18} />
                </div>
                <span className="font-wa-display text-[15px] font-bold text-[#1D3557]">
                  {t('student.speechSpeed', 'Lesson Audio Speed')}
                </span>
              </div>
              <span className="text-[11px] font-bold text-[#2A9D8F] bg-[#E6F4EA] px-2 py-0.5 rounded-full">
                Audio Engine
              </span>
            </div>

            {/* Segmented Pill Control */}
            <div className="bg-[#F7F3E8] p-1.5 rounded-2xl border border-[#E2D7C3] flex space-x-1.5">
              <button
                type="button"
                onClick={() => setSpeed('normal')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-wa-display text-[14px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  toggles.speechSpeed === 'normal'
                    ? 'bg-[#2A9D8F] text-white shadow-[0_3px_0_#1E6F5C]'
                    : 'bg-[#F7F3E8] text-[#8C7A68] hover:bg-[#EDE7D7]'
                }`}
              >
                <span>Normal 1.0x</span>
              </button>
              <button
                type="button"
                onClick={() => setSpeed('slower')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-wa-display text-[14px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  toggles.speechSpeed === 'slower'
                    ? 'bg-[#2A9D8F] text-white shadow-[0_3px_0_#1E6F5C]'
                    : 'bg-[#F7F3E8] text-[#8C7A68] hover:bg-[#EDE7D7]'
                }`}
              >
                <span>Slower 0.8x</span>
              </button>
            </div>
          </div>
        </motion.section>

        {/* 4. Notifications & Reminders Section (Stitch 6.html) */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#FDFBF7] rounded-[24px] p-4 border border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] space-y-3"
        >
          <div className="flex items-center justify-between pb-1 border-b border-[#F7F3E8]">
            <h3 className="text-[11px] font-extrabold text-[#8C7A68] tracking-wider uppercase font-nunito">
              {t('student.studyReminders', 'Study Reminders & Streaks')}
            </h3>
            <span className="text-[11px] font-bold text-[#E76F51] flex items-center space-x-1">
              <span>🔥</span>
              <span>Streak Active</span>
            </span>
          </div>

          {/* Setting: Daily Study Reminder Toggle */}
          <div className="flex items-start justify-between space-x-3 pt-1">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-[#FFF7ED] border border-[#FFEDD5] flex-shrink-0 flex items-center justify-center text-[#EA580C] shadow-sm mt-0.5">
                <Bell size={20} />
              </div>
              <div className="flex-1 pr-1">
                <div className="flex items-center space-x-1.5">
                  <label
                    onClick={() => toggle('notifications')}
                    className="font-wa-display text-[16px] font-bold text-[#1D3557] block leading-tight cursor-pointer"
                  >
                    {t('student.dailyReminder', 'Daily Reminder')}
                  </label>
                  <span className="text-[11px] font-extrabold text-[#E76F51] bg-[#FFF2EE] px-1.5 py-0.5 rounded-md border border-[#FCD9D0]">
                    18:00
                  </span>
                </div>
                <p className="text-[12.5px] font-medium text-[#8C7A68] leading-snug mt-1">
                  {t('student.dailyReminderDesc', 'Receive a friendly prompt at 18:00 to keep your streak flame alive.')}
                </p>
              </div>
            </div>

            {/* Tactile Sliding Toggle Switch in Duolingo Pink */}
            <button
              type="button"
              role="switch"
              aria-checked={toggles.notifications}
              onClick={() => toggle('notifications')}
              className={`flex-shrink-0 relative w-[58px] h-8 p-1 rounded-full cursor-pointer select-none transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#E91E63]/40 ${
                toggles.notifications ? 'bg-[#E91E63] shadow-[inset_0_-3px_0_#BE185D]' : 'bg-[#D1C5B2] shadow-[inset_0_-3px_0_#BAAC96]'
              }`}
            >
              <div className="w-full h-full rounded-full flex items-center justify-between px-2 text-[10px] font-black text-white">
                <span className={toggles.notifications ? 'opacity-100 ml-0.5' : 'opacity-0'}>ON</span>
                <span className={!toggles.notifications ? 'opacity-100 mr-0.5' : 'opacity-0'}>OFF</span>
              </div>
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.22)] flex items-center justify-center transition-transform duration-200 ${
                  toggles.notifications ? 'translate-x-[26px]' : 'translate-x-0'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${toggles.notifications ? 'bg-[#E91E63]' : 'bg-[#BAAC96]'}`} />
              </div>
            </button>
          </div>
        </motion.section>

        {/* 5. Sign Out Action Card (Stitch 6.html) */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="pt-1"
        >
          <button
            type="button"
            onClick={onSignOut}
            className="w-full min-h-[52px] py-3.5 px-4 rounded-[22px] bg-[#FEF2F2] border-2 border-[#FCA5A5] text-[#EF4444] font-wa-display text-[16px] font-bold flex items-center justify-center space-x-2 shadow-[0_3px_0_#F87171] active:translate-y-[2px] active:shadow-[0_1px_0_#F87171] transition-all cursor-pointer"
          >
            <LogOut size={20} />
            <span>{t('auth.logout', 'Sign Out of Account')}</span>
          </button>
        </motion.section>

        {/* 6. App Footer Information */}
        <footer className="text-center pt-2 pb-6">
          <p className="text-[12px] font-extrabold text-[#8C7A68] tracking-tight">
            Professor Student v3.2.0 • <span className="text-[#2A9D8F]">Offline Ready ✓</span>
          </p>
          <p className="text-[11px] font-medium text-[#8C7A68]/80 mt-0.5">
            Student ID: {userProfile?.id ? `ESL-${userProfile.id.slice(0, 4).toUpperCase()}` : 'ESL-7729'} • All lesson data cached locally
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Settings;
