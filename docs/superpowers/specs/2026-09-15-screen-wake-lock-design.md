# Screen Wake Lock for live sessions — design

**Date:** 2026-09-15 · **Status:** approved (owner picked "Board + Commander" scope) · **Revised same day:** video fallback added after the owner's Brave-on-iPad test failed · **Size:** small

## Problem

During a live lesson the iPad that runs the board (`/board`) or the teacher
commander (`/teacher/live`) receives no touch input, so iPadOS auto-locks after
~2 minutes and kills the lesson display. Streaming sites solve this with the
**Screen Wake Lock API**; we do the same — plus a fallback, because of what the
owner's test revealed (below).

## Solution

New hook `hooks/useScreenWakeLock(active: boolean)`:

- **Primary: Screen Wake Lock API.** While `active`, calls
  `navigator.wakeLock.request('screen')` (Safari/iPadOS 16.4+, incl. home-screen
  installed PWAs; no permission prompt; HTTPS only — satisfied by Vercel).
  The browser silently releases the lock when the page is hidden or the screen
  is locked manually; the hook re-acquires on `visibilitychange → visible`
  (only when it isn't already holding an active sentinel) and releases on
  unmount / `active → false`.
- **Fallback: silent looping video (added 2026-09-15 after owner's test).**
  The Wake Lock API is NOT available in **WKWebView** — the engine Apple
  requires for ALL third-party iOS browsers (Brave/Chrome/Firefox on iPad;
  caniwebview.com: "widely available in browsers but not in WebViews"). In
  those browsers, and whenever a wake-lock request is rejected (Low Power
  Mode etc.), the hook plays a hidden, unmuted-with-silent-audio-track,
  `playsinline` looping video (`public/media/silence-loop.mp4`, 2.4KB, 2s,
  64×36 black h264-baseline + silent AAC). Active media playback prevents
  iOS auto-lock regardless of the Wake Lock API — the classic NoSleep.js /
  streaming-site mechanism. Unmuted video needs a user gesture on iOS: live
  screens are entered by a tap, and `pointerup/touchend/keydown` listeners
  retry `play()` if autoplay was blocked. The video is paused + removed on
  unmount/deactivate, and when a real wake lock is (re)acquired.
- Silent no-op on total failure: the classroom must never show an error
  because the device keeps auto-locking. Activation path is reported as a
  Sentry breadcrumb (`category: 'wake-lock'`) for field diagnosis.

Wired into exactly two surfaces, so any device showing a live lesson stays
awake and everything else keeps normal auto-lock:

- `apps/board/ClassroomBoard.tsx` — the `/board` projection screen
- `apps/teacher/LiveCommander.tsx` — the `/teacher/live` control screen

No settings toggle, no UI, no student-app coverage (student devices should
sleep normally). The video is intentionally NOT PWA-precached (the board needs
network for realtime anyway; keeps the precache manifest untouched).

## Testing

Vitest + jsdom with a faked `navigator.wakeLock` and spied
`HTMLMediaElement.play/pause`: wake-lock acquire/release/re-acquire semantics
(9 tests) plus fallback behavior (5 tests): video created with
`playsinline`+loop+correct src when the API is missing or rejects, no video
while the lock is held, pause+remove on unmount, play retried after a user
gesture when autoplay was blocked, play retried on visibility→visible.

## Deploy

Frontend-only → push to master auto-deploys to Vercel. Already-open iPads pick
it up via the update banner (AGENTS.md §8.1) — a stale tab is also why a
fresh test can wrongly "fail".

