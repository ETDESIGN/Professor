import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X } from 'lucide-react';

interface QrScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
}

/**
 * Full-screen rear-camera QR scanner.
 * Uses the native BarcodeDetector when available (Chrome/Android) and falls
 * back to jsQR frame-by-frame decoding everywhere else — Safari/iOS has no
 * BarcodeDetector, so the JS path is what most iPhones will run.
 */
const QrScanner: React.FC<QrScannerProps> = ({ onResult, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState(false);

  resultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let detector: any = null;
    let stopped = false;
    let lastScan = 0;

    const handleText = (text: string) => {
      if (stopped || !text) return;
      stopped = true;
      setFound(true);
      navigator.vibrate?.(80);
      stream?.getTracks().forEach((t) => t.stop());
      resultRef.current(text);
    };

    const scanFrameJsQr = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      const code = jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (code?.data) handleText(code.data);
    };

    const tick = async () => {
      if (stopped) return;
      const now = performance.now();
      if (now - lastScan > 120) {
        lastScan = now;
        try {
          if (detector) {
            const video = videoRef.current;
            if (video && video.readyState >= 2) {
              const codes = await detector.detect(video);
              if (codes?.length && codes[0].rawValue) handleText(codes[0].rawValue);
            }
          } else {
            scanFrameJsQr();
          }
        } catch {
          // Transient frame failures (focus hunting, rotation) are expected.
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          try {
            const supported: string[] = await (window as any).BarcodeDetector.getSupportedFormats();
            if (supported?.includes('qr_code')) {
              detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
            }
          } catch {
            detector = null; // fall through to jsQR
          }
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', '');
        await video.play();
        raf = requestAnimationFrame(tick);
      } catch (e: any) {
        if (e?.name === 'NotAllowedError') setError('Camera access was denied. Allow the camera in your browser settings and try again.');
        else if (e?.name === 'NotFoundError') setError('No camera was found on this device.');
        else setError(e?.message || 'Could not start the camera.');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm font-semibold">Scan your login card</span>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20"
          aria-label="Close scanner"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-64 h-64 max-w-[70vw] max-h-[70vw] rounded-3xl border-4 transition-colors ${
              found ? 'border-duo-pink' : 'border-white/80'
            }`}
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
          />
        </div>

        <div className="absolute bottom-8 inset-x-0 text-center text-white/90 text-sm px-8">
          {error ? (
            <span className="text-red-300">{error}</span>
          ) : found ? (
            <span>Code detected…</span>
          ) : (
            <span>Point your camera at the QR code on your login card</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default QrScanner;
