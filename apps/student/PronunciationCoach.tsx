import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, MoreHorizontal, Mic, MicOff, Headphones, Loader2, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// Client-side SDK removed. Route to edge in the future.

interface PronunciationCoachProps {
  onBack: () => void;
  mode?: 'standalone' | 'embedded';
  onReady?: (isReady: boolean) => void;
  validateTrigger?: number;
  onResult?: (isCorrect: boolean) => void;
  data?: {
    targetSentence?: string;
  };
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const PronunciationCoach: React.FC<PronunciationCoachProps> = ({
  onBack,
  mode = 'standalone',
  onReady,
  validateTrigger,
  onResult,
  data
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [userBars, setUserBars] = useState<number[]>(new Array(15).fill(5));
  const [aiBars, setAiBars] = useState<number[]>(new Array(15).fill(5));

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const targetSentence = data?.targetSentence || "Let's practice English conversation!";

  useEffect(() => {
    if (onReady) onReady(true);
    return () => {
      disconnectSession();
    };
  }, []);

  const disconnectSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    activeSourcesRef.current.forEach(source => source.stop());
    activeSourcesRef.current = [];
    setIsConnected(false);
    setIsConnecting(false);
    setIsAiSpeaking(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const connectSession = async () => {
    setIsConnecting(true);
    try {
      // Re-routed to Edge (Stubbed for now to eradicate API keys)
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      nextPlayTimeRef.current = audioContextRef.current.currentTime;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const sessionPromise = Promise.resolve({
        sendRealtimeInput: () => { },
        close: () => { }
      });

      // Mock connection open
      setTimeout(() => {
        setIsConnected(true);
        setIsConnecting(false);
      }, 1000);

      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error("Failed to connect:", err);
      setIsConnecting(false);
      alert("Could not connect to the AI Coach. Please check your microphone permissions.");
    }
  };

  const toggleConnection = () => {
    if (isConnected) {
      disconnectSession();
    } else {
      connectSession();
    }
  };

  // Animate AI bars when speaking
  useEffect(() => {
    if (isAiSpeaking) {
      const animate = () => {
        setAiBars(prev => prev.map(() => Math.random() * 80 + 10));
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setAiBars(new Array(15).fill(5));
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isAiSpeaking]);

  return (
    <div className="h-full bg-slate-900 text-white flex flex-col font-sans">
      {/* Header */}
      {mode === 'standalone' && (
        <header className="px-4 py-4 flex items-center justify-between border-b border-white/10">
          <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Coach</span>
            <span className="font-bold">Conversation Practice</span>
          </div>
          <button className="p-2 text-slate-400">
            <MoreHorizontal size={24} />
          </button>
        </header>
      )}

      {/* Main Content */}
      <div className="flex-1 px-6 flex flex-col items-center justify-center relative overflow-hidden">

        <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-full border border-white/20 mb-8 flex items-center gap-2 z-10">
          <MessageSquare size={16} className="text-duo-blue" />
          <span className="text-sm font-bold">Topic: {targetSentence}</span>
        </div>

        {/* Visualizers */}
        <div className="flex flex-col items-center gap-12 z-10 w-full max-w-md">
          {/* AI Visualizer */}
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI Coach</div>
            <div className="h-16 w-full flex items-center justify-center gap-1">
              {aiBars.map((h, i) => (
                <div
                  key={i}
                  className={`w-2 rounded-full transition-all duration-75 ${isAiSpeaking ? 'bg-duo-blue' : 'bg-slate-700'}`}
                  style={{ height: `${h}%` }}
                ></div>
              ))}
            </div>
          </div>

          {/* User Visualizer */}
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="h-16 w-full flex items-center justify-center gap-1">
              {userBars.map((h, i) => (
                <div
                  key={i}
                  className={`w-2 rounded-full transition-all duration-75 ${isConnected && !isAiSpeaking ? 'bg-duo-green' : 'bg-slate-700'}`}
                  style={{ height: `${h}%` }}
                ></div>
              ))}
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">You</div>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="absolute bottom-10 text-center z-10">
          {isConnecting ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm font-bold">Connecting...</span>
            </div>
          ) : isConnected ? (
            <div className="text-sm font-bold text-duo-green animate-pulse">
              Listening... Speak naturally!
            </div>
          ) : (
            <div className="text-sm font-bold text-slate-400">
              Tap the microphone to start
            </div>
          )}
        </div>

        {/* Background Glow */}
        <div className={`absolute inset-0 transition-opacity duration-1000 ${isConnected ? 'opacity-20' : 'opacity-0'}`}>
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-duo-blue rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-duo-green rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000"></div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-8 pb-12 flex items-center justify-center border-t border-white/10 z-10 bg-slate-900">
        <button
          onClick={toggleConnection}
          disabled={isConnecting}
          className={`
               w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300
               ${isConnected ? 'border-red-500 bg-red-500/20 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'border-slate-700 bg-duo-green text-white shadow-[0_8px_0_#2f6f02] active:translate-y-2 active:shadow-none'}
               ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        >
          {isConnected ? <MicOff size={32} /> : <Mic size={32} />}
        </button>
      </div>
    </div>
  );
};

export default PronunciationCoach;