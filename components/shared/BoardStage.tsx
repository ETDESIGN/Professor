// BoardStage — the classroom board's fixed 1280×720 logical stage, uniformly
// scaled to fit whatever container it is mounted in (projector window, iPad
// mirror, Commander preview). One composition everywhere: content inside is
// laid out at exactly STAGE_W×STAGE_H CSS px and never reflows. The inner
// div is a named size container, so container queries / cqw / cqh inside the
// stage evaluate deterministically at 1280×720 on every device.
// Spec: docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md

import React, { useLayoutEffect, useRef, useState } from 'react';

export const STAGE_W = 1280;
export const STAGE_H = 720;

/** Uniform scale that fits the stage inside a cw×ch container (no cap — a
 *  1080p projector renders at 1.5 and transform-scaled text stays crisp). */
export const stageScale = (cw: number, ch: number): number =>
  Math.min(cw / STAGE_W, ch / STAGE_H);

interface BoardStageProps {
  children: React.ReactNode;
  className?: string;
}

const BoardStage: React.FC<BoardStageProps> = ({ children, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw > 0 && ch > 0) setK(stageScale(cw, ch));
    };
    measure(); // before first paint — no unscaled flash
    const ro = new ResizeObserver(measure); // covers iOS dynamic viewport
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-black flex items-center justify-center ${className}`}
    >
      <div
        className="relative shrink-0"
        style={
          {
            width: STAGE_W,
            height: STAGE_H,
            transform: `scale(${k})`,
            transformOrigin: 'center center',
            containerType: 'size',
            containerName: 'stage',
            '--stage-scale': String(k),
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
};

export default BoardStage;
