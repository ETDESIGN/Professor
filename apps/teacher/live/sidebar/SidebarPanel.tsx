import React from 'react';
import {
  RotateCw, Volume2, LayoutGrid, Activity, MessageSquare,
  Star, Zap, Bell, Music, Check, CheckCircle, XCircle,
  Shuffle, Sparkles, Trophy, FileText, Monitor
} from 'lucide-react';

type SidebarTab = 'notes' | 'wheel' | 'sounds' | 'groups' | 'analytics';

interface SidebarPanelProps {
  activeTab: SidebarTab;
  state: any;
  currentStep: any;
  isSpinning: boolean;
  groupCount: number;
  generatedGroups: any[][];
  handleSpin: () => void;
  addPoints: (studentId: string, amount: number) => void;
  triggerAction: (type: string, payload?: any) => void;
  closeOverlay: () => void;
  setSelectionMode: (mode: any) => void;
  setGroupCount: (count: number) => void;
  setGeneratedGroups: (groups: any[][]) => void;
}

export const SidebarPanel: React.FC<SidebarPanelProps> = ({
  activeTab, state, currentStep, isSpinning, groupCount, generatedGroups,
  handleSpin, addPoints, triggerAction, closeOverlay, setSelectionMode,
  setGroupCount, setGeneratedGroups,
}) => {
  const guide = currentStep?.teacherGuide;

  switch (activeTab) {
    case 'wheel': {
      const winner = state.quickWheelWinner ? state.students.find((s: any) => s.id === state.quickWheelWinner) : null;
      return (
        <div className="flex flex-col h-full p-5">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2"><RotateCw className="text-yellow-400" /> Quick Picker</h3>
          <div className="flex bg-slate-800 p-1 rounded-xl mb-6">
            {(['FAIR', 'RANDOM'] as const).map(mode => (
              <button key={mode} onClick={() => setSelectionMode(mode)} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${state.selectionMode === mode ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}>
                {mode === 'FAIR' ? '⚖️' : '🔄'} {mode}
              </button>
            ))}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center mb-6">
            {winner && !isSpinning ? (
              <div className="flex flex-col items-center animate-slide-up">
                <div className="w-24 h-24 rounded-full border-4 border-yellow-400 shadow-xl flex items-center justify-center text-5xl bg-slate-800 mb-4">{winner.avatar}</div>
                <h3 className="text-2xl font-bold text-white mb-6">{winner.name}</h3>
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button onClick={() => addPoints(winner.id, 10)} className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"><Star size={16} fill="currentColor" /> +10</button>
                  <button onClick={() => addPoints(winner.id, 50)} className="bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"><Zap size={16} fill="currentColor" /> +50</button>
                </div>
              </div>
            ) : (
              <button onClick={handleSpin} disabled={isSpinning} className={`w-40 h-40 rounded-full border-8 border-slate-700 flex flex-col items-center justify-center shadow-xl transition-all active:scale-95 ${isSpinning ? 'animate-spin border-t-yellow-400' : 'bg-gradient-to-br from-yellow-500 to-orange-600 hover:scale-105 text-white'}`}>
                {isSpinning ? <span className="text-2xl">🎲</span> : <span className="font-black text-xl tracking-widest">SPIN</span>}
              </button>
            )}
          </div>
          {winner && !isSpinning && <button onClick={closeOverlay} className="w-full bg-slate-800 text-slate-400 font-bold py-3 rounded-xl hover:bg-slate-700">Close Overlay</button>}
        </div>
      );
    }

    case 'sounds':
      return (
        <div className="flex flex-col h-full p-5">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2"><Volume2 className="text-blue-400" /> Sound Board</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Correct', icon: CheckCircle, color: 'text-green-400', action: 'SOUND_CORRECT' },
              { label: 'Wrong', icon: XCircle, color: 'text-red-400', action: 'SOUND_WRONG' },
              { label: 'Ding', icon: Bell, color: 'text-yellow-400', action: 'SOUND_DING' },
              { label: 'Drumroll', icon: Music, color: 'text-purple-400', action: 'SOUND_DRUMROLL' },
              { label: 'Win', icon: Star, color: 'text-blue-400', action: 'SOUND_WIN' },
              { label: 'Zap', icon: Zap, color: 'text-orange-400', action: 'SOUND_ZAP' },
            ].map((sound, i) => (
              <button key={i} onClick={() => triggerAction(sound.action)} className="aspect-square bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all border border-slate-700 hover:border-slate-600">
                <sound.icon size={24} className={sound.color} />
                <span className="text-xs font-bold text-slate-300">{sound.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
            <button onClick={() => triggerAction('CELEBRATE')} className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-400 hover:via-purple-400 hover:to-indigo-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"><Sparkles size={20} /> Trigger Celebration</button>
            <button onClick={() => { state.students.forEach((s: any) => addPoints(s.id, 5)); triggerAction('CELEBRATE'); }} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"><Trophy size={20} /> +5 XP to Everyone</button>
          </div>
        </div>
      );

    case 'groups':
      return (
        <div className="flex flex-col h-full p-5">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2"><LayoutGrid className="text-purple-400" /> Group Maker</h3>
          <div className="flex items-center justify-between mb-6 bg-slate-800 p-2 rounded-xl">
            <span className="text-sm font-bold text-slate-300 px-2">Groups:</span>
            <div className="flex gap-1">
              {[2, 3, 4, 5, 6].map(num => (
                <button key={num} onClick={() => setGroupCount(num)} className={`w-8 h-8 rounded-lg font-bold text-sm ${groupCount === num ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{num}</button>
              ))}
            </div>
          </div>
          <button onClick={() => {
            const shuffled = [...(state.students || [])].sort(() => Math.random() - 0.5);
            const newGroups: any[][] = Array.from({ length: groupCount }, () => []);
            shuffled.forEach((student: any, index: number) => { newGroups[index % groupCount].push(student); });
            setGeneratedGroups(newGroups);
            triggerAction('GROUPS_UPDATED', { groups: newGroups });
          }} className="w-full bg-white text-purple-900 font-bold py-3 rounded-xl mb-6 flex items-center justify-center gap-2 hover:bg-purple-50 active:scale-95 transition-all"><Shuffle size={16} /> Shuffle & Project</button>
          <div className="flex-1 overflow-y-auto space-y-3">
            {generatedGroups.map((group, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between"><span>Group {i + 1}</span><span className="bg-slate-700 px-1.5 rounded text-white">{group.length}</span></div>
                <div className="flex flex-wrap gap-2">
                  {group.map((s: any) => <span key={s.id} className="text-sm text-slate-300 bg-slate-700/50 px-2 py-1 rounded">{s.avatar} {s.name}</span>)}
                </div>
              </div>
            ))}
            {generatedGroups.length === 0 && <div className="text-center text-slate-600 text-sm py-8">Tap shuffle to create groups</div>}
          </div>
        </div>
      );

    case 'analytics':
      return (
        <div className="flex flex-col h-full p-5">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2"><Activity className="text-emerald-400" /> Live Analytics</h3>
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">Class Accuracy</div>
              <div className="text-3xl font-bold text-white mb-2">85%</div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-[85%]"></div></div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div className="text-xs font-bold text-slate-400 uppercase mb-3">Struggling Students</div>
              <div className="space-y-2">
                {state.students.filter((s: any) => s.points < 50).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2"><span>{s.avatar}</span><span className="text-slate-300">{s.name}</span></div>
                    <span className="text-red-400 font-bold">{s.points} pts</span>
                  </div>
                ))}
                {state.students.filter((s: any) => s.points < 50).length === 0 && <div className="text-slate-500 text-sm">No students currently struggling.</div>}
              </div>
            </div>
          </div>
        </div>
      );

    case 'notes':
    default:
      return (
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><MessageSquare size={14} /> Teacher Notes</span>
            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded">Private</span>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {currentStep && (
              <div className="mb-6">
                <h3 className="text-white font-bold text-lg leading-tight mb-1">{currentStep.title}</h3>
                <div className="text-slate-500 text-xs">Est. Duration: {Math.round(currentStep.duration / 60)} min</div>
              </div>
            )}
            {guide ? (
              <div className="space-y-6">
                <div className="bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/30">
                  <h4 className="text-indigo-400 font-bold text-xs uppercase mb-2 flex items-center gap-2"><Monitor size={14} /> Instructions</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">{guide.instruction}</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                  <h4 className="text-white font-bold text-xs uppercase mb-2 flex items-center gap-2"><FileText size={14} /> Script</h4>
                  <p className="text-slate-300 text-sm italic border-l-2 border-slate-600 pl-3">"{guide.script}"</p>
                </div>
                {guide.answerKey && (
                  <div className="bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/30">
                    <h4 className="text-emerald-400 font-bold text-xs uppercase mb-2 flex items-center gap-2"><Check size={14} /> Answer Key</h4>
                    <div className="font-mono text-sm text-emerald-200">{guide.answerKey}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-8 text-sm">No notes available.</div>
            )}
          </div>
        </div>
      );
  }
};
