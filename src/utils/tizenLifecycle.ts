let lastPreventSleepState: boolean | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeWakeLock: any = null;

/** Reset cached screen-saver state and release any active WakeLock (for unit tests). */
export function resetScreenSaverStateForTests(): void {
  lastPreventSleepState = null;
  if (activeWakeLock && typeof activeWakeLock.release === 'function') {
    try {
      activeWakeLock.release().catch?.(() => {});
    } catch {
      // Ignored
    }
  }
  activeWakeLock = null;
}

/** Toggle Samsung TV screensaver (or browser WakeLock fallback) when sleep prevention changes. */
export function setTvScreenSaver(preventSleep: boolean): void {
  if (typeof window === 'undefined') return;
  if (lastPreventSleepState === preventSleep) return;
  lastPreventSleepState = preventSleep;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appcommon = (window as any).webapis?.appcommon;
    if (typeof appcommon?.setScreenSaver === 'function') {
      const states = appcommon.AppCommonScreenSaverState;
      const target = preventSleep
        ? states?.SCREEN_SAVER_OFF ?? 1
        : states?.SCREEN_SAVER_ON ?? 0;
      appcommon.setScreenSaver(
        target,
        () => {},
        (err: unknown) => {
          console.warn('[TizenLifecycle] setScreenSaver failed:', err);
        }
      );
      return;
    }
  } catch (err) {
    console.warn('[TizenLifecycle] setScreenSaver exception:', err);
  }

  // Progressive web WakeLock fallback for Web Dev Harness
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (preventSleep && typeof nav?.wakeLock?.request === 'function') {
      nav.wakeLock
        .request('screen')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((sentinel: any) => {
          if (lastPreventSleepState === true) {
            activeWakeLock = sentinel;
          } else {
            sentinel?.release?.().catch?.(() => {});
          }
        })
        .catch(() => {});
    } else if (!preventSleep && activeWakeLock) {
      const sentinel = activeWakeLock;
      activeWakeLock = null;
      sentinel.release?.().catch?.(() => {});
    }
  } catch {
    // Ignored
  }
}

/** Exit the Tizen TV application, falling back to `window.close()` in browser environments. */
export function exitTvApp(): void {
  if (typeof window === 'undefined') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = (window as any).tizen?.application?.getCurrentApplication?.();
    if (typeof app?.exit === 'function') {
      app.exit();
      return;
    }
  } catch (err) {
    console.warn('[TizenLifecycle] tizen application exit failed:', err);
  }
  try {
    window.close?.();
  } catch {
    // Ignored
  }
}
