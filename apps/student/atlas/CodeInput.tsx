import React from 'react';

// 6-box class-code input (Wonder Atlas). One hidden real input carries the
// state — taps anywhere focus it; boxes are pure display. Kid keyboards on
// tablets never see a native mid-screen keyboard jump.
export function CodeInput({ value, onChange, length = 6 }: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
}) {
  return (
    <div className="relative w-full" data-testid="wa-code-input">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        autoFocus
        autoCapitalize="characters"
        aria-label="Class code"
      />
      <div className="flex justify-center gap-2 pointer-events-none">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`w-11 h-14 rounded-2xl border-2 flex items-center justify-center font-mono text-2xl font-bold transition-colors ${
              i === value.length
                ? 'border-wa-teal bg-wa-mist text-wa-ink'
                : value[i]
                  ? 'border-wa-border bg-wa-paper text-wa-ink'
                  : 'border-wa-border bg-wa-mist/60'
            }`}
          >
            {value[i] ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default CodeInput;
