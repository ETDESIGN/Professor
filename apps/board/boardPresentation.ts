// BoardPresentation — a tiny shell-owned context for per-state presentation
// overrides that individual games can request (games-v3 audit 17 §3 F9: the
// 240px leaderboard rail steals stage width during Grammar Lab's warming-up
// holding state). Games toggle it from a state effect and MUST clean up.
import React, { createContext, useContext } from 'react';

interface BoardPresentation {
  /** true → the right leaderboard rail retracts (stage goes full width). */
  railHidden: boolean;
  setRailHidden: (hidden: boolean) => void;
}

const BoardPresentationContext = createContext<BoardPresentation>({
  railHidden: false,
  setRailHidden: () => {},
});

export const BoardPresentationProvider = BoardPresentationContext.Provider;
export const useBoardPresentation = () => useContext(BoardPresentationContext);
