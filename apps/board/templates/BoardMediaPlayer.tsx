import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Wand2,
  RotateCcw,
  Music,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  Radio,
  CheckCircle2,
  Link2,
  Mic
} from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { youtubeSearchUrl } from '../../../services/youtubeUrl';
import ReactPlayer from 'react-player/lazy';

const formatTime = (secs: number) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const BoardMediaPlayer: React.FC<{ data: any }> = ({ data }) => {
  const { state, triggerAction, applyMediaToStep } = useSession();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [pastedUrl, setPastedUrl] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [showWrapup, setShowWrapup] = useState(false);
  const [wrapupCountdown, setWrapupCountdown] = useState(4);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lyrics synced to time (in seconds)
  const lyrics: Array<{ time: number; text: string }> =
    Array.isArray(data.lyrics) && data.lyrics.length > 0 ? data.lyrics : [];

  const hasVideo = Boolean(data.videoUrl && !playbackError);
  const hasAudio = Boolean(data.audioUrl && !hasVideo && !playbackError);
  // P1 Fix (§3 F2, §4.e 1): Decouple lyrics from playable media gate.
  // Lyrics alone must NEVER mount a fake player transport!
  const hasPlayableMedia = hasVideo || hasAudio;
  const hasLyrics = lyrics.length > 0;

  // Listen for remote and commander actions
  useEffect(() => {
    if (state.lastAction?.type === 'PLAY_PAUSE') {
      if (hasPlayableMedia) {
        setIsPlaying(prev => !prev);
      }
    } else if (state.lastAction?.type === 'RESTART') {
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(0);
      }
      if (hasPlayableMedia) {
        setIsPlaying(true);
      }
    }
  }, [state.lastAction, hasPlayableMedia]);

  const handleProgress = (p: { played: number; playedSeconds: number }) => {
    setProgress(p.played);
    setCurrentTime(p.playedSeconds);

    if (hasLyrics) {
      const activeLyric = [...lyrics].reverse().find(l => l.time <= p.playedSeconds);
      if (activeLyric) {
        const idx = lyrics.indexOf(activeLyric);
        setCurrentLineIndex(idx);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerRef.current) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const percent = Math.max(0, Math.min(1, x / bounds.width));
    playerRef.current.seekTo(percent);
    setProgress(percent);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    // §4.b: Natural-end 4-second celebratory hold beat before slide completion
    setShowWrapup(true);
    setWrapupCountdown(4);
  };

  useEffect(() => {
    if (!showWrapup) return;
    if (wrapupCountdown <= 0) {
      triggerAction('SLIDE_COMPLETE', { forced: false });
      return;
    }
    const timer = setTimeout(() => {
      setWrapupCountdown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [showWrapup, wrapupCountdown, triggerAction]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const currentLine = lyrics[currentLineIndex]?.text || '';
  const nextLine = lyrics[currentLineIndex + 1]?.text || '';
  const thirdLine = lyrics[currentLineIndex + 2]?.text || '';

  // Karaoke highlight sweep calculation
  const currentLyricStartTime = lyrics[currentLineIndex]?.time || 0;
  const nextLyricStartTime =
    lyrics[currentLineIndex + 1]?.time || duration || currentLyricStartTime + 4;
  const lyricDuration = Math.max(0.1, nextLyricStartTime - currentLyricStartTime);
  const lyricProgress = Math.min(
    1,
    Math.max(0, (currentTime - currentLyricStartTime) / lyricDuration)
  );

  const youtubeUrl =
    data.youtubeUrl ||
    (data.search_query ? youtubeSearchUrl(data.search_query) : '');

  const candidates: Array<{
    videoId?: string;
    url?: string;
    title?: string;
    channel?: string;
    thumbnailUrl?: string;
    duration?: string;
  }> = Array.isArray(data.candidates) ? data.candidates : [];

  const applyCandidate = async (c: { url?: string; title?: string }) => {
    if (!c.url || applying) return;
    setApplying(c.url);
    try {
      await applyMediaToStep(c.url, {
        title: c.title || data.title,
        blockSearchQuery: data.search_query
      });
      setPlaybackError(false);
    } finally {
      setApplying(null);
    }
  };

  const handleLinkPastedVideo = async () => {
    if (!pastedUrl.trim() || applying) return;
    const target = pastedUrl.trim();
    setApplying(target);
    setPasteError(null);
    try {
      const res = await applyMediaToStep(target, {
        title: data.title,
        blockSearchQuery: data.search_query
      });
      if (res && !res.ok) {
        setPasteError(res.error || 'Failed to link video');
      } else {
        setPlaybackError(false);
        setPastedUrl('');
      }
    } catch (err: any) {
      setPasteError(err?.message || 'Error linking video');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#070c18] text-[#f1f5f9] font-sans flex flex-col justify-between select-none overflow-hidden relative antialiased"
    >
      {/* Subtle scanline / ambient glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[220px] bg-[#ff2e79]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[200px] bg-[#38bdf8]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* TOP BAR / CLASSROOM PROJECTOR HUD HEADER */}
      {/* P2 Fix (§4.a): Clearance from BoardShell's • WARM-UP badge via pl-32 lg:pl-48 */}
      <header className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-6 bg-[#0a0a12]/95 border-b border-[#1e293b] shrink-0 z-30">
        {/* Left Cluster */}
        <div className="flex items-center gap-3 lg:gap-4 pl-28 lg:pl-44 min-w-0">
          <div className="hidden sm:flex items-center gap-2 bg-[#111c3d] px-3 py-1 lg:py-1.5 rounded-full border border-[#38bdf8]/40 text-[#38bdf8] font-mono text-[11px] lg:text-xs tracking-wider font-bold uppercase shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-ping" />
            WARM-UP SONG
          </div>
          <div className="h-4 w-px bg-[#1e293b] hidden sm:block" />
          <div className="flex items-center gap-2 truncate">
            <Music className="text-[#ff2e79] w-5 h-5 shrink-0" />
            <span className="font-extrabold text-base lg:text-xl text-white tracking-tight truncate">
              {data.title || 'Sing & Move'}
            </span>
          </div>
          {data.topic_relevance && (
            <span className="hidden xl:flex items-center gap-1 bg-[#24345b]/60 text-[#ffe04a] px-2.5 py-0.5 rounded-full text-xs font-mono tracking-wide border border-[#ffe04a]/20 shrink-0">
              {data.topic_relevance}
            </span>
          )}
        </div>

        {/* Right Cluster & System Status */}
        <div className="flex items-center gap-2 lg:gap-3 pr-2 shrink-0">
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#06241b] border border-[#10b981]/40 text-[#34d399] font-mono text-[11px] font-bold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
            REMOTE SYNCED
          </div>
          <div className="flex items-center gap-1 border-l border-[#1e293b] pl-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#38bdf8] hover:bg-[#111c3d] transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#38bdf8] hover:bg-[#111c3d] transition-colors"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
            <span className="hidden sm:inline-block text-[10px] font-mono text-[#94a3b8]/80 ml-1 px-1.5 py-0.5 rounded bg-[#111c3d]">
              16:9 PROJ
            </span>
          </div>
        </div>
      </header>

      {/* MAIN STAGE */}
      <main className="flex-1 w-full max-h-[calc(100vh-100px)] min-h-0 p-3 lg:p-5 overflow-hidden flex flex-col justify-center relative">
        {hasPlayableMedia ? (
          /* PLAYABLE MEDIA STATE (Video or Audio) */
          <div className="w-full h-full grid grid-cols-12 gap-4 lg:gap-6 min-h-0">
            {/* Left Stage: Video or Graphic Audio Hub */}
            <div
              className={`${
                hasLyrics ? 'col-span-12 md:col-span-8' : 'col-span-12'
              } flex flex-col justify-center items-center h-full min-h-0 bg-[#0b132b] rounded-2xl border border-[#24345b] overflow-hidden relative shadow-2xl`}
            >
              {hasVideo ? (
                /* Uncropped Video Container (Fit contain - NO 150% crop, NO 40% darkening!) */
                <div className="w-full h-full flex items-center justify-center bg-black relative">
                  <ReactPlayer
                    ref={playerRef}
                    url={data.videoUrl}
                    playing={isPlaying}
                    muted={isMuted}
                    width="100%"
                    height="100%"
                    style={{ objectFit: 'contain' }}
                    onProgress={handleProgress as any}
                    onDuration={setDuration}
                    onEnded={handleEnded}
                    onError={(e: any) => {
                      console.warn('[BoardMediaPlayer] Playback error:', e);
                      setPlaybackError(true);
                    }}
                    config={{
                      youtube: {
                        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0 }
                      } as any
                    }}
                  />
                  {/* Top Live Badge */}
                  <div className="absolute top-3 left-3 z-20 flex items-center gap-2 pointer-events-none">
                    <div className="bg-[#0a0a12]/85 backdrop-blur-md border border-[#38bdf8]/40 text-[#38bdf8] text-[11px] font-mono px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
                      LIVE VIDEO
                    </div>
                  </div>
                  {/* Action/Dance Prompt Banner at bottom of video */}
                  <div className="absolute bottom-3 inset-x-4 z-20 flex items-center justify-between pointer-events-none">
                    <div className="bg-[#0a0a12]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#ff2e79]/30 text-white flex items-center gap-2 shadow-lg">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff2e79] animate-ping" />
                      <span className="font-bold text-xs lg:text-sm tracking-wide text-[#ffe0ec]">
                        SING &amp; DO THE ACTIONS! 💃 一起动起来！
                      </span>
                    </div>
                    {duration > 0 && (
                      <div className="hidden sm:block bg-[#0a0a12]/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-[#1e293b] text-[#94a3b8] font-mono text-xs">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Audio-Only Visualizer Stage */
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#111c3d] via-[#0b132b] to-[#070c18] relative p-6 text-center">
                  <ReactPlayer
                    ref={playerRef}
                    url={data.audioUrl}
                    playing={isPlaying}
                    muted={isMuted}
                    width="0"
                    height="0"
                    onProgress={handleProgress as any}
                    onDuration={setDuration}
                    onEnded={handleEnded}
                    onError={(e: any) => {
                      console.warn('[BoardMediaPlayer] Audio error:', e);
                      setPlaybackError(true);
                    }}
                  />
                  {/* Pulsing Audio Hub */}
                  <div className="relative mb-6">
                    <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-[#38bdf8]/10 border-2 border-[#38bdf8]/50 flex items-center justify-center text-[#38bdf8] shadow-[0_0_30px_rgba(56,189,248,0.35)] animate-pulse">
                      <Music size={48} className="text-[#38bdf8]" />
                    </div>
                    {isPlaying && (
                      <span className="absolute -inset-2 rounded-full border border-[#ff2e79]/40 animate-ping" />
                    )}
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-extrabold text-white mb-2">
                    {data.title || 'Classroom Sing-Along'}
                  </h2>
                  <p className="text-sm text-[#38bdf8] font-mono uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                    Audio Stream Active · Listen &amp; Repeat
                  </p>
                </div>
              )}
            </div>

            {/* Right Rail: Karaoke Lyrics Teleprompter */}
            {hasLyrics && (
              <div className="col-span-12 md:col-span-4 h-full flex flex-col justify-between bg-[#0b132b] rounded-2xl border border-[#24345b] p-4 lg:p-5 overflow-hidden relative shadow-xl min-h-0">
                {/* Header */}
                <div className="bg-[#111c3d] rounded-xl p-3 border border-[#1e293b] shrink-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] lg:text-xs font-mono font-bold text-[#38bdf8] tracking-wider uppercase flex items-center gap-1.5">
                      <Radio size={14} className="text-[#38bdf8]" />
                      SING-ALONG PROMPTER
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#24345b] text-[#ffe04a] font-semibold">
                      Choral
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base lg:text-lg text-white leading-tight truncate">
                    {data.title || 'Warm Up Song'}
                  </h3>
                </div>

                {/* Teleprompter Display */}
                <div className="flex-1 flex flex-col justify-center my-3 py-2 px-1 relative min-h-0">
                  {/* Active Line with Bouncing Dot & Glow */}
                  <div className="relative mb-4">
                    <div className="inline-flex items-center gap-1.5 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff2e79] animate-bounce shadow-[0_0_8px_#ff2e79]" />
                      <span className="text-[11px] font-mono text-[#ff2e79] uppercase font-bold tracking-wider">
                        Active Line
                      </span>
                    </div>
                    <div className="relative">
                      {/* Base text */}
                      <p className="font-extrabold text-xl lg:text-2xl text-white/40 leading-snug tracking-tight">
                        {currentLine || '♪ ♪ ♪'}
                      </p>
                      {/* Highlight sweep */}
                      <p
                        className="font-extrabold text-xl lg:text-2xl text-[#ffe04a] leading-snug tracking-tight absolute top-0 left-0 overflow-hidden whitespace-nowrap drop-shadow-[0_0_12px_rgba(255,224,74,0.6)]"
                        style={{ width: `${lyricProgress * 100}%`, transition: 'width 0.1s linear' }}
                      >
                        {currentLine || '♪ ♪ ♪'}
                      </p>
                    </div>
                  </div>

                  {/* Upcoming Line */}
                  {nextLine && (
                    <div className="opacity-50 mb-2 border-l-2 border-[#303e68] pl-3">
                      <span className="text-[10px] font-mono uppercase text-[#94a3b8] font-bold block mb-0.5">
                        NEXT UP
                      </span>
                      <p className="font-bold text-sm lg:text-base text-[#f1f5f9] leading-snug truncate">
                        {nextLine}
                      </p>
                    </div>
                  )}

                  {/* Third Line */}
                  {thirdLine && (
                    <div className="opacity-25 border-l-2 border-transparent pl-3 hidden lg:block">
                      <p className="font-semibold text-xs text-[#94a3b8] leading-snug truncate">
                        {thirdLine}
                      </p>
                    </div>
                  )}
                </div>

                {/* Teacher Movement Cue */}
                <div className="bg-[#182449]/90 border border-[#ffe04a]/30 rounded-xl p-2.5 flex items-center gap-2.5 shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-[#ffe04a]/20 flex items-center justify-center text-[#ffe04a] shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono font-bold text-[#ffe04a] tracking-wider uppercase">
                      TEACHER CUE
                    </div>
                    <div className="font-bold text-xs text-white truncate">
                      Lead the class: sing &amp; clap together!
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* UNRESOLVED STANDBY CARD (Stitch 2-unresolved.html) */
          <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-center items-center bg-[#111c3d]/90 border border-[#24345b] rounded-2xl p-4 lg:p-6 backdrop-blur-md shadow-2xl overflow-y-auto max-h-full">
            {/* Friendly Status Header */}
            <div className="flex flex-col items-center text-center max-w-xl mb-4 shrink-0">
              <div className="relative mb-2">
                <div className="w-14 h-14 rounded-full bg-[#ff2e79]/10 border border-[#ff2e79]/40 flex items-center justify-center text-[#ff2e79] shadow-[0_0_20px_rgba(255,46,121,0.45)]">
                  <Music size={28} />
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38bdf8] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#38bdf8]" />
                </span>
              </div>
              <h2 className="font-extrabold text-xl lg:text-2xl text-white tracking-tight">
                {playbackError
                  ? 'Video blocked or unavailable in network'
                  : `Warm-Up Song: ${data.title || 'Sing & Move'}`}
              </h2>
              <p className="text-xs lg:text-sm text-[#94a3b8] mt-1">
                {playbackError
                  ? 'The video could not load. Choose an alternate video below or paste a working URL.'
                  : 'No video linked to this song yet. Select a candidate or link a video in two taps.'}
              </p>
            </div>

            {/* Candidate Cards Grid */}
            {candidates.length > 0 ? (
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mb-4 shrink-0">
                {candidates.slice(0, 3).map((c, i) => (
                  <div
                    key={c.videoId || c.url || i}
                    className="group bg-[#0b132b] rounded-xl border border-[#24345b] hover:border-[#38bdf8] p-3 flex flex-col justify-between transition-all shadow-md"
                  >
                    <div className="relative aspect-video w-full rounded-lg overflow-hidden mb-2 bg-[#182449]">
                      {c.thumbnailUrl ? (
                        <img
                          src={c.thumbnailUrl}
                          alt={c.title || ''}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#94a3b8]">
                          <Music size={28} />
                        </div>
                      )}
                      <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                        {c.duration || '2:45'}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-xs lg:text-sm text-white leading-snug line-clamp-1">
                          {c.title || `Song Option ${i + 1}`}
                        </h4>
                        {c.channel && (
                          <p className="text-[11px] font-mono text-[#38bdf8] mt-0.5 truncate">
                            {c.channel}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 pt-2 border-t border-[#1e293b] flex items-center justify-between gap-2">
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono uppercase tracking-wider text-[#94a3b8] hover:text-white flex items-center gap-1"
                          >
                            <ExternalLink size={12} /> Preview
                          </a>
                        )}
                        <button
                          onClick={() => applyCandidate(c)}
                          disabled={Boolean(applying)}
                          className="bg-[#ff2e79] hover:bg-[#ff2e79]/90 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all shadow-[0_0_12px_rgba(255,46,121,0.4)] flex items-center gap-1 active:scale-95 disabled:opacity-50 ml-auto"
                        >
                          <Wand2 size={12} />
                          {applying === c.url ? 'Linking…' : 'USE THIS'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : hasLyrics ? (
              /* Lyrics Chant-Along Card when no video candidates */
              <div className="w-full max-w-xl bg-[#0b132b] rounded-xl border border-[#24345b] p-4 text-center mb-4 shrink-0">
                <div className="inline-flex items-center gap-1 text-xs font-mono text-[#ffe04a] mb-2 uppercase font-bold">
                  <Mic size={14} /> Choral Chant Available
                </div>
                <div className="space-y-1.5 text-sm text-[#f1f5f9] max-h-32 overflow-y-auto">
                  {lyrics.slice(0, 4).map((l, i) => (
                    <p key={i} className="font-medium">
                      {l.text}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Bottom URL Paste & YouTube Search */}
            <div className="w-full max-w-xl flex flex-col gap-2 shrink-0">
              <div className="w-full bg-[#070c18] border border-dashed border-[#303e68] focus-within:border-[#38bdf8] rounded-full px-3 py-1.5 flex items-center gap-2 transition-colors">
                <Link2 size={16} className="text-[#94a3b8] shrink-0 pl-1" />
                <input
                  type="text"
                  value={pastedUrl}
                  onChange={e => setPastedUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLinkPastedVideo()}
                  placeholder="Paste YouTube URL: https://youtube.com/watch?v=..."
                  className="flex-1 bg-transparent border-0 text-xs font-mono text-white focus:ring-0 placeholder:text-[#94a3b8]/50 focus:outline-none"
                />
                <button
                  onClick={handleLinkPastedVideo}
                  disabled={!pastedUrl.trim() || Boolean(applying)}
                  className="bg-[#24345b] hover:bg-[#303e68] border border-[#38bdf8]/40 text-xs font-mono font-bold uppercase text-[#38bdf8] px-3 py-1 rounded-full transition-all active:scale-95 disabled:opacity-40 shrink-0"
                >
                  {applying ? 'Linking…' : 'Link Video'}
                </button>
              </div>

              {pasteError && (
                <p className="text-center text-xs text-[#ff4444] font-mono">{pasteError}</p>
              )}

              {youtubeUrl && (
                <div className="text-center mt-1">
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-[#38bdf8] hover:underline"
                  >
                    <ExternalLink size={12} /> Search YouTube for &quot;{data.title || data.search_query}&quot;
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CELEBRATORY HOLD OVERLAY ON SONG FINISH (§4.b) */}
        {showWrapup && (
          <div className="absolute inset-0 z-40 bg-[#070c18]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-[#10b981]/20 border-2 border-[#10b981] flex items-center justify-center text-[#10b981] shadow-[0_0_30px_#10b981] mb-4">
              <CheckCircle2 size={44} />
            </div>
            <h2 className="font-extrabold text-3xl lg:text-4xl text-white tracking-tight mb-2">
              Great Singing! Warm-Up Complete! 🎵
            </h2>
            <p className="text-base text-[#38bdf8] font-mono mb-6">
              Starting lesson in {wrapupCountdown}s...
            </p>
            <button
              onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
              className="bg-[#ff2e79] hover:bg-[#ff2e79]/90 text-white font-extrabold text-base px-8 py-3.5 rounded-xl shadow-[0_0_24px_rgba(255,46,121,0.6)] transition-all active:scale-95 cursor-pointer flex items-center gap-2"
            >
              Start Focus Cards Now →
            </button>
          </div>
        )}
      </main>

      {/* BOTTOM TRANSPORT BAR (Only visible when media is actually playable) */}
      {hasPlayableMedia && (
        <footer className="h-16 lg:h-20 bg-[#0b132b] border-t border-[#1e293b] px-4 lg:px-8 flex items-center justify-between shrink-0 z-30 shadow-2xl">
          {/* Left: Replay Button */}
          <div className="flex items-center gap-3 lg:gap-4">
            <button
              onClick={() => {
                if (playerRef.current) {
                  playerRef.current.seekTo(Math.max(0, currentTime - 10));
                }
              }}
              className="flex items-center gap-2 bg-[#111c3d] hover:bg-[#182449] text-white border border-[#1e293b] hover:border-[#38bdf8]/50 px-3 lg:px-4 py-2 rounded-xl font-bold text-xs lg:text-sm tracking-wide transition-all active:scale-95 shadow-md"
              title="Skip back 10 seconds"
            >
              <RotateCcw size={18} className="text-[#38bdf8]" />
              <span className="hidden sm:inline">Replay (-10s)</span>
            </button>
          </div>

          {/* Center: Main Playback Controls & Scrubber */}
          <div className="flex-1 max-w-xl mx-4 lg:mx-8 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-3 lg:gap-5">
              <button
                onClick={() => playerRef.current?.seekTo(0)}
                className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg bg-[#111c3d] hover:bg-[#182449] border border-[#1e293b] flex items-center justify-center text-white hover:text-[#38bdf8] transition-all active:scale-95"
                title="Restart"
              >
                <SkipBack size={16} />
              </button>

              {/* Primary Hero Button: PLAY / PAUSE */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="bg-[#ff2e79] hover:bg-[#ff2e79]/90 text-white font-extrabold text-sm lg:text-base px-6 lg:px-8 py-2 lg:py-2.5 rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(255,46,121,0.45)] transition-all active:scale-95 cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <Pause size={18} className="fill-white" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play size={18} className="fill-white ml-0.5" />
                    <span>PLAY</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  if (playerRef.current) {
                    playerRef.current.seekTo(Math.min(duration, currentTime + 10));
                  }
                }}
                className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg bg-[#111c3d] hover:bg-[#182449] border border-[#1e293b] flex items-center justify-center text-white hover:text-[#38bdf8] transition-all active:scale-95"
                title="Skip forward 10 seconds"
              >
                <SkipForward size={16} />
              </button>
            </div>

            {/* Timeline Progress Scrubber */}
            <div className="w-full flex items-center gap-2.5">
              <span className="text-[10px] lg:text-xs font-mono text-[#38bdf8] font-bold w-10 text-right shrink-0">
                {formatTime(currentTime)}
              </span>
              <div
                className="flex-1 h-2 bg-[#24345b] rounded-full cursor-pointer relative overflow-hidden"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-gradient-to-r from-[#38bdf8] to-[#ff2e79] rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="text-[10px] lg:text-xs font-mono text-[#94a3b8] w-10 shrink-0">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: Sound Indicator & Complete */}
          <div className="flex items-center gap-2 lg:gap-4">
            <button
              onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
              className="bg-[#111c3d] hover:bg-[#182449] border border-[#1e293b] hover:border-[#10b981]/50 text-[#f1f5f9] px-3 lg:px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wide transition-all active:scale-95"
              title="Skip to next slide"
            >
              Skip →
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default BoardMediaPlayer;
