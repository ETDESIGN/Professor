
import React, { useEffect } from 'react';
import { X, Volume2, CheckCircle, XCircle, Bell, Music, Star, Zap, Keyboard } from 'lucide-react';

interface TeacherSoundBoardProps {
  onClose: () => void;
}

const TeacherSoundBoard: React.FC<TeacherSoundBoardProps> = ({ onClose }) => {
  const sounds = [
    { id: 'correct', label: 'Correct', icon: CheckCircle, color: 'bg-green-100 text-green-600', ring: 'ring-green-300', key: '1' },
    { id: 'wrong', label: 'Wrong', icon: XCircle, color: 'bg-red-100 text-red-600', ring: 'ring-red-300', key: '2' },
    { id: 'ding', label: 'Ding', icon: Bell, color: 'bg-yellow-100 text-yellow-600', ring: 'ring-yellow-300', key: '3' },
    { id: 'drum', label: 'Drumroll', icon: Music, color: 'bg-purple-100 text-purple-600', ring: 'ring-purple-300', key: '4' },
    { id: 'win', label: 'Victory', icon: Star, color: 'bg-blue-100 text-blue-600', ring: 'ring-blue-300', key: '5' },
    { id: 'zap', label: 'Energy', icon: Zap, color: 'bg-orange-100 text-orange-600', ring: 'ring-orange-300', key: '6' },
  ];

  const playSound = (id: string) => {
    // Mock play
    console.log(`Playing sound: ${id}`);
    const btn = document.getElementById(`sound-btn-${id}`);
    if (btn) {
       btn.classList.add('scale-95', 'ring-4');
       setTimeout(() => btn.classList.remove('scale-95', 'ring-4'), 200);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const sound = sounds.find(s => s.key === e.key);
      if (sound) playSound(sound.id);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col relative animate-scale-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white z-10">
           <h2 className="font-bold text-xl text-slate-800 flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Volume2 size={24} /></div>
              Classroom Sound Board
           </h2>
           <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500">
              <X size={24} />
           </button>
        </div>

        {/* Grid */}
        <div className="p-8 grid grid-cols-3 gap-6 bg-slate-50/50">
           {sounds.map((sound) => (
              <button
                 key={sound.id}
                 id={`sound-btn-${sound.id}`}
                 onClick={() => playSound(sound.id)}
                 className={`
                    group relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl transition-all duration-100
                    bg-white border-2 border-slate-100 hover:border-slate-300 shadow-sm hover:shadow-lg
                    active:scale-95 active:ring-4 ${sound.ring}
                 `}
              >
                 <div className="absolute top-3 right-3 w-6 h-6 bg-slate-100 rounded-md border border-slate-200 text-xs font-bold text-slate-400 flex items-center justify-center font-mono">
                    {sound.key}
                 </div>
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl transition-transform group-hover:scale-110 ${sound.color}`}>
                    <sound.icon size={32} />
                 </div>
                 <span className="font-bold text-slate-700 text-lg">{sound.label}</span>
              </button>
           ))}
        </div>
        
        <div className="p-4 bg-white border-t border-slate-100 flex justify-center items-center gap-2 text-slate-400 text-sm font-medium">
           <Keyboard size={16} /> Use number keys 1-6 to play instantly
        </div>
      </div>
    </div>
  );
};

export default TeacherSoundBoard;
