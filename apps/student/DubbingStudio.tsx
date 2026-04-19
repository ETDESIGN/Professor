import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, MoreHorizontal, Headphones, Mic, Play, StopCircle, Loader2, Star, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { speakText } from '../../services/SpeechService';
import { toast } from 'sonner';

interface DubbingResult {
  score: number;
  feedback: string;
  emotionMatch: 'high' | 'medium' | 'low';
  timing: 'perfect' | 'early' | 'late' | 'slight_offset' | 'off';
  transcript: string;
  similarity: number;
}

interface DubbingStudioProps {
  onBack: () => void;
  data?: {
    targetText?: string;
    targetEmotion?: string;
    characterName?: string;
    characterEmoji?: string;
    sceneImage?: string;
    unitTitle?: string;
    storyTitle?: string;
  };
}

const DubbingStudio: React.FC<DubbingStudioProps> = ({ onBack, data }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [result, setResult] = useState<DubbingResult | null>(null);
  const [isSpeakingTarget, setIsSpeakingTarget] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const targetText = data?.targetText || "Oh no! Where is my red hat?";
  const targetEmotion = data?.targetEmotion || "surprised and sad";
  const characterName = data?.characterName || "Rocky";
  const characterEmoji = data?.characterEmoji || "🤖";
  const sceneImage = data?.sceneImage || "https://img.freepik.com/free-vector/hand-drawn-style-cartoon-scene_23-2150827299.jpg";
  const unitTitle = data?.unitTitle || "Unit 1";
  const storyTitle = data?.storyTitle || "The Lost Hat";

  useEffect(() => {
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

      ctx.fillStyle = 'rgb(15, 23, 42)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(34, 197, 94)';
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

  const evaluateDubbing = async (audioBase64: string): Promise<DubbingResult | null> => {
    try {
      const { data: responseData, error } = await supabase.functions.invoke('evaluate-pronunciation', {
        body: {
          audioBase64,
          targetText,
          targetEmotion,
          language: 'en'
        }
      });

      if (error) {
        console.error('Edge function error:', error.message);
        return null;
      }

      if (responseData?.success && responseData.evaluation) {
        const eval_ = responseData.evaluation;
        const result: DubbingResult = {
          score: eval_.score || 0,
          feedback: eval_.feedback || 'Evaluation complete.',
          emotionMatch: eval_.emotionMatch || 'low',
          timing: eval_.timing || 'off',
          transcript: eval_.transcript || '',
          similarity: eval_.similarity || 0
        };

        try {
          const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
          const fileName = `dubbing/${(await supabase.auth.getUser()).data.user?.id || 'anon'}/${Date.now()}.webm`;
          const { error: uploadError } = await supabase.storage
            .from('generated-media')
            .upload(fileName, audioBytes, { contentType: 'audio/webm' });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('generated-media').getPublicUrl(fileName);
            await supabase.from('assets').insert({
              unit_id: unitTitle,
              asset_type: 'dubbing_recording',
              url: urlData.publicUrl,
              metadata: { score: result.score, transcript: result.transcript, targetText, characterName, storyTitle },
            });
          }
        } catch (storageErr) {
          console.warn('Recording storage failed:', storageErr);
        }

        return result;
      }

      return null;
    } catch (err) {
      console.error('Evaluation failed:', err);
      return null;
    }
  };

  const handleSpeakTarget = () => {
    setIsSpeakingTarget(true);
    speakText(targetText, 0.8);
    setTimeout(() => setIsSpeakingTarget(false), targetText.length * 100 + 800);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

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

        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'rgb(15, 23, 42)';
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgb(34, 197, 94)';
            ctx.beginPath();
            ctx.moveTo(0, canvasRef.current.height / 2);
            ctx.lineTo(canvasRef.current.width, canvasRef.current.height / 2);
            ctx.stroke();
          }
        }

        setIsEvaluating(true);
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result?.toString().split(',')[1];
          if (base64data) {
            const evalResult = await evaluateDubbing(base64data);
            setResult(evalResult);
          }
          setIsEvaluating(false);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioUrl(null);
      setResult(null);
      setProgress(0);

      setTimeout(drawWaveform, 100);

      recordingTimerRef.current = window.setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            stopRecording();
            return 100;
          }
          return p + 2;
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

  const scoreColor = result
    ? result.score >= 80 ? 'text-green-400'
    : result.score >= 50 ? 'text-yellow-400'
    : 'text-red-400'
    : '';

  return (
    <div className="h-screen bg-slate-900 text-white font-sans max-w-md mx-auto flex flex-col">
      <header className="p-4 flex justify-between items-center z-10">
        <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{unitTitle} &bull; Dubbing</span>
          <span className="font-bold">{storyTitle}</span>
        </div>
        <button className="p-2 text-slate-400">
          <MoreHorizontal size={24} />
        </button>
      </header>

      <div className="flex-1 relative bg-black flex flex-col">
        <div className="absolute inset-0 z-0">
          <img
            src={sceneImage}
            alt="Comic Scene"
            className="w-full h-full object-cover opacity-60"
          />
        </div>

        <div className="mt-auto relative z-10 p-6 pb-12 bg-gradient-to-t from-black via-black/80 to-transparent">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-full border-2 border-green-400 overflow-hidden bg-white flex items-center justify-center text-2xl">
              {characterEmoji}
            </div>
            <div className="bg-white/10 backdrop-blur rounded-2xl rounded-tl-none p-4 border border-white/20">
              <div className="text-xs font-bold text-green-400 mb-1 uppercase">Your Turn ({characterName})</div>
              <p className="text-xl font-medium leading-relaxed">
                "{targetText}"
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border-t border-slate-700 p-6 rounded-t-3xl -mt-6 relative z-20">
        <div className="mb-8">
          <div className="flex justify-between text-xs text-slate-400 font-bold mb-2">
            <span>00:00</span>
            <span>00:10</span>
          </div>

          <div className="space-y-2 relative">
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${progress}%`, transition: 'left 0.1s linear' }}>
              <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5 -mt-1.5"></div>
            </div>

            <div className="h-8 bg-slate-700 rounded-lg flex items-center px-1 gap-0.5 opacity-50">
              {[...Array(40)].map((_, i) => (
                <div key={i} className="w-1 bg-slate-500 rounded-full" style={{ height: `${Math.random() * 100}%` }}></div>
              ))}
            </div>

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

        <div className="flex items-center justify-between px-4">
          <button
            onClick={handleSpeakTarget}
            disabled={isSpeakingTarget}
            className={`flex flex-col items-center gap-1 transition-colors ${isSpeakingTarget ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isSpeakingTarget ? 'bg-blue-500/30' : 'bg-slate-700'}`}>
              <Volume2 size={20} className={isSpeakingTarget ? 'animate-pulse' : ''} />
            </div>
            <span className="text-[10px] font-bold uppercase">{isSpeakingTarget ? 'Playing...' : 'Listen'}</span>
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
                  <span className={`font-bold text-lg ${scoreColor}`}>{result.score}/100</span>
                </div>
                <div className="flex gap-2 text-xs font-medium">
                  <span className={`px-2 py-1 rounded-full ${result.emotionMatch === 'high' ? 'bg-green-500/20 text-green-400' : result.emotionMatch === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                    Emotion: {result.emotionMatch}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${result.timing === 'perfect' ? 'bg-green-500/20 text-green-400' : result.timing === 'slight_offset' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                    Timing: {result.timing}
                  </span>
                </div>
              </div>
              {result.transcript && (
                <p className="text-xs text-slate-400 mb-2">You said: "{result.transcript}"</p>
              )}
              <p className="text-sm text-slate-300">{result.feedback}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DubbingStudio;
