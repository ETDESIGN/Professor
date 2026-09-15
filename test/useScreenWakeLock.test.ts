import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { useScreenWakeLock } from '../hooks/useScreenWakeLock';

type FakeSentinel = {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: 'release', fn: () => void) => void;
  notifyRelease: () => void;
};

function installWakeLock() {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    const s = {} as FakeSentinel;
    const listeners: Array<() => void> = [];
    s.released = false;
    s.release = vi.fn(async () => { s.released = true; });
    s.addEventListener = (_t, fn) => { listeners.push(fn); };
    s.notifyRelease = () => { s.released = true; listeners.forEach((fn) => fn()); };
    sentinels.push(s);
    return s;
  });
  (navigator as any).wakeLock = { request };
  return { request, sentinels };
}

function setVisibility(v: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
}

function visibilityChanged() {
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

let restoreVisibility: () => void;
let playSpy: MockInstance<() => Promise<void>>;

beforeEach(() => {
  installWakeLock();
  const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  restoreVisibility = () => { if (original) Object.defineProperty(document, 'visibilityState', original); };
  setVisibility('visible');
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined);
});

afterEach(() => {
  delete (navigator as any).wakeLock;
  restoreVisibility();
  vi.restoreAllMocks();
});

describe('useScreenWakeLock', () => {
  it('requests a screen wake lock on mount while active', async () => {
    renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect((navigator as any).wakeLock.request).toHaveBeenCalledTimes(1));
    expect((navigator as any).wakeLock.request).toHaveBeenCalledWith('screen');
  });

  it('does not request while inactive, and starts when activated', async () => {
    const { rerender } = renderHook(({ a }) => useScreenWakeLock(a), { initialProps: { a: false } });
    expect((navigator as any).wakeLock.request).not.toHaveBeenCalled();
    rerender({ a: true });
    await waitFor(() => expect((navigator as any).wakeLock.request).toHaveBeenCalledTimes(1));
  });

  it('releases the sentinel on unmount', async () => {
    const installed = installWakeLock();
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(installed.request).toHaveBeenCalledTimes(1));
    unmount();
    await waitFor(() => expect(installed.sentinels[0].release).toHaveBeenCalled());
  });

  it('releases the sentinel when deactivated', async () => {
    const installed = installWakeLock();
    const { rerender } = renderHook(({ a }) => useScreenWakeLock(a), { initialProps: { a: true } });
    await waitFor(() => expect(installed.request).toHaveBeenCalledTimes(1));
    rerender({ a: false });
    await waitFor(() => expect(installed.sentinels[0].release).toHaveBeenCalled());
  });

  it('re-acquires after a browser-initiated release once the page is visible again', async () => {
    const installed = installWakeLock();
    renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(installed.request).toHaveBeenCalledTimes(1));
    // Tab hidden → browser auto-releases the sentinel (fires its release event).
    installed.sentinels[0].notifyRelease();
    setVisibility('visible');
    visibilityChanged();
    await waitFor(() => expect(installed.request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(installed.sentinels[1]).toBeTruthy());
  });

  it('does not re-acquire while the page is hidden', async () => {
    const installed = installWakeLock();
    renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(installed.request).toHaveBeenCalledTimes(1));
    installed.sentinels[0].notifyRelease();
    setVisibility('hidden');
    visibilityChanged();
    expect(installed.request).toHaveBeenCalledTimes(1);
  });

  it('does not request a redundant sentinel while it already holds one', async () => {
    const installed = installWakeLock();
    renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(installed.request).toHaveBeenCalledTimes(1));
    setVisibility('visible');
    visibilityChanged();
    // Give any (wrong) async re-request a chance to land before asserting.
    await act(async () => {});
    expect(installed.request).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the request is rejected', async () => {
    (navigator as any).wakeLock = {
      request: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
    };
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow();
    await act(async () => {});
    expect((navigator as any).wakeLock.request).toHaveBeenCalledTimes(1);
  });
});

describe('useScreenWakeLock — video fallback (WKWebView browsers without the Wake Lock API, e.g. Brave on iPad)', () => {
  it('starts a silent looping inline video when the API is missing', async () => {
    delete (navigator as any).wakeLock;
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.hasAttribute('playsinline')).toBe(true);
    expect(video!.loop).toBe(true);
    expect(video!.src).toContain('/media/silence-loop.mp4');
    expect(playSpy).toHaveBeenCalled();
  });

  it('starts the video fallback when the wake lock request is rejected', async () => {
    (navigator as any).wakeLock = {
      request: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
    };
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    expect(document.querySelector('video')).toBeTruthy();
    expect(playSpy).toHaveBeenCalled();
  });

  it('does not start any video while the wake lock is held', async () => {
    const installed = installWakeLock();
    renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(installed.request).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(document.querySelector('video')).toBeNull();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('pauses and removes the video on unmount', async () => {
    delete (navigator as any).wakeLock;
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    expect(document.querySelector('video')).toBeTruthy();
    unmount();
    expect(document.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('retries play when autoplay was blocked and the user interacts', async () => {
    delete (navigator as any).wakeLock;
    playSpy.mockRejectedValueOnce(new Error('NotAllowedError'));
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    act(() => { document.dispatchEvent(new Event('pointerup')); });
    await act(async () => {});
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it('resumes the video when the page becomes visible again', async () => {
    delete (navigator as any).wakeLock;
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    setVisibility('visible');
    visibilityChanged();
    await act(async () => {});
    expect(playSpy).toHaveBeenCalledTimes(2);
  });
});
