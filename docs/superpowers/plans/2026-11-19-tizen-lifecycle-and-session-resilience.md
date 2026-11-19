# Sub-Project 1: Tizen Hardware Lifecycle & Session Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Samsung Tizen `1.0` hardware lifecycle and session resilience: prevent TV screensaver during active playback, cleanly suspend/restore `AVPlay` & HLS playback across Smart Hub backgrounding (`visibilitychange`), show an *"Exit Kadr?"* confirmation dialog on root Back, and recover cleanly from mid-session `401 Unauthorized` token expiry without disrupting private-library PIN entry.

**Architecture:** Introduce a dedicated Tizen platform adapter (`src/utils/tizenLifecycle.ts`) paired with `appcommon` / `application.launch` privileges in `config.xml`, extend `PlayerDriver` (`TizenAvplayDriver` & `Html5PlayerDriver`) with `suspend()` / `restore(resumeMs, autoPlay)` hooks orchestrated by `PlayerScreen`, add a capture-phase `<ExitConfirmModal>` wired to root Back on `BrowseScreen` & `ServerConnectScreen`, and centralize `401` token-expiry callbacks in `ApiClient` (`skipUnauthorizedHandler` on `/unlock`).

**Tech Stack:** React 19, TypeScript 5.7, Vite 6 (`chrome69` legacy bundle), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex `gap-*` classes** in any new or modified JSX/CSS (also replace any pre-existing `gap-*` classes in `ProfileSelectScreen.tsx` and `ServerConnectScreen.tsx` while touching them so every modified file passes `grep -rn "gap-"` with 0 matches).
- Keep `BrowseScreen` and modal trees unmounted while `view === 'player'` so `AVPlay`'s transparent hardware video plane remains unobstructed.
- `POST /api/v1/libraries/{id}/unlock` returns `HTTP 401` (`{"error": "Invalid PIN"}`) on an incorrect private-library PIN and **must** pass `{ skipUnauthorizedHandler: true }` so mistyping a library PIN never logs the user out of their profile.

---

### Task 1: Tizen Platform Lifecycle Adapter, Manifest Privileges & `ApiClient` `401` Guard

**Files:**
- Modify: `config.xml:8-13`
- Create: `src/utils/tizenLifecycle.ts`
- Modify: `src/api/client.ts:1-93`
- Modify: `src/api/libraries.ts:20-35`
- Create: `tests/utils/tizenLifecycle.test.ts`
- Modify: `tests/api/client.test.ts`

**Interfaces:**
- Produces:
  - `src/utils/tizenLifecycle.ts`:
    - `export function setTvScreenSaver(preventSleep: boolean): void`
    - `export function exitTvApp(): void`
    - `export function resetScreenSaverStateForTests(): void`
  - `src/api/client.ts`:
    - `export interface ApiRequestOptions extends RequestInit { skipUnauthorizedHandler?: boolean; }`
    - `ApiClient.prototype.setOnUnauthorized(handler: (() => void) | null): void`
    - `ApiClient.prototype.fetch<T>(path: string, options?: ApiRequestOptions): Promise<T>`
    - `ApiClient.prototype.fetchText(urlOrPath: string, options?: ApiRequestOptions): Promise<string>`

- [ ] **Step 1: Write failing unit tests in `tests/utils/tizenLifecycle.test.ts` and `tests/api/client.test.ts`**

Create `tests/utils/tizenLifecycle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exitTvApp,
  resetScreenSaverStateForTests,
  setTvScreenSaver,
} from '../../src/utils/tizenLifecycle';

describe('tizenLifecycle platform adapter', () => {
  beforeEach(() => {
    resetScreenSaverStateForTests();
    delete (window as any).webapis;
    delete (window as any).tizen;
  });

  afterEach(() => {
    resetScreenSaverStateForTests();
    delete (window as any).webapis;
    delete (window as any).tizen;
  });

  it('toggles Samsung webapis.appcommon.setScreenSaver OFF (1) and ON (0) without redundant duplicate calls', () => {
    const setScreenSaver = vi.fn((_state, onSuccess) => onSuccess?.());
    (window as any).webapis = {
      appcommon: {
        AppCommonScreenSaverState: {
          SCREEN_SAVER_ON: 0,
          SCREEN_SAVER_OFF: 1,
        },
        setScreenSaver,
      },
    };

    setTvScreenSaver(true);
    setTvScreenSaver(true); // duplicate — skipped
    expect(setScreenSaver).toHaveBeenCalledTimes(1);
    expect(setScreenSaver).toHaveBeenLastCalledWith(
      1,
      expect.any(Function),
      expect.any(Function)
    );

    setTvScreenSaver(false);
    expect(setScreenSaver).toHaveBeenCalledTimes(2);
    expect(setScreenSaver).toHaveBeenLastCalledWith(
      0,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('exits via tizen.application.getCurrentApplication().exit() and falls back to window.close()', () => {
    const exitSpy = vi.fn();
    (window as any).tizen = {
      application: {
        getCurrentApplication: () => ({ exit: exitSpy }),
      },
    };

    exitTvApp();
    expect(exitSpy).toHaveBeenCalledTimes(1);

    delete (window as any).tizen;
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    try {
      exitTvApp();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
    }
  });
});
```

Append to `tests/api/client.test.ts`:

```ts
import { unlockLibrary } from '../../src/api/libraries';

describe('ApiClient 401 session-expiry guard', () => {
  it('fires onUnauthorized strictly once across concurrent 401 responses and skips it when skipUnauthorizedHandler is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
      })
    );

    try {
      const client = new ApiClient('http://localhost:8492');
      const onUnauthorized = vi.fn();
      client.setToken('expired-jwt');
      client.setOnUnauthorized(onUnauthorized);

      // Private-library PIN check (skipUnauthorizedHandler: true) must NOT trigger logout
      await expect(unlockLibrary(client, 'lib-vault', '0000')).rejects.toThrow(/401/);
      expect(onUnauthorized).not.toHaveBeenCalled();

      // Concurrent authenticated requests failing with 401 fire onUnauthorized strictly once
      await Promise.allSettled([
        client.fetch('/api/v1/screens'),
        client.fetch('/api/v1/items/10'),
        client.fetchText('/api/v1/subtitles/1/stream.vtt'),
      ]);

      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run Vitest to verify failure (RED)**

Run: `npx vitest run tests/utils/tizenLifecycle.test.ts tests/api/client.test.ts`
Expected: FAIL (`Cannot find module '../../src/utils/tizenLifecycle'`).

- [ ] **Step 3: Implement `config.xml`, `src/utils/tizenLifecycle.ts`, `src/api/client.ts`, and `src/api/libraries.ts`**

1. Update `config.xml` to include:
   ```xml
   <tizen:privilege name="http://developer.samsung.com/privilege/appcommon"/>
   <tizen:privilege name="http://tizen.org/privilege/application.launch"/>
   ```
2. Create `src/utils/tizenLifecycle.ts`:
   ```ts
   let lastPreventSleepState: boolean | null = null;
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   let activeWakeLock: any = null;

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
   ```
3. Update `src/api/client.ts`:
   - Export `ApiRequestOptions extends RequestInit { skipUnauthorizedHandler?: boolean; }`.
   - Add `private onUnauthorizedHandler: (() => void) | null = null;` and `setOnUnauthorized(handler: (() => void) | null): void`.
   - Destructure `{ skipUnauthorizedHandler, ...fetchInit } = options` in both `fetch` and `fetchText` (passing `fetchInit` to `globalThis.fetch`).
   - When `res.status === 401 && this.token !== null && !skipUnauthorizedHandler`: set `this.token = null;` and call `this.onUnauthorizedHandler?.()`.
4. Update `src/api/libraries.ts` (`unlockLibrary`): pass `skipUnauthorizedHandler: true` inside the options object to `client.fetch`.

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `npx vitest run tests/utils/tizenLifecycle.test.ts tests/api/client.test.ts && npx tsc -b`
Expected: PASS (100% green).

- [ ] **Step 5: Commit Task 1**

```bash
git add config.xml src/utils/tizenLifecycle.ts src/api/client.ts src/api/libraries.ts tests/utils/tizenLifecycle.test.ts tests/api/client.test.ts
git commit -m "feat(lifecycle): add Tizen screensaver/exit adapter and 401 session guard"
```

---

### Task 2: Screensaver Lock & Smart Hub `visibilitychange` Suspend/Restore in Drivers & `PlayerScreen`

**Files:**
- Modify: `src/player/driver.ts:24-41`
- Modify: `src/player/avplay-driver.ts:250-265,420-445,780-815`
- Modify: `src/player/html5-driver.ts:220-263`
- Modify: `src/screens/PlayerScreen.tsx:145-175,970-1015,1315-1395`
- Modify: `tests/player/driver.test.ts`
- Modify: `tests/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `setTvScreenSaver` from `src/utils/tizenLifecycle.ts`
- Produces:
  - `PlayerDriver.suspend?(): void`
  - `PlayerDriver.restore?(resumeMs: number, autoPlay: boolean): boolean`

- [ ] **Step 1: Write failing tests in `tests/player/driver.test.ts` and `tests/screens/PlayerScreen.test.tsx`**

Add to `tests/player/driver.test.ts`:
- Test `TizenAvplayDriver.suspend() and restore()`:
  - On Direct Play URL (`http://localhost:8492/api/v1/stream/42`), `suspend()` calls `avplay.suspend()`, `restore(45000, false)` calls `avplay.restore('http://localhost:8492/api/v1/stream/42', 45000, false)` + `avplay.pause()`, emits `'paused'`, and returns `true`; `restore(0, true)` calls `avplay.restore(..., 0, false)` + `avplay.play()`, emits `'playing'`, and returns `true`.
  - On HLS URL (`http://localhost:8492/api/v1/media/42/hls/master.m3u8`), `restore(45000, false)` returns `false` so `PlayerScreen` opens a fresh HLS transcode session instead of restoring a reaped `.m3u8` session.

Add to `tests/screens/PlayerScreen.test.tsx`:
- Test `locks TV screensaver while playing/buffering and restores screensaver on pause, ended, hide, and unmount`.
- Test `suspends playback & flushes progress when document becomes hidden, then restores VOD paused with OSD visible on foreground return (and auto-resumes live streams)`.

- [ ] **Step 2: Run Vitest on driver & player tests to verify failure (RED)**

Run: `npx vitest run tests/player/driver.test.ts tests/screens/PlayerScreen.test.tsx`
Expected: FAIL (`driver.suspend is not a function` / `setScreenSaver` not invoked).

- [ ] **Step 3: Implement `suspend`/`restore` on `TizenAvplayDriver` & `Html5PlayerDriver` and wire screensaver + `visibilitychange` in `PlayerScreen.tsx`**

1. In `src/player/driver.ts`: add `suspend?(): void;` and `restore?(resumeMs: number, autoPlay: boolean): boolean;` to `PlayerDriver`.
2. In `src/player/avplay-driver.ts`:
   - Track `private currentStreamUrl = '';` and `private isSuspended = false;` (set in `init`, cleared in `destroy`).
   - Implement `suspend()`:
     ```ts
     suspend(): void {
       if (this.isDestroyed || this.isSuspended) return;
       this.isSuspended = true;
       this.clearSeekInFlight();
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       const avplay = (window as any).webapis?.avplay;
       try {
         if (typeof avplay?.suspend === 'function') {
           avplay.suspend();
         } else {
           avplay?.pause?.();
         }
       } catch (e) {
         console.warn('[AVPlay] suspend failed:', e);
       }
     }
     ```
   - Implement `restore(resumeMs: number, autoPlay: boolean): boolean`:
     ```ts
     restore(resumeMs: number, autoPlay: boolean): boolean {
       if (this.isDestroyed || !this.currentStreamUrl) return false;
       this.isSuspended = false;
       if (this.currentIsHls) {
         // HLS sessions on Kadr may be reaped while backgrounded; let PlayerScreen re-init cleanly
         return false;
       }
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       const avplay = (window as any).webapis?.avplay;
       if (!avplay || typeof avplay.restore !== 'function') {
         return false;
       }
       const targetMs = Math.max(0, Math.floor(resumeMs));
       try {
         avplay.restore(this.currentStreamUrl, targetMs, false);
         this.currentTimeMs = targetMs;
         try {
           avplay.setSilentSubtitle?.(true);
         } catch {
           // Ignored
         }
         this.applyStreamAspectLayout(avplay);
         if (autoPlay) {
           avplay.play?.();
           this.applyLetterboxDisplayMode(avplay);
           this.stateCallback?.('playing');
         } else {
           avplay.pause?.();
           this.stateCallback?.('paused');
         }
         return true;
       } catch (e) {
         console.warn('[AVPlay] restore failed, falling back to full reload:', e);
         return false;
       }
     }
     ```
3. In `src/player/html5-driver.ts`:
   - Implement `suspend()`: calls `this.pause()`.
   - Implement `restore(_resumeMs: number, autoPlay: boolean): boolean`: if `!this.video || this.video.error`, return `false`; if `autoPlay`, call `this.play()`, else call `this.pause()`; return `true`.
4. In `src/screens/PlayerScreen.tsx`:
   - Add `isDocumentHidden` state (`typeof document !== 'undefined' ? Boolean(document.hidden) : false`) and `pauseAfterRestoreRef = useRef(false)` (reset to `false` on `itemId` change).
   - Screensaver effect:
     ```ts
     useEffect(() => {
       const shouldPreventSleep =
         !isDocumentHidden &&
         !playbackError &&
         (playerState === 'playing' || playerState === 'buffering');
       setTvScreenSaver(shouldPreventSleep);
     }, [isDocumentHidden, playbackError, playerState]);

     useEffect(() => {
       return () => {
         setTvScreenSaver(false);
       };
     }, []);
     ```
   - In `driver.onStateChange`: when `state === 'playing'` and `pauseAfterRestoreRef.current === true`:
     ```ts
     pauseAfterRestoreRef.current = false;
     driver.pause();
     playerStateRef.current = 'paused';
     setPlayerState('paused');
     osdDismissedByUserRef.current = false;
     setShowOSD(true);
     return;
     ```
   - Add `visibilitychange` effect on `document`:
     - When `document.hidden === true`:
       - Set `wasHiddenRef.current = true` and `setIsDocumentHidden(true)`.
       - If `(hasStartedPlaybackRef.current || positionMsRef.current > 0) && !isLiveStreamRef.current`: flush progress via `sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000))` (when `hasActiveSessionRef.current`) or `reportPlaybackProgress(serverUrl, token, itemId, positionMsRef.current, true)`.
       - Call `driverRef.current?.suspend?.()`.
       - Set `playerStateRef.current = 'paused'`, `setPlayerState('paused')`, `osdDismissedByUserRef.current = false`, `setShowOSD(true)`.
     - When `!document.hidden` and `wasHiddenRef.current === true`:
       - `wasHiddenRef.current = false;`
       - `setIsDocumentHidden(false);`
       - `const autoPlay = isLiveStreamRef.current;`
       - `const targetPos = positionMsRef.current;`
       - `const handled = driverRef.current?.restore?.(targetPos, autoPlay) ?? false;`
       - If `!handled`:
         - `pauseAfterRestoreRef.current = !autoPlay;`
         - If `isHlsRef.current && !autoPlay && targetPos > 0`, set `hlsSeekOffsetMsRef.current = targetPos` and `setHlsSeekOffsetMs(targetPos)`.
         - `setReloadKey((k) => k + 1);`
       - Set `osdDismissedByUserRef.current = false` and `setShowOSD(true)`.

- [ ] **Step 4: Run all player & driver tests to verify GREEN**

Run: `npx vitest run tests/player/driver.test.ts tests/screens/PlayerScreen.test.tsx tests/screens/PlayerScreen.hls.test.tsx tests/screens/PlayerScreen.seeking.test.tsx tests/screens/PlayerScreen.playlist.test.tsx && npx tsc -b`
Expected: PASS (100% green).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/player/driver.ts src/player/avplay-driver.ts src/player/html5-driver.ts src/screens/PlayerScreen.tsx tests/player/driver.test.ts tests/screens/PlayerScreen.test.tsx
git commit -m "feat(player): lock TV screensaver and handle Smart Hub suspend/restore"
```

---

### Task 3: `<ExitConfirmModal>`, Root Back Exit Triggers & `App.tsx` Session-Expired Recovery

**Files:**
- Create: `src/components/tv/ExitConfirmModal.tsx`
- Modify: `src/screens/BrowseScreen.tsx:28-55,953-970`
- Modify: `src/screens/ServerConnectScreen.tsx:9-12,32-45,82-165`
- Modify: `src/screens/ProfileSelectScreen.tsx:8-17,79-194`
- Modify: `src/App.tsx:25-185,425-605`
- Create: `tests/components/ExitConfirmModal.test.tsx`
- Modify: `tests/App.test.tsx`

**Interfaces:**
- Consumes: `exitTvApp` from `src/utils/tizenLifecycle.ts`, `ApiClient.setOnUnauthorized` from `src/api/client.ts`
- Produces:
  - `src/components/tv/ExitConfirmModal.tsx`: `export interface ExitConfirmModalProps { isOpen: boolean; onCancel: () => void; onConfirmExit: () => void; }`
  - `BrowseScreenProps.onRequestExit?: () => void`
  - `ServerConnectScreenProps.onRequestExit?: () => void`
  - `ProfileSelectScreenProps.noticeMessage?: string | null`

- [ ] **Step 1: Write failing unit & integration tests in `tests/components/ExitConfirmModal.test.tsx` and `tests/App.test.tsx`**

Create `tests/components/ExitConfirmModal.test.tsx`:
- Verify `<ExitConfirmModal>` renders zero `gap-*` classes, focuses `Cancel` (`exit-cancel-btn`) by default, closes via `onCancel` on `TVKeys.BACK_TIZEN` (`10009`) with `stopImmediatePropagation()`, and invokes `onConfirmExit` on `ArrowRight` + `Enter` (or clicking `Exit Kadr`).

Add to `tests/App.test.tsx`:
1. `opens ExitConfirmModal on Back from BrowseScreen root sidebar (after retreating from content) and calls Tizen exit on confirm`:
   - Authenticate into `BrowseScreen` (focus starts on content card `Hero Dune Feature`).
   - First Back (`Escape` / `BACK_TIZEN`): moves focus to sidebar (`nav-screen-home`), `Exit Kadr?` is **not** open.
   - Second Back while on sidebar: opens `Exit Kadr?` dialog (`role="dialog"`).
   - Press Back once: cancels `Exit Kadr?` dialog (`exitSpy` not called).
   - Press Back on sidebar again -> click / activate `Exit Kadr` -> asserts `tizen.application.getCurrentApplication().exit()` was called once!
2. `redirects cleanly to ProfileSelectScreen with session-expired banner on mid-session 401 without logging out on invalid private-library PIN`:
   - Authenticate into `BrowseScreen`, open `FolderBrowserModal`, mock `fetchMediaItem` rejecting via `ApiClient` `401` (or trigger a real `client.fetch` `401`), and assert `App` transitions to `ProfileSelectScreen` displaying `"Session expired — please enter your PIN to continue"` and clears `localStorage.getItem('kadr_token')`.

- [ ] **Step 2: Run Vitest to verify failure (RED)**

Run: `npx vitest run tests/components/ExitConfirmModal.test.tsx tests/App.test.tsx -t "ExitConfirmModal|session-expired"`
Expected: FAIL (`Cannot find module '../../src/components/tv/ExitConfirmModal'`).

- [ ] **Step 3: Implement `ExitConfirmModal.tsx`, root Back triggers, zero-gap cleanup in `ProfileSelectScreen`/`ServerConnectScreen`, and `App.tsx` integration**

1. Create `src/components/tv/ExitConfirmModal.tsx`:
   - Uses `FocusContext` (`pushTrap('exit-confirm-modal')` / `popTrap('exit-confirm-modal')`, focusing `exit-cancel-btn` on open) and capture-phase `window.addEventListener('keydown', ..., true)` checking `activeTrap === 'exit-confirm-modal'` to dismiss on `BACK_TIZEN` / `Escape` / `Backspace` (`e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); onCancel();`).
   - Renders `TVButton`s `exit-cancel-btn` (`variant="secondary"`, label `"Cancel"`) and `exit-confirm-btn` (`variant="danger"`, label `"Exit Kadr"`) with explicit `mr-4`, `mb-3`, `mb-6` margins (**zero `gap-*` classes**).
2. Update `src/screens/BrowseScreen.tsx`:
   - Add `onRequestExit?: () => void;` to `BrowseScreenProps` (stored in `onRequestExitRef`).
   - In `BrowseScreen.tsx`'s `handleKeyDown` Back branch (`lines 954-967`):
     - Keep existing `if (!onSidebar && isValidContentNode(currentFocused, layout, activeTab))` moving focus to `nav-screen-${activeTab}`.
     - Add `else { e.preventDefault(); e.stopPropagation(); onRequestExitRef.current?.(); return; }` so pressing Back when already on the sidebar (or when no content node exists) requests exit confirmation!
3. Update `src/screens/ServerConnectScreen.tsx`:
   - Add `onRequestExit?: () => void;` to `ServerConnectScreenProps` and bind a `keydown` handler (ignoring `Backspace` inside `#manual-ip-input`, blurring `#manual-ip-input` first on `BACK_TIZEN`/`Escape` if `document.activeElement` is an input, and otherwise calling `onRequestExit?.()`).
   - Replace all pre-existing `gap-*` classes in `ServerConnectScreen.tsx` with explicit `mb-*` / `mr-*` margins so `grep -rn "gap-" src/screens/ServerConnectScreen.tsx` returns 0 matches!
4. Update `src/screens/ProfileSelectScreen.tsx`:
   - Add `noticeMessage?: string | null;` to `ProfileSelectScreenProps` and render a prominent Kadr notice pill (`data-testid="session-expired-banner"`) above the profile row when present.
   - Replace all pre-existing `gap-*` classes in `ProfileSelectScreen.tsx` with explicit `mb-*` / `mr-*` margins so `grep -rn "gap-" src/screens/ProfileSelectScreen.tsx` returns 0 matches!
5. Update `src/App.tsx`:
   - Add `isExitModalOpen` (`useState(false)`, reset whenever `view` changes) and `sessionExpiredNotice` (`useState<string | null>(null)`, cleared in `handleLogin`, `handleSwitchServer`, and manual `onSwitchProfile`).
   - Wire `client.setOnUnauthorized` in a `useEffect([client])`:
     ```ts
     useEffect(() => {
       const handleUnauthorized = () => {
         localStorage.removeItem('kadr_token');
         setToken(null);
         setCurrentUserId(null);
         setActiveItem(null);
         setActivePlaylistId(null);
         setAddToPlaylistTarget(null);
         setFolderBrowserState(null);
         setImageViewerState(null);
         setUnlockLibraryId(null);
         setItemDetailViewState(null);
         setSuspendedItemDetail(null);
         sessionProgressRef.current.clear();
         client.clearLibraryUnlockTokens();
         setSessionExpiredNotice('Session expired — please enter your PIN to continue');
         setView('profiles');
       };
       client.setOnUnauthorized(handleUnauthorized);
       return () => {
         client.setOnUnauthorized(null);
       };
     }, [client]);
     ```
   - Pass `onRequestExit={() => setIsExitModalOpen(true)}` to `ServerConnectScreen` and `BrowseScreen`, pass `noticeMessage={sessionExpiredNotice}` to `ProfileSelectScreen`, and render `<ExitConfirmModal isOpen={isExitModalOpen} onCancel={() => setIsExitModalOpen(false)} onConfirmExit={() => { setIsExitModalOpen(false); exitTvApp(); }} />` inside `<FocusProvider>` when `view !== 'player'`.

- [ ] **Step 4: Run full verification, zero-gap check, production build, and `.wgt` packaging**

Run:
1. `(! grep -rn "gap-" src/utils/tizenLifecycle.ts src/api/client.ts src/api/libraries.ts src/player/driver.ts src/player/avplay-driver.ts src/player/html5-driver.ts src/components/tv/ExitConfirmModal.tsx src/screens/PlayerScreen.tsx src/screens/BrowseScreen.tsx src/screens/ServerConnectScreen.tsx src/screens/ProfileSelectScreen.tsx src/App.tsx)`
2. `npm test -- --run`
3. `npm run build && npm run package:wgt -- --no-build`
Expected: 100% test suites passing, 0 `gap-*` matches across all touched files, `chrome69` build green, and `kadr.wgt` signed cleanly.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/components/tv/ExitConfirmModal.tsx src/screens/BrowseScreen.tsx src/screens/ServerConnectScreen.tsx src/screens/ProfileSelectScreen.tsx src/App.tsx tests/components/ExitConfirmModal.test.tsx tests/App.test.tsx
git commit -m "feat(app): add root Back exit dialog and centralized 401 session recovery"
```
