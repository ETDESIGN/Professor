
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, Maximize, VolumeX } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import ReactPlayer from 'react-player';

const BoardMediaPlayer = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const playerRef = useRef<any>(null);

  // Mock Lyrics synced to time (in seconds)
  const lyrics = data.lyrics && data.lyrics.length > 0 ? data.lyrics : [];

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'PLAY_PAUSE') {
      setIsPlaying(prev => !prev);
    } else if (state.lastAction?.type === 'RESTART') {
      playerRef.current?.seekTo(0);
      setIsPlaying(true);
    }
  }, [state.lastAction]);

  const handleProgress = (state: { played: number, playedSeconds: number }) => {
    setProgress(state.played);
    setCurrentTime(state.playedSeconds);

    // Update lyrics based on progress
    const activeLyric = [...lyrics].reverse().find(l => l.time <= state.playedSeconds);
    if (activeLyric) {
      const idx = lyrics.indexOf(activeLyric);
      setCurrentLineIndex(idx);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const percent = x / bounds.width;
    playerRef.current?.seekTo(percent);
  };

  const currentLine = lyrics[currentLineIndex]?.text || "";
  const nextLine = lyrics[currentLineIndex + 1]?.text || "...";

  // Karaoke highlighting logic:
  // Calculate how far along we are in the current lyric duration
  const currentLyricStartTime = lyrics[currentLineIndex]?.time || 0;
  const nextLyricStartTime = lyrics[currentLineIndex + 1]?.time || duration || currentLyricStartTime + 5;
  const lyricDuration = nextLyricStartTime - currentLyricStartTime;
  const lyricProgress = Math.min(1, Math.max(0, (currentTime - currentLyricStartTime) / lyricDuration));

  const hasVideo = Boolean(data.videoUrl);
  const hasAudio = Boolean(data.audioUrl);
  const hasLyrics = lyrics.length > 0;
  const hasContent = hasVideo || hasAudio || hasLyrics;

  return (
    <div className="h-full bg-black relative flex flex-col group overflow-hidden">
      {/* Video Layer */}
      {hasVideo ? (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-black/40 z-10"></div>
          <ReactPlayer
            ref={playerRef}
            url={data.videoUrl}
            playing={isPlaying}
            muted={isMuted}
            width="150%"
            height="150%"
            style={{ position: 'absolute', top: '-25%', left: '-25%', opacity: 0.8 }}
            onProgress={handleProgress as any}
            onDuration={setDuration}
            onEnded={() => setIsPlaying(false)}
            config={{
              youtube: {
                playerVars: { controls: 0, disablekb: 1, modestbranding: 1 }
              } as any
            }}
          />
        </div>
      ) : hasAudio ? (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900">
          <ReactPlayer
            ref={playerRef}
            url={data.audioUrl}
            playing={isPlaying}
            muted={isMuted}
            width="0"
            height="0"
            onProgress={handleProgress as any}
            onDuration={setDuration}
            onEnded={() => setIsPlaying(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-10">
            <Volume2 size={200} className="text-white" />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
      )}

      {/* Top Info Bar */}
      <div className="relative z-20 p-8 flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-duo-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
            <Volume2 size={32} className="text-yellow-900" />
          </div>
          <div>
            <div className="text-yellow-400 font-bold uppercase tracking-widest text-sm mb-1">Warm Up Song</div>
            <h1 className="text-5xl font-display font-bold text-white drop-shadow-lg">{data.title || "Media Player"}</h1>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-full text-white/80 font-mono text-xl border border-white/10">
          {Math.floor(progress * 100)}%
        </div>
      </div>

      {/* Karaoke Lyrics Area */}
      <div className="flex-1 relative z-20 flex items-end justify-center pb-32 px-20">
        {hasLyrics ? (
          <div className="text-center space-y-6 max-w-5xl">
            <div className="relative inline-block">
              {/* Background text (dimmed) */}
              <p className="text-8xl text-white/30 font-fun drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] leading-tight">
                {currentLine}
              </p>
              {/* Foreground text (highlighted) with clip-path for karaoke effect */}
              <p
                className="text-8xl text-yellow-400 font-fun drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] leading-tight absolute top-0 left-0 whitespace-nowrap overflow-hidden"
                style={{ width: `${lyricProgress * 100}%`, transition: 'width 0.1s linear' }}
              >
                {currentLine}
              </p>
            </div>
            <p className="text-4xl text-white/50 font-fun transform transition-all duration-500">
              {nextLine}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <Volume2 size={80} className="text-white/20 mx-auto mb-6" />
            <p className="text-3xl text-white/40 font-fun">
              {hasContent ? "Press play to start the media" : "No media content available for this step"}
            </p>
          </div>
        )}
      </div>

      {/* Progress Bar & Controls */}
      <div className="absolute bottom-0 left-0 w-full z-30 bg-gradient-to-t from-black to-transparent pt-20 pb-8 px-8 transition-transform duration-300 translate-y-full group-hover:translate-y-0">
        {/* Timeline */}
        <div
          className="w-full h-3 bg-white/20 rounded-full mb-6 cursor-pointer relative overflow-hidden"
          onClick={handleSeek}
        >
          <div className="h-full bg-duo-green relative transition-all duration-100 ease-linear" style={{ width: `${progress * 100}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg scale-150"></div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-between items-center text-white">
          <div className="flex items-center gap-6">
            <button
              className="hover:text-duo-green transition-colors"
              onClick={() => playerRef.current?.seekTo(0)}
            >
              <SkipBack size={32} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform"
            >
              {isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-1" />}
            </button>
            <button
              className="hover:text-duo-green transition-colors"
              onClick={() => playerRef.current?.seekTo(progress + 0.1)}
            >
              <SkipForward size={32} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMuted(!isMuted)}>
              {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            <div className="w-24 h-1 bg-white/30 rounded-full">
              <div className="h-full bg-white rounded-full" style={{ width: isMuted ? '0%' : '100%' }}></div>
            </div>
            <Maximize size={24} className="ml-4 cursor-pointer" onClick={() => {
              const elem = document.documentElement;
              if (!document.fullscreenElement) {
                elem.requestFullscreen().catch(() => { });
              } else {
                document.exitFullscreen();
              }
            }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoardMediaPlayer;
