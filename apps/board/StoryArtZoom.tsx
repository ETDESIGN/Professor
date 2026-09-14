// StoryArtZoom — ROUND-2 #13 (owner request): tap the story illustration (or
// its corner magnifier) to view it fullscreen. Kids at the back of the class
// need to see the art big; the reading-theater columns keep it small.
// Shared by the story surfaces: BoardStoryStage, BoardStoryStage.ag,
// BoardStoryQuest. Pure presentation — no data writes, closes on tap/Esc.
import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ZoomIn, X } from 'lucide-react';

interface StoryArtZoomProps {
  src?: string | null;
  alt?: string;
  /** Where the magnifier button sits on the art card. */
  className?: string;
}

export const useStoryArtZoom = () => {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const open = useCallback((src?: string | null) => {
    if (src && /^https?:/.test(src)) setZoomSrc(src);
  }, []);
  const close = useCallback(() => setZoomSrc(null), []);
  return { zoomSrc, open, close };
};

/** The little corner magnifier; renders nothing without a usable src. */
export const StoryArtZoomButton: React.FC<{
  src?: string | null;
  onOpen: (src?: string | null) => void;
  className?: string;
}> = ({ src, onOpen, className = '' }) => {
  if (!src || !/^https?:/.test(src)) return null;
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label="Zoom image"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onOpen(src); }}
      className={`absolute z-20 w-9 h-9 rounded-full bg-slate-900/70 backdrop-blur border border-white/40 flex items-center justify-center text-white shadow-lg hover:bg-sky-600 hover:scale-105 active:scale-95 transition-all ${className}`}
    >
      <ZoomIn size={16} />
    </span>
  );
};

/** The fullscreen overlay — one instance per surface, fed by the hook. */
export const StoryArtZoomOverlay: React.FC<{
  src: string | null;
  onClose: () => void;
}> = ({ src, onClose }) => (
  <AnimatePresence>
    {src && (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="absolute inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-10 cursor-zoom-out"
        role="dialog"
        aria-label="Zoomed story image"
      >
        <motion.img
          initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          src={src}
          alt=""
          draggable={false}
          className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.8)]"
        />
        <span className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 border border-white/25 flex items-center justify-center text-white">
          <X size={20} />
        </span>
      </motion.div>
    )}
  </AnimatePresence>
);
