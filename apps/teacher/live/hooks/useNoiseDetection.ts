import { useState, useEffect, useRef } from 'react';

export const useNoiseDetection = (
  quietModeActive: boolean,
  setQuietMode: (active: boolean) => void,
  updateNoiseLevel: (level: number) => void,
  deductAllPoints: (amount: number) => void,
) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const penaltyTimerRef = useRef<any>(null);

  const NOISE_THRESHOLD = 40;
  const GRACE_PERIOD = 10000;
  const [quietTimer, setQuietTimer] = useState(GRACE_PERIOD / 1000);

  const startQuietMode = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);

      microphoneRef.current.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      setQuietMode(true);
      setQuietTimer(GRACE_PERIOD / 1000);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLoop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 255) * 100 * 2.5));

        updateNoiseLevel(normalized);
        rafRef.current = requestAnimationFrame(updateLoop);
      };

      updateLoop();

      let timeLeft = GRACE_PERIOD / 1000;
      penaltyTimerRef.current = setInterval(() => {
        if (timeLeft > 0) {
          timeLeft -= 1;
          setQuietTimer(timeLeft);
        }
      }, 1000);

      const penaltyCheck = setInterval(() => {
        if (timeLeft <= 0 && analyserRef.current) {
          const bLen = analyserRef.current.frequencyBinCount;
          const dArr = new Uint8Array(bLen);
          analyserRef.current.getByteFrequencyData(dArr);
          let s = 0;
          for (let i = 0; i < bLen; i++) s += dArr[i];
          const avg = s / bLen;
          const lvl = Math.min(100, Math.round((avg / 255) * 100 * 2.5));

          if (lvl > NOISE_THRESHOLD) {
            deductAllPoints(5);
          }
        }
      }, 2000);

      (window as any).quietPenaltyInterval = penaltyCheck;

    } catch (err) {
      console.error("Mic Error", err);
      alert("Microphone access required for Quiet Mode.");
    }
  };

  const stopQuietMode = () => {
    setQuietMode(false);
    updateNoiseLevel(0);

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (penaltyTimerRef.current) clearInterval(penaltyTimerRef.current);
    if ((window as any).quietPenaltyInterval) clearInterval((window as any).quietPenaltyInterval);

    if (audioContextRef.current) audioContextRef.current.close();
    audioContextRef.current = null;
  };

  const toggleQuietMode = () => {
    if (quietModeActive) stopQuietMode();
    else startQuietMode();
  };

  return { quietTimer, toggleQuietMode };
};
