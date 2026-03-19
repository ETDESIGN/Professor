
import React, { useRef, useEffect } from 'react';
import { useSession } from '../../store/SessionContext';

interface DrawingLayerProps {
  isInteractive?: boolean; // If true, captures input. If false, just renders.
  color?: string;
  className?: string;
}

const DrawingLayer: React.FC<DrawingLayerProps> = ({ isInteractive = false, color = '#ef4444', className }) => {
  const { state, startDrawing, addDrawingPoint, endDrawing } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingLocal = useRef(false);

  // Helper to normalize coordinates (0-1)
  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isInteractive) return;
    // e.preventDefault(); // Prevents scrolling on touch
    isDrawingLocal.current = true;
    const { x, y } = getCoords(e);
    startDrawing(x, y, color);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isInteractive || !isDrawingLocal.current) return;
    // e.preventDefault();
    const { x, y } = getCoords(e);
    addDrawingPoint(x, y);
  };

  const handleEnd = () => {
    if (!isInteractive || !isDrawingLocal.current) return;
    isDrawingLocal.current = false;
    endDrawing();
  };

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 z-50 ${className} ${isInteractive ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
    >
      <svg className="w-full h-full" style={{ pointerEvents: 'none' }}>
        {state.drawings.map((stroke) => {
          // Convert normalized points to path string
          // We render these using percentage coordinates in SVG to be responsive
          const pathData = stroke.points.map((p, i) => 
            `${i === 0 ? 'M' : 'L'} ${p.x * 100}% ${p.y * 100}%`
          ).join(' ');

          return (
            <path
              key={stroke.id}
              d={pathData}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-md"
            />
          );
        })}
      </svg>
    </div>
  );
};

export default DrawingLayer;
