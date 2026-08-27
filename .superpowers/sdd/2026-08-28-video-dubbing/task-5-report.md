# Task 5 Report — `DubPlayer` synced playback component

**Status:** COMPLETE

## Files
- Created: `components/shared/DubPlayer.tsx` (~160 lines)
- Created: `test/DubPlayer.test.tsx` (7 tests)

## What was built
`DubPlayer` — a `forwardRef<DubPlayerHandle, DubPlayerProps>` component that plays the clip video (always `muted`, re-asserted on every `play()`) while firing the student's per-line recorded audio in sync:

- **Preload:** a `useEffect` keyed on `lines`/`lineAudioUrls` builds one `new Audio(url)` (`preload='auto'`) per line that has a recorded blob; lines without audio are silent. Cleanup on unmount/key change pauses and drops them.
- **Scheduler:** `play()` clears the fired-flag set and starts a `requestAnimationFrame` loop comparing `video.currentTime * 1000` against each line's `[startMs, endMs)` window. First entry into a window fires that line's audio (`.currentTime = 0` then `.play()`), guarded by the fired-set so a line fires at most once per playback pass. Gap frames emit `onLineChange(-1)`.
- **Reset semantics:** fired flags reset on `play()` and on the video's `seeked` event (which also stops all audio), so replaying or seeking re-fires lines cleanly.
- **Pause:** stops the rAF loop, pauses all line audio and the video.
- **Unmount:** cancels rAF, pauses all audio and the video.
- The component never calls `DubbingService` — it only consumes already-signed URLs, exactly per the contract.

Deviations from brief: used `forwardRef` (the brief's `RefForwardingComponent` is deprecated) and exported `DubPlayerHandle` alongside the default export; test file is `.tsx` (needs JSX), per coordinator instructions.

## Tests
`npx vitest run test/DubPlayer.test.tsx` → **7/7 PASS**. Covers: muted video element; first-line audio at t=0; second-line audio when currentTime passes 1500ms; no double-fire across repeated rAF ticks; `onLineChange(-1)` in gaps; pause stops the current line's audio; flags reset so a new playback pass re-fires lines.

Mocking: `HTMLMediaElement.prototype.play/pause` spies (targets identified via `mock.contexts`, since prototype spies receive the element as `this`, not as an argument); manual rAF via `vi.stubGlobal('requestAnimationFrame', ...)` capturing callbacks; jsdom never advances `currentTime` on its own so time is set explicitly.

Full suite: 472 passed / 12 failed / 1 skipped — the 12 failures are the pre-existing baseline in `test/BoardComponents.test.tsx` and `test/DataService.test.ts`. No new failures.

## Concerns
- Drift/jitter: the rAF scheduler fires a line's audio at the first frame ≥ `startMs`, so worst-case trigger latency is one frame (~16ms) plus audio element start latency. Acceptable for dubbed playback; if tighter sync is ever needed, `audio.currentTime` could be seeded with the overshoot.
- Autoplay rejection on the video (rare, since it is muted) is swallowed; the audio scheduler still runs against `currentTime`, which would then not advance — an edge case only if a host browser blocks muted autoplay.
