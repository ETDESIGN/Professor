
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, MoreHorizontal, Headphones, Mic, Play, StopCircle, Loader2, Star } from 'lucide-react';
import { evaluateDubbing, DubbingResult } from '../../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';

interface DubbingStudioProps {
  onBack: () => void;
}

const DubbingStudio: React.FC<DubbingStudioProps> = ({ onBack }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100 for display
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [result, setResult] = useState<DubbingResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  
  // Audio Visualizer Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const targetText = "Oh no! Where is my red hat?";
  const targetEmotion = "surprised and sad";

  useEffect(() => {
    // Cleanup URL and AudioContext on unmount
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [audioUrl]);

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!isRecording && !analyserRef.current) return;
      
      rafRef.current = requestAnimationFrame(draw);
      analyserRef.current!.getByteTimeDomainData(dataArray);

      ctx.fillStyle = 'rgb(15, 23, 42)'; // slate-900
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(34, 197, 94)'; // green-500
      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      // Setup Audio Visualizer
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 2048;
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
        
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;

        // Clear canvas
        if (canvasRef.current) {
           const ctx = canvasRef.current.getContext('2d');
           if (ctx) {
              ctx.fillStyle = 'rgb(15, 23, 42)';
              ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              // Draw a flat line
              ctx.lineWidth = 2;
              ctx.strokeStyle = 'rgb(34, 197, 94)';
              ctx.beginPath();
              ctx.moveTo(0, canvasRef.current.height / 2);
              ctx.lineTo(canvasRef.current.width, canvasRef.current.height / 2);
              ctx.stroke();
           }
        }

        // Evaluate with Gemini
        setIsEvaluating(true);
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result?.toString().split(',')[1];
          if (base64data) {
            const evalResult = await evaluateDubbing(base64data, targetText, targetEmotion);
            setResult(evalResult);
          }
          setIsEvaluating(false);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioUrl(null); // Clear previous
      setResult(null);
      setProgress(0);
      
      // Start drawing waveform
      setTimeout(drawWaveform, 100);

      // Simulate progress bar for recording limit (e.g. 5s)
      recordingTimerRef.current = window.setInterval(() => {
         setProgress(p => {
            if (p >= 100) {
               stopRecording();
               return 100;
            }
            return p + 2; // 50 ticks = 5 seconds
         });
      }, 100);

    } catch (err) {
      console.error("Mic Error:", err);
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const playRecording = () => {
    if (audioUrl) {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio(audioUrl);
        audioPlayerRef.current.onended = () => setIsPlaying(false);
      } else {
        audioPlayerRef.current.src = audioUrl;
      }
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="h-screen bg-slate-900 text-white font-sans max-w-md mx-auto flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center z-10">
        <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Unit 1 • Story 3</span>
          <span className="font-bold">The Lost Hat</span>
        </div>
        <button className="p-2 text-slate-400">
          <MoreHorizontal size={24} />
        </button>
      </header>

      {/* Main Video Area */}
      <div className="flex-1 relative bg-black flex flex-col">
        {/* Mock Video Layer */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://img.freepik.com/free-vector/hand-drawn-style-cartoon-scene_23-2150827299.jpg" 
            alt="Comic Scene" 
            className="w-full h-full object-cover opacity-60"
          />
        </div>
        
        {/* Subtitle Overlay */}
        <div className="mt-auto relative z-10 p-6 pb-12 bg-gradient-to-t from-black via-black/80 to-transparent">
          <div className="flex items-start gap-4 mb-4">
             <div className="w-12 h-12 rounded-full border-2 border-green-400 overflow-hidden bg-white">
                <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Rocky" alt="Rocky" />
             </div>
             <div className="bg-white/10 backdrop-blur rounded-2xl rounded-tl-none p-4 border border-white/20">
                <div className="text-xs font-bold text-green-400 mb-1 uppercase">Your Turn (Rocky)</div>
                <p className="text-xl font-medium leading-relaxed">
                  "Oh no! <span className="text-green-400 underline decoration-2 underline-offset-4">Where</span> is my red hat?"
                </p>
             </div>
          </div>
        </div>
      </div>

      {/* Studio Controls Footer */}
      <div className="bg-slate-800 border-t border-slate-700 p-6 rounded-t-3xl -mt-6 relative z-20">
        {/* Timeline Viz */}
        <div className="mb-8">
           <div className="flex justify-between text-xs text-slate-400 font-bold mb-2">
             <span>00:00</span>
             <span>00:10</span>
           </div>
           
           {/* Tracks */}
           <div className="space-y-2 relative">
             {/* Playhead (Simulated movement based on progress) */}
             <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${progress}%`, transition: 'left 0.1s linear' }}>
               <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5 -mt-1.5"></div>
             </div>

             {/* Teacher Track */}
             <div className="h-8 bg-slate-700 rounded-lg flex items-center px-1 gap-0.5 opacity-50">
               {[...Array(40)].map((_, i) => (
                 <div key={i} className="w-1 bg-slate-500 rounded-full" style={{ height: `${Math.random() * 100}%` }}></div>
               ))}
             </div>
             
             {/* Student Track */}
             <div className="h-12 bg-slate-900 rounded-lg border border-slate-700 flex items-center overflow-hidden relative">
                <canvas 
                  ref={canvasRef} 
                  width={400} 
                  height={48} 
                  className="w-full h-full absolute inset-0" 
                />
                {!isRecording && !audioUrl && <div className="text-xs text-slate-500 w-full text-center relative z-10">Ready to Record</div>}
             </div>
           </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between px-4">
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-colors">
             <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
               <Headphones size={20} />
             </div>
             <span className="text-[10px] font-bold uppercase">Original</span>
          </button>

          <button 
            onClick={toggleRecording}
            disabled={isEvaluating}
            className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${isRecording ? 'border-red-500 bg-red-500/20 scale-110' : 'border-slate-600 bg-slate-700 hover:bg-slate-600'} ${isEvaluating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className={`rounded-full transition-all duration-300 ${isRecording ? 'w-8 h-8 bg-red-500 rounded-sm' : 'w-16 h-16 bg-red-500 rounded-full'} flex items-center justify-center`}>
              {!isRecording && !isEvaluating && <Mic className="text-white w-8 h-8" />}
              {isEvaluating && <Loader2 className="text-white w-8 h-8 animate-spin" />}
            </div>
          </button>

          <button 
            onClick={playRecording}
            disabled={!audioUrl || isEvaluating}
            className={`flex flex-col items-center gap-1 transition-colors ${audioUrl && !isEvaluating ? 'text-white' : 'text-slate-600 opacity-50 cursor-not-allowed'}`}
          >
             <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isPlaying ? 'bg-green-500 text-white' : 'bg-slate-700'}`}>
               {isPlaying ? <StopCircle size={24} /> : <Play size={20} className="ml-1" />}
             </div>
             <span className="text-[10px] font-bold uppercase">Review</span>
          </button>
        </div>

        {/* Evaluation Result */}
        <AnimatePresence>
          {result && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-6 bg-slate-700/50 rounded-2xl p-4 border border-slate-600"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Star className="text-yellow-400 w-5 h-5 fill-yellow-400" />
                  <span className="font-bold text-lg">{result.score}/100</span>
                </div>
                <div className="flex gap-2 text-xs font-medium">
                  <span className={`px-2 py-1 rounded-full ${result.emotionMatch === 'high' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    Emotion: {result.emotionMatch}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${result.timing === 'perfect' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    Timing: {result.timing}
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-300">{result.feedback}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DubbingStudio;
