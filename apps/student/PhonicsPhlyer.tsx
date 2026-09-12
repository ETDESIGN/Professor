// PhonicsPhlyer — Phonics Sound Lab (minimal-pair acoustic discrimination).
// Pool-driven via the MINIMAL_PAIR_SWIPE exercise engine.
//
// Cold-launch fix: reads units from SoloSessionContext (state.units) and defaults
// to the active unit or first available unit, with a unit selector lobby so the
// child is never dead-ended by an empty activeUnit.
//
// Redesigned to Wonder Atlas warmth × Duolingo accents per Stitch screens
// 22/1.html (Lobby with unit switcher & phoneme contrast preview) and 22/2.html (Acoustic play).

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Headphones, Loader2, Volume2, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';
import { toPoolItem } from '../../types/exercise';
import { playCue } from '../board/templates/playCue';
import { playAudioUrl } from '../../services/SpeechService';
import ExerciseRunner, { RunnerResult } from './exercises/ExerciseRunner';

interface PhonicsPhlyerProps {
  onBack: () => void;
}

const SAMPLE_CONTRASTS = [
  { pair: '/iː/ vs /ɪ/', wordA: 'sheep', wordB: 'ship' },
  { pair: '/l/ vs /r/', wordA: 'light', wordB: 'right' },
  { pair: '/b/ vs /v/', wordA: 'berry', wordB: 'very' },
  { pair: '/s/ vs /θ/', wordA: 'sink', wordB: 'think' },
];

const PhonicsPhlyer: React.FC<PhonicsPhlyerProps> = ({ onBack }) => {
  const { state: solo } = useSoloSession();
  const [studentId, setStudentId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
    return solo.activeUnit?.id || (solo.units && solo.units.length > 0 ? solo.units[0].id : '');
  });
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);

  // Sync selectedUnitId if solo.activeUnit arrives later
  useEffect(() => {
    if (!selectedUnitId && solo.activeUnit?.id) {
      setSelectedUnitId(solo.activeUnit.id);
    } else if (!selectedUnitId && solo.units && solo.units.length > 0) {
      setSelectedUnitId(solo.units[0].id);
    }
  }, [solo.activeUnit, solo.units, selectedUnitId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setStudentId(user.id);
    }).catch(() => {});
  }, []);

  // Fetch minimal pair pool items for the chosen unit
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!selectedUnitId) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('pool_items')
        .select('*')
        .eq('unit_id', selectedUnitId)
        .eq('exercise_type', 'MINIMAL_PAIR_SWIPE');
      if (cancelled) return;
      if (!error && data) {
        setItems(data.map(toPoolItem).filter((p) => p !== null));
      } else {
        setItems([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUnitId]);

  const activeUnit = useMemo(() => {
    return solo.units?.find((u) => u.id === selectedUnitId) || solo.activeUnit || null;
  }, [solo.units, solo.activeUnit, selectedUnitId]);

  const unitTitle = activeUnit?.title || 'Phonics Sound Lab';

  if (!studentId) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#1D3557] font-nunito p-6">
        <Loader2 className="animate-spin mb-3 text-[#2A9D8F]" size={32} />
        <span className="font-fredoka font-bold text-base">Signing you in…</span>
      </div>
    );
  }

  // If in active exercise run, delegate to ExerciseRunner
  if (playing && items.length > 0) {
    return (
      <div className="h-full bg-[#EAE0D0]">
        <ExerciseRunner
          items={items}
          studentId={studentId}
          unitId={selectedUnitId}
          title={`Phonics — ${unitTitle}`}
          onExit={() => setPlaying(false)}
          onDone={(_r: RunnerResult) => onBack()}
        />
      </div>
    );
  }

  // ── Phonics Sound Lab Lobby (Stitch Screen 1) ──────────────────────────
  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none">
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
            Phonics Sound Lab
          </h1>
          <p className="text-[11px] font-bold text-[#264653]/70 uppercase tracking-wider -mt-0.5">
            Acoustic Discrimination
          </p>
        </div>

        <div className="w-11 h-11 rounded-2xl bg-sky-50 border-2 border-sky-200/90 flex items-center justify-center text-[#1CB0F6] shadow-sm">
          <Headphones size={22} />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Active Unit Context Card */}
        <div className="bg-[#FDFBF7] rounded-[24px] p-4 border-[2.5px] border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-fredoka font-extrabold uppercase px-2 py-0.5 rounded bg-[#2A9D8F]/15 text-[#1E6F5C]">
                Active Sound Deck
              </span>
              <h2 className="font-fredoka font-bold text-[17px] text-[#1D3557] mt-1 leading-snug">
                {unitTitle}
              </h2>
              <p className="text-xs font-semibold text-[#264653]/70 mt-0.5">
                {loading ? 'Checking audio pairs…' : `${items.length} Minimal-Pair Swipes Ready`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowUnitPicker(!showUnitPicker)}
              className="px-3 py-1.5 rounded-xl bg-[#E9C46A] hover:bg-[#dfba5f] text-[#1D3557] font-fredoka font-bold text-xs shadow-[0_2px_0_#C99E32] active:translate-y-0.5 transition-all shrink-0"
            >
              {showUnitPicker ? 'Hide ▴' : 'Switch Deck ▾'}
            </button>
          </div>

          {/* Unit Switcher Drawer */}
          {showUnitPicker && (
            <div className="mt-3 pt-3 border-t border-[#E2D7C3] space-y-2">
              <p className="text-[11px] font-bold text-[#264653]/60 uppercase tracking-wider font-fredoka">
                Choose Curriculum Unit:
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {(solo.units || []).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUnitId(u.id);
                      setShowUnitPicker(false);
                    }}
                    className={`w-full p-2 rounded-xl text-left text-xs font-fredoka font-bold transition-all flex items-center justify-between ${
                      selectedUnitId === u.id
                        ? 'bg-[#2A9D8F] text-white shadow-xs'
                        : 'bg-[#F7F3EB] text-[#1D3557] hover:bg-[#EAE0D0]'
                    }`}
                  >
                    <span className="truncate">{u.title}</span>
                    {selectedUnitId === u.id && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center text-[#1D3557]/60 py-8">
            <Loader2 className="animate-spin mb-2 text-[#2A9D8F]" size={28} />
            <span className="font-fredoka text-xs">Loading sound pairs…</span>
          </div>
        )}

        {/* Empty State with Safe Alternative Units */}
        {!loading && items.length === 0 && (
          <div className="bg-[#FDFBF7] rounded-[24px] p-5 border-2 border-[#E2D7C3] text-center shadow-sm">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Headphones size={28} />
            </div>
            <h3 className="font-fredoka font-bold text-base text-[#1D3557] mb-1">
              No Minimal Pairs for this Unit
            </h3>
            <p className="text-xs text-[#264653]/70 mb-4 leading-relaxed">
              This unit does not have minimal-pair acoustic drills yet. Switch to another unit below to practice listening discrimination!
            </p>
            <div className="space-y-1.5 text-left">
              {(solo.units || []).slice(0, 3).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUnitId(u.id)}
                  className="w-full p-2.5 bg-[#F7F3EB] hover:bg-[#EAE0D0] rounded-xl border border-[#E2D7C3] font-fredoka text-xs font-bold text-[#1D3557] flex items-center justify-between"
                >
                  <span className="truncate">{u.title}</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Phonemic Contrast Preview Card */}
        <div className="bg-[#F7F3E8] rounded-[24px] p-4 border-2 border-[#E2D7C3] shadow-sm">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-base">🎧</span>
            <h3 className="font-fredoka font-bold text-sm text-[#1D3557]">
              Phoneme Contrast Focus
            </h3>
          </div>
          <p className="text-[11px] font-medium text-[#264653]/75 mb-3 leading-relaxed">
            Listen closely to the subtle acoustic differences between confusable English vowels and consonants:
          </p>

          <div className="grid grid-cols-2 gap-2">
            {SAMPLE_CONTRASTS.map((c, i) => (
              <div
                key={i}
                className="bg-[#FDFBF7] p-2.5 rounded-2xl border border-[#E2D7C3] flex items-center justify-between"
              >
                <div>
                  <span className="font-fredoka font-bold text-xs text-[#2A9D8F] block">
                    {c.pair}
                  </span>
                  <span className="text-[10px] text-[#264653]/70 font-semibold">
                    {c.wordA} / {c.wordB}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playAudioUrl(undefined, c.wordA).then(() => {
                      setTimeout(() => playAudioUrl(undefined, c.wordB), 600);
                    });
                  }}
                  className="w-8 h-8 rounded-xl bg-sky-50 text-[#1CB0F6] border border-sky-200 flex items-center justify-center hover:bg-sky-100"
                  title={`Hear ${c.pair}`}
                >
                  <Volume2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3.5 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2 text-[11px] text-emerald-800 font-bold">
            <span>🛡️</span>
            <span>Ear Training Focus: Practice builds listening fluency without heart pressure!</span>
          </div>
        </div>
      </div>

      {/* Anchored Primary CTA Footer */}
      {items.length > 0 && (
        <footer className="bg-[#FDFBF7] border-t-2 border-[#E2D7C3] p-4 shrink-0 shadow-lg">
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="w-full h-14 bg-[#2A9D8F] hover:bg-[#23877b] border-2 border-[#1E6F5C] text-white font-fredoka font-bold text-[16px] rounded-2xl shadow-[0_4px_0_#1E6F5C] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-none transition-all"
          >
            <span>START SOUND LAB ({items.length} PAIRS)</span>
            <Headphones size={20} />
          </button>
        </footer>
      )}
    </div>
  );
};

export default PhonicsPhlyer;
