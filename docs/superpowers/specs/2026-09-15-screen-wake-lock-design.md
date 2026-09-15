# Screen Wake Lock for live sessions — design

**Date:** 2026-09-15 · **Status:** approved (owner picked "Board + Commander" scope) · **Size:** small

## Problem

During a live lesson the iPad that runs the board (`/board`) or the teacher
commander (`/teacher/live`) receives no touch input, so iPadOS auto-locks after
~2 minutes and kills the lesson display. Streaming sites solve this with the
**Screen Wake Lock API**; we do the same.

## Solution

New hook `hooks/useScreenWakeLock(active: boolean)`:

- While `active`, calls `navigator.wakeLock.request('screen')` (Safari/iPadOS
  16.4+, incl. home-screen installed PWAs; no permission prompt; HTTPS only —
  satisfied by Vercel).
- The browser silently releases the lock when the page is hidden or the screen
  is locked manually. The hook listens for `visibilitychange` and re-acquires
  when the page becomes visible again (only if it isn't already holding an
  active sentinel — no redundant requests).
- Releases the sentinel on unmount / `active → false`.
- Silent no-op where the API is missing (pre-16.4 iOS, old browsers) and when a
  request is rejected (e.g. low battery): the classroom must never show an
  error because the device keeps auto-locking.

Wired into exactly two surfaces, so any device showing a live lesson stays
awake and everything else keeps normal auto-lock:

- `apps/board/ClassroomBoard.tsx` — the `/board` projection screen
- `apps/teacher/LiveCommander.tsx` — the `/teacher/live` control screen

No settings toggle, no UI, no student-app coverage (student devices should
sleep normally). Not doing the silent-audio hack (only relevant pre-2023,
battery-hostile).

## Testing

Vitest + jsdom with a faked `navigator.wakeLock`: acquire on mount, no request
while inactive, release on unmount, re-acquire after browser-initiated release
on visibility change, no re-acquire while hidden, no redundant request while
already held, silent when API missing or request rejects. Wiring into the two
screens is declarative and covered by `tsc` + existing suites + the
`board:stage-check` CI gate.

## Deploy

Frontend-only → push to master auto-deploys to Vercel. Already-open iPads pick
it up via the update banner (AGENTS.md §8.1).
