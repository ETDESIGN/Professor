// Wonder Atlas design tokens — single source of truth for the student app reskin.
// Values extracted 2026-09-09 from the Stitch exports (frequency-weighted across
// all 33 code.html files). tailwind.config.js imports this module (Tailwind loads
// its config through jiti, which transpiles TS imports); components use the
// generated wa-* classes; SVG/canvas code imports the hex values directly.
export const waColors = {
  cream: '#EAE0D0',      // app background
  paper: '#FDFBF7',      // card surface
  mist: '#F7F3E8',       // subtle tinted background
  ink: '#264653',        // primary text (navy)
  inkDeep: '#1D3557',    // alt navy (star fills, emphasis)
  muted: '#8C7A68',      // secondary text (warm gray)
  teal: '#2A9D8F',       // primary action
  tealDeep: '#1E6F5C',   // 3D shadow under teal buttons
  terra: '#E76F51',      // accent: streak, energy, active states
  terraDeep: '#C4553B',  // 3D shadow under terracotta buttons
  sand: '#E9C46A',       // stars / highlights / completed nodes
  sandDeep: '#C99E32',   // 3D shadow under sand elements
  peach: '#F4A261',      // warm accent
  border: '#E2D7C3',     // card borders
  successBg: '#E8F5E9',  // success tint
} as const;

export const waRadii = {
  card: '24px',
  tile: '20px',
} as const;

export const waShadows = {
  btnTeal: '0 4px 0 #1E6F5C',
  btnTerra: '0 4px 0 #C4553B',
  btnSand: '0 4px 0 #C99E32',
  card: '0 4px 12px rgba(45, 55, 72, 0.05)',
} as const;

export const waFonts = {
  display: "'Fredoka', 'Fredoka One', system-ui, sans-serif",
  body: "'Nunito', 'Noto Sans SC', system-ui, sans-serif",
} as const;

export type WaColorName = keyof typeof waColors;
