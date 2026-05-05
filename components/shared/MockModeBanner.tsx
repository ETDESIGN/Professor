import React from 'react';

const isMockMode = (): boolean => {
  const url = typeof import.meta !== 'undefined' ? import.meta.env.VITE_SUPABASE_URL : '';
  return !url || url.length === 0;
};

export const MockModeBanner: React.FC = () => {
  if (!isMockMode()) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-amber-900 text-center py-1.5 px-4 text-xs font-bold tracking-wide">
      MOCK MODE — No database connected. Data is in-memory and will reset on reload.
    </div>
  );
};

export { isMockMode };
