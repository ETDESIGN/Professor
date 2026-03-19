import React, { useState, useEffect } from 'react';
import { Mic, X, Activity, Command, ArrowRight } from 'lucide-react';
import { useSession } from '../../store/SessionContext';

interface VoiceCommandModalProps {
  onClose: () => void;
}

const VoiceCommandModal: React.FC<VoiceCommandModalProps> = ({ onClose }) => {
  const { triggerAction, nextSlide, prevSlide, addPoints } = useSession();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      setProcessing(true);
      
      // Simulate processing latency
      setTimeout(() => {
        processCommand();
      }, 1500);
    } else {
      setIsListening(true);
      setTranscript('');
      setFeedback(null);
      simulateSpeech();
    }
  };

  const simulateSpeech = () => {
    // Mock speech input
    const phrases = ["Next slide", "Give 10 points to Leo", "Start timer", "Spin the wheel"];
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    
    let currentText = "";
    let i = 0;
    const interval = setInterval(() => {
      if (!isListening) { // Double check inside interval if user stopped early
         clearInterval(interval);
         return;
      }
      currentText += randomPhrase[i];
      setTranscript(currentText);
      i++;
      if (i >= randomPhrase.length) clearInterval(interval);
    }, 100);
  };

  const processCommand = () => {
    setProcessing(false);
    
    // Simple mock command parser
    const cmd = transcript.toLowerCase();
    
    if (cmd.includes('next')) {
      nextSlide();
      setFeedback('Navigated to Next Slide');
    } else if (cmd.includes('previous') || cmd.includes('back')) {
      prevSlide();
      setFeedback('Navigated to Previous Slide');
    } else if (cmd.includes('points') && cmd.includes('leo')) {
      addPoints('s1', 10); // Mock Leo ID
      setFeedback('Awarded 10 Points to Leo');
    } else if (cmd.includes('spin')) {
      triggerAction('SPIN_WHEEL');
      setFeedback('Spinning Wheel...');
    } else {
      setFeedback('Command not recognized');
    }

    // Auto close after success
    setTimeout(() => {
       if (cmd.includes('next') || cmd.includes('spin') || cmd.includes('points')) {
          onClose();
       }
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in">
      <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white">
        <X size={32} />
      </button>

      <div className="w-full max-w-md p-8 flex flex-col items-center">
        <div className="mb-8 text-center">
           <h2 className="text-2xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <Command className="text-blue-400" /> Voice Commander
           </h2>
           <p className="text-slate-400">Hold button to speak</p>
        </div>

        {/* Visualizer Circle */}
        <div className="relative mb-12">
           <div className={`w-40 h-40 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${isListening ? 'border-red-500 bg-red-500/10 scale-110 shadow-[0_0_50px_rgba(239,68,68,0.4)]' : 'border-slate-700 bg-slate-800'}`}>
              <Mic size={64} className={isListening ? 'text-red-500' : 'text-slate-400'} />
           </div>
           
           {/* Ripple Rings */}
           {isListening && (
              <>
                 <div className="absolute inset-0 rounded-full border border-red-500/50 animate-ping"></div>
                 <div className="absolute -inset-4 rounded-full border border-red-500/30 animate-pulse"></div>
              </>
           )}
        </div>

        {/* Status / Transcript */}
        <div className="h-24 flex flex-col items-center justify-center w-full">
           {processing ? (
              <div className="flex items-center gap-3 text-blue-400 font-bold text-xl animate-pulse">
                 <Activity /> Processing...
              </div>
           ) : feedback ? (
              <div className="flex items-center gap-2 text-green-400 font-bold text-lg animate-slide-up">
                 <ArrowRight /> {feedback}
              </div>
           ) : (
              <div className={`text-2xl font-medium text-center transition-opacity ${transcript ? 'text-white' : 'text-slate-600'}`}>
                 "{transcript || 'Say a command...'}"
              </div>
           )}
        </div>

        {/* Controls */}
        <button
           onMouseDown={() => { setIsListening(true); setTranscript(''); setFeedback(null); simulateSpeech(); }}
           onMouseUp={() => { setIsListening(false); setProcessing(true); setTimeout(processCommand, 1000); }}
           onTouchStart={() => { setIsListening(true); setTranscript(''); setFeedback(null); simulateSpeech(); }}
           onTouchEnd={() => { setIsListening(false); setProcessing(true); setTimeout(processCommand, 1000); }}
           className={`
              mt-8 w-full py-6 rounded-2xl font-bold text-xl transition-all
              ${isListening ? 'bg-red-600 text-white scale-95' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50'}
           `}
        >
           {isListening ? 'Listening...' : 'Hold to Speak'}
        </button>

        {/* Hints */}
        <div className="mt-8 grid grid-cols-2 gap-4 w-full">
           <div className="bg-slate-800/50 p-3 rounded-lg text-center text-xs text-slate-400 border border-slate-700">
              "Next Slide"
           </div>
           <div className="bg-slate-800/50 p-3 rounded-lg text-center text-xs text-slate-400 border border-slate-700">
              "Spin Wheel"
           </div>
           <div className="bg-slate-800/50 p-3 rounded-lg text-center text-xs text-slate-400 border border-slate-700">
              "Give Points"
           </div>
           <div className="bg-slate-800/50 p-3 rounded-lg text-center text-xs text-slate-400 border border-slate-700">
              "Quiet Mode"
           </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceCommandModal;