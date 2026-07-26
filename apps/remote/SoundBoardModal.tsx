
import React from 'react';
import { X, Volume2, CheckCircle, XCircle, Bell, Music, Star, Zap } from 'lucide-react';

interface SoundBoardModalProps {
   onClose: () => void;
   /** Broadcast a SOUND_* action so the Classroom Board plays the clip.
    *  B3.1: previously this modal only vibrated locally; the footer copy
    *  "Sounds play on Classroom Board" was false. */
   triggerAction?: (type: string, payload?: any) => void;
}

const SoundBoardModal: React.FC<SoundBoardModalProps> = ({ onClose, triggerAction }) => {
   const sounds = [
      { id: 'correct', label: 'Correct', icon: CheckCircle, color: 'bg-green-100 text-green-600', ring: 'ring-green-300', action: 'SOUND_CORRECT' },
      { id: 'wrong', label: 'Wrong', icon: XCircle, color: 'bg-red-100 text-red-600', ring: 'ring-red-300', action: 'SOUND_WRONG' },
      { id: 'ding', label: 'Ding', icon: Bell, color: 'bg-yellow-100 text-yellow-600', ring: 'ring-yellow-300', action: 'SOUND_DING' },
      { id: 'drum', label: 'Drumroll', icon: Music, color: 'bg-purple-100 text-purple-600', ring: 'ring-purple-300', action: 'SOUND_DRUMROLL' },
      { id: 'win', label: 'Win', icon: Star, color: 'bg-blue-100 text-blue-600', ring: 'ring-blue-300', action: 'SOUND_WIN' },
      { id: 'zap', label: 'Zap', icon: Zap, color: 'bg-orange-100 text-orange-600', ring: 'ring-orange-300', action: 'SOUND_ZAP' },
   ];

   const playSound = (action: string) => {
      // Broadcast to the board (and any other tab on the classroom_live channel).
      if (triggerAction) triggerAction(action);
      if (navigator.vibrate) navigator.vibrate(50);
   };

   return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
         <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose}></div>

         <div className="bg-white w-full max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto animate-slide-up">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-10">
               <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <Volume2 size={20} className="text-slate-500" /> Sound Board
               </h2>
               <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
                  <X size={20} className="text-slate-600" />
               </button>
            </div>

            {/* Grid */}
            <div className="p-6 grid grid-cols-2 gap-4">
               {sounds.map((sound) => (
                  <button
                     key={sound.id}
                     onClick={() => playSound(sound.action)}
                     className={`
                    flex flex-col items-center justify-center gap-2 p-6 rounded-2xl transition-all active:scale-95 active:ring-4 ${sound.ring}
                    bg-white border-2 border-slate-100 hover:border-slate-300 shadow-sm hover:shadow-md
                 `}
                  >
                     <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${sound.color}`}>
                        <sound.icon size={28} />
                     </div>
                     <span className="font-bold text-slate-700">{sound.label}</span>
                  </button>
               ))}
            </div>

            <div className="p-4 bg-slate-50 text-center text-xs text-slate-400 font-medium">
               Tap to play • Sounds play on Classroom Board
            </div>
         </div>
      </div>
   );
};

export default SoundBoardModal;
