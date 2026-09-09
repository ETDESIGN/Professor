# Cross-Cutting Comments & Findings (not game-specific)

> Owner comments that apply to the **whole live-classroom experience** rather than one game: the Commander shell, Remote Baton, roster/wheel flow, session lifecycle, scoring feel across games, audio, avatars, etc.
> Each entry gets mapped to the owning subsystem; game-specific comments live in the per-game files.

## §1 Owner comments (verbatim — confirmed 2026-09-09)

> **#1 — Gamification system: live screen must be fully responsive.** "This first comment applies to the whole gamification system. It seems in the UI, in the live screen, whatever we do — move, reduce, or enlarge the size of the window — the content changes size. It's very important that the content resizes properly depending on the size of the screen, because the teacher may decide to connect it to an iPad, to a phone, and connect this iPad or this phone or the laptop to the projector through HDMI. So it's very important that even on some small screen, all the elements fit inside the screen."

**Clarified with the owner (2026-09-09):**
- Smallest screen that must be fully usable: **phone landscape** (~700×320 CSS px) — the board tab runs in a phone browser mirrored to the projector.
- Adaptation strategy: **reflow allowed** — panels stack, grids shrink, side rails collapse; layouts may reorganize so everything stays visible, nothing overlaps.
- Scrolling: **never** — everything fits one screen at every supported size.

> **#3 — "Next exercise" button needs two clicks.** "Another bug I noticed: when I click on the next game / next exercise button, we go to the next exercise, and automatically, after the system loads the next exercise, it comes back to the previous one. So I need to press the button a second time to effectively be on the next exercise."

**Clarified with the owner (2026-09-09):** happens **sometimes** (not every slide change); the control involved is the **commander's Next button**.

> **#25 — Many games: arriving at a new game shows it already in "finished" state.** "When I switch to the next screen, I arrive at the new game, and actually the game is in a finished state. Meaning, when I open it, there is a screen saying 'we have successfully finished the game', and I need to click on 'redo' to be able to play."

**Clarified with the owner (2026-09-09):** **several games** (unsure which exactly); occurs **on arrival via Next** — likely related to #3's bounce-back (suspect: stale slide/hydration state letting the arriving game mount with completed-round state).

**Global priorities stated by the owner (apply to every game):**
- Live screen is **horizontal** (projector via HDMI from laptop/iPad/phone) — use landscape space properly, scale down to small screens.
- **English-first rule (REFINED by the owner 2026-09-09, later same day): avoid Chinese on challenge surfaces WHEN POSSIBLE — it is NOT a strict ban.** Instructions, tips, rules, and exercise descriptions MAY be described in Chinese when the kids otherwise wouldn't understand the task. What stays hard: never make the ANSWER trivially visible (e.g., don't show the Chinese meaning of the very word being asked), and give hints/tips rather than answers. (The earlier same-day confirmation for Word Detective — remove the Chinese word from that challenge everywhere incl. commander — still stands for that game; it's the strong end of the preference, not a global law.)
- Games must flow smoothly with the **wheel student-picking system** (1 / 3 / full set per student) — **no mandatory teacher clicks between every single answer**.

## §2 ZCode findings (cross-cutting)

*(pending — batch code audit. Known anchors: the Word Search F0 finding (grid 0–13 px) is the extreme case of the responsive problem; #3/#25 point at the slide-advance/hydration path — `applySessionRow` staleness guard and `computeSlideState` are the first places to look.)*

## §3 Co-Work observations (if any)

*(Co-Work may note cross-cutting themes here after processing several games — one paragraph per theme, naming the games affected.)*

## §4 Disposition

*(What we decided to do about each theme, and where the fix landed.)*
