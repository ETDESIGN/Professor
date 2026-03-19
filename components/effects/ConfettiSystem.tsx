import React, { useEffect, useRef } from 'react';
import { useSession } from '../../store/SessionContext';

interface Particle {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  rotation: number;
  dRotation: number;
  color: string;
  life: number;
}

const ConfettiSystem: React.FC = () => {
  const { state } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationId = useRef<number | null>(null);
  const lastTriggerRef = useRef(0);

  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  const spawnConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    for (let i = 0; i < 150; i++) {
      particles.current.push({
        x: canvas.width / 2,
        y: canvas.height / 2, // Burst from center
        w: Math.random() * 10 + 5,
        h: Math.random() * 10 + 5,
        dx: (Math.random() - 0.5) * 20, // Spread X
        dy: (Math.random() - 0.5) * 20 - 5, // Spread Y (upwards bias)
        rotation: Math.random() * 360,
        dRotation: (Math.random() - 0.5) * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0
      });
    }
  };

  useEffect(() => {
    if (state.confettiTrigger > lastTriggerRef.current) {
      spawnConfetti();
      lastTriggerRef.current = state.confettiTrigger;
    }
  }, [state.confettiTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Animation Loop
    const loop = () => {
      if (particles.current.length > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      particles.current = particles.current.filter(p => {
        // Physics
        p.x += p.dx;
        p.y += p.dy;
        p.dy += 0.5; // Gravity
        p.dx *= 0.96; // Air resistance X
        p.dy *= 0.96; // Air resistance Y
        p.rotation += p.dRotation;
        p.life -= 0.005;

        // Draw
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();

        return p.life > 0 && p.y < canvas.height + 100;
      });

      animationId.current = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationId.current) cancelAnimationFrame(animationId.current);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 pointer-events-none z-[100]"
    />
  );
};

export default ConfettiSystem;