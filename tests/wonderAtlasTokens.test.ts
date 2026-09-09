import { describe, it, expect } from 'vitest';
import { waColors, waRadii, waShadows } from '../apps/student/atlas/tokens';
// @ts-ignore — JS config without type declarations
import tailwindConfig from '../tailwind.config.js';

const extend = (tailwindConfig.theme?.extend ?? {}) as Record<string, any>;

describe('Wonder Atlas tokens (exact Stitch values)', () => {
  it('holds the frequency-verified hex values', () => {
    expect(waColors).toMatchObject({
      teal: '#2A9D8F', ink: '#264653', cream: '#EAE0D0', terra: '#E76F51',
      tealDeep: '#1E6F5C', sand: '#E9C46A', sandDeep: '#C99E32', peach: '#F4A261',
      paper: '#FDFBF7', border: '#E2D7C3', muted: '#8C7A68', mist: '#F7F3E8',
      terraDeep: '#C4553B', inkDeep: '#1D3557', successBg: '#E8F5E9',
    });
  });

  it('exposes every color as a wa-* Tailwind color', () => {
    for (const name of Object.keys(waColors)) {
      expect(extend.colors[`wa-${name}`]).toBe(waColors[name as keyof typeof waColors]);
    }
  });

  it('keeps the other portals’ tokens untouched', () => {
    expect(extend.colors['duo-pink']).toBe('#e91e63');
    expect(extend.colors['teacher-primary']).toBe('#e91e63');
    expect(extend.colors['parent-primary']).toBe('#0dccf2');
  });

  it('registers wa radii, shadows and fonts', () => {
    expect(extend.borderRadius['wa-card']).toBe(waRadii.card);
    expect(extend.borderRadius['wa-tile']).toBe(waRadii.tile);
    expect(extend.boxShadow['wa-btn-teal']).toBe(waShadows.btnTeal);
    expect(extend.boxShadow['wa-card']).toBe(waShadows.card);
    expect(extend.fontFamily['wa-display'][0]).toBe('Fredoka');
    expect(extend.fontFamily['wa-body'][0]).toBe('Nunito');
  });
});
