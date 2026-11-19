# Sub-Project 1: Tizen Hardware Lifecycle & Session Resilience — Design Specification

**Date:** 2026-11-19
**Milestone:** Kadr Tizen `v1.0.0` (Phase 1 of 7)
**Target Platform:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69) & Web Dev Harness

---

## 1. Problem Statement

Four platform lifecycle and session resilience gaps currently stand between `kadr-tizenos` (`v0.1.1`) and Samsung TV `1.0` compliance:

1. **TV Screensaver Interrupts Active Playback:** `config.xml` lacks `http://developer.samsung.com/privilege/appcommon` and `PlayerScreen` never calls `webapis.appcommon.setScreenSaver(SCREEN_SAVER_OFF)`. On Samsung TVs, watching a movie or episode for 15–20 minutes without pressing a remote key allows the system screensaver / ambient dimmer to cover the screen mid-video.
2. **Smart Hub Multitasking Breaks `AVPlay` (`visibilitychange`):** Pressing the **Home / Smart Hub** button on a Samsung remote hides Kadr rather than terminating it (`document.hidden === true`). Because `TizenAvplayDriver` does not call `avplay.suspend()` on hide or `avplay.restore()` on foreground return—and `PlayerScreen` does not flush progress on hide—returning to Kadr leaves the native `AVPlay` plane in a broken/black state and risks losing unsaved watch progress if Tizen reclaims background memory.
3. **No Graceful App Exit from Root Screens:** `config.xml` sets `hwkey-event="enable"`, giving Kadr ownership of `TVKeys.BACK_TIZEN` (`10009`). Pressing Back from content on `BrowseScreen` moves focus to the sidebar, and pressing Back on `ProfileSelectScreen` returns to `ServerConnectScreen`, but pressing Back when **already on the root sidebar** (`BrowseScreen`) or on **`ServerConnectScreen`** currently does nothing—trapping the viewer with no way to exit Kadr via the Back key (`tizen.application.getCurrentApplication().exit()`).
4. **Silent Mid-Session `401 Unauthorized` Failures:** Only `BrowseScreen`'s layout fetch checks for `401`. If a user's JWT expires overnight while inside `FolderBrowserModal`, `ItemDetailModal`, `PlaylistDetailModal`, or `PlayerScreen`, API calls fail individually instead of cleanly clearing the expired token and returning to `ProfileSelectScreen` with a clear session-expired notice. Conversely, `POST /api/v1/libraries/{id}/unlock` intentionally returns `401 {"error": "Invalid PIN"}` on an incorrect private-library PIN and **must never** trigger a profile logout.

---

## 2. Goals & Non-Goals

### Goals
- Prevent the Samsung TV screensaver during active video playback (`playing` / `buffering` while visible) and immediately re-enable it when paused, ended, errored, hidden, or outside the player to protect OLED/LED panels.
- Cleanly suspend playback and flush watch progress when `document.hidden` becomes `true`, and restore VOD streams **paused at the exact timestamp with the OSD visible** (while auto-resuming **live streams**) when Kadr returns to the foreground—automatically recovering if an HLS transcode session expired while backgrounded.
- Open a Kadr-styled, D-pad-operable *"Exit Kadr?"* confirmation modal (`Cancel` focused by default, `Exit Kadr` beside it, zero flex `gap-*` classes) when pressing Back at the root of `BrowseScreen` (sidebar focused, no modal open) or `ServerConnectScreen`, calling `tizen.application.getCurrentApplication().exit()` on confirm.
- Centralize `HTTP 401` session-expiry handling in `ApiClient` (explicitly opting out `unlockLibrary` PIN checks) so expired tokens cleanly reset modal/player state and transition to `ProfileSelectScreen` with a `"Session expired — please enter your PIN to continue"` banner.

### Non-Goals
- Enabling background audio playback while Kadr is minimized (`background-support="disable"` in `config.xml` remains unchanged, as required by standard Samsung Smart Hub video app rules).

---

## 3. Architecture & Components

### 3.1 Tizen Manifest & Platform Adapter (`config.xml` & `src/utils/tizenLifecycle.ts`)

1. **`config.xml` Privileges:**
   - Add `<tizen:privilege name="http://developer.samsung.com/privilege/appcommon"/>` (required for `webapis.appcommon.setScreenSaver`).
   - Add `<tizen:privilege name="http://tizen.org/privilege/application.launch"/>` (standard companion privilege alongside `tizen.application.getCurrentApplication().exit()`).

2. **`src/utils/tizenLifecycle.ts`:**
   - `setTvScreenSaver(preventSleep: boolean): void`:
     - On Samsung Tizen (`window.webapis?.appcommon?.setScreenSaver`): resolves `AppCommonScreenSaverState.SCREEN_SAVER_OFF` (`1`) when `preventSleep === true`, or `AppCommonScreenSaverState.SCREEN_SAVER_ON` (`0`) when `preventSleep === false`, invoking `setScreenSaver(state, onSuccess, onError)` inside `try/catch` and deduplicating redundant calls when desired state hasn't changed.
     - In modern web browsers (`navigator.wakeLock`): acquires/releases a `WakeLockSentinel` (`navigator.wakeLock.request('screen')`) inside `try/catch` as a progressive enhancement for the Web Dev Harness.
     - Exposes `resetScreenSaverCacheForTests()` for deterministic unit testing.
   - `exitTvApp(): void`:
     - Calls `window.tizen?.application?.getCurrentApplication?.()?.exit?.()` inside `try/catch`; if unavailable (Web Dev Harness), falls back to `window.close?.()`.

### 3.2 Screensaver Lock & Smart Hub Suspend/Restore (`driver.ts`, `avplay-driver.ts`, `html5-driver.ts`, `PlayerScreen.tsx`)

1. **Optional Lifecycle Methods on `PlayerDriver` (`src/player/driver.ts`):**
   ```ts
   suspend?(): void;
   restore?(resumeMs: number, autoPlay: boolean): boolean;
   ```
   - `restore` returns `true` when the driver handled restoration natively (or asynchronously via `AVPlay`), or `false` if a full stream reload is required.

2. **`TizenAvplayDriver` Implementation (`src/player/avplay-driver.ts`):**
   - Store `private currentStreamUrl = ''` and `private isSuspended = false` in `init(...)` (cleared in `destroy()`).
   - `suspend()`:
     - No-op if `this.isDestroyed || this.isSuspended`.
     - Marks `this.isSuspended = true`, clears in-flight seek timers (`this.clearSeekInFlight()`), and calls `avplay?.suspend?.()` inside `try/catch` (falling back to `avplay?.pause?.()` if `suspend` is absent on a mock/emulator).
   - `restore(resumeMs: number, autoPlay: boolean): boolean`:
     - If `this.isDestroyed || !this.currentStreamUrl`, returns `false`.
     - Resets `this.isSuspended = false`.
     - **HLS vs Direct Play handling:**
       - When `this.currentIsHls === true`: returns `false` so `PlayerScreen` cleanly opens a fresh HLS transcode session at `hlsSeekOffsetMs = resumeMs` (preventing `AVPlay` from restoring a dead `.m3u8` URL that Kadr's server-side HLS idle reaper already terminated while the user was in Smart Hub).
       - When `this.currentIsHls === false` (Direct Play): calls `avplay.restore(this.currentStreamUrl, Math.max(0, Math.floor(resumeMs)), false)` inside `try/catch`, re-asserts `silenceNativeSubtitles()` and `applyStreamAspectLayout(avplay)`, calls `avplay.play()` + `this.stateCallback?.('playing')` when `autoPlay === true` (live stream) or `avplay.pause?.()` + `this.stateCallback?.('paused')` when `autoPlay === false` (VOD), and returns `true` (`false` if `avplay.restore` throws).

3. **`Html5PlayerDriver` Implementation (`src/player/html5-driver.ts`):**
   - `suspend()`: calls `this.pause()`.
   - `restore(resumeMs: number, autoPlay: boolean): boolean`:
     - If `!this.video`, returns `false`.
     - If `this.hls` (HLS stream), returns `false` if `this.video.error` is set; otherwise for VOD keeps `this.video.pause()` and emits `this.stateCallback?.('paused')`, or for `autoPlay === true` calls `this.play()`, returning `true`.

4. **`PlayerScreen` Integration (`src/screens/PlayerScreen.tsx`):**
   - Track `isDocumentHidden` (`typeof document !== 'undefined' ? Boolean(document.hidden) : false`) and `pauseAfterRestoreRef = useRef(false)`.
   - When `driver` emits `'playing'` right after a foreground VOD HLS reload (`pauseAfterRestoreRef.current === true`), `PlayerScreen` immediately calls `driverRef.current?.pause()`, clears `pauseAfterRestoreRef.current = false`, sets `osdDismissedByUserRef.current = false`, and sets `setShowOSD(true)` — positioning both `TizenAvplayDriver` and `Html5PlayerDriver` at the resumed timestamp in `'paused'` state with the OSD visible.
   - **Screensaver `useEffect`:**
     - Computes `shouldPreventSleep = !isDocumentHidden && !playbackError && (playerState === 'playing' || playerState === 'buffering')`.
     - Calls `setTvScreenSaver(shouldPreventSleep)`, and unconditionally calls `setTvScreenSaver(false)` on `PlayerScreen` unmount!
   - **`visibilitychange` `useEffect`:**
     - On `document.hidden === true`:
       1. `setIsDocumentHidden(true)` (immediately re-enables TV screensaver).
       2. If `(hasStartedPlaybackRef.current || positionMsRef.current > 0) && !isLiveStreamRef.current`, immediately flush current progress (`sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000))` or `reportPlaybackProgress(..., true)`).
       3. Call `driverRef.current?.suspend?.()`.
       4. Set `playerState` / `playerStateRef.current` to `'paused'`, `osdDismissedByUserRef.current = false`, `setShowOSD(true)`.
     - On `document.hidden === false` (after having been hidden):
       1. `setIsDocumentHidden(false)`.
       2. `const autoPlay = isLiveStreamRef.current;`
       3. `const targetPosMs = positionMsRef.current;`
       4. `const handled = driverRef.current?.restore?.(targetPosMs, autoPlay) ?? false;`
       5. If `!handled` (e.g. HLS stream or `avplay.restore` threw):
          - Set `pauseAfterRestoreRef.current = !autoPlay`.
          - If `isHlsRef.current && !autoPlay && targetPosMs > 0`, set `hlsSeekOffsetMsRef.current = targetPosMs` and `setHlsSeekOffsetMs(targetPosMs)`.
          - Increment `setReloadKey((k) => k + 1)`.
       6. Set `osdDismissedByUserRef.current = false` and `setShowOSD(true)`.

### 3.3 Root Back *"Exit Kadr?"* Confirmation Modal (`ExitConfirmModal.tsx`, `BrowseScreen.tsx`, `ServerConnectScreen.tsx`, `App.tsx`)

1. **`src/components/tv/ExitConfirmModal.tsx`:**
   - Props: `{ isOpen: boolean; onCancel: () => void; onConfirmExit: () => void }`.
   - Uses `FocusContext` (`pushTrap('exit-confirm-modal')` / `popTrap('exit-confirm-modal')`) and a capture-phase `window` `'keydown'` listener (`true`) with `stopImmediatePropagation()` on Back (`10009` / `Escape` / `Backspace`), calling `onCancel()`.
   - Focuses `exit-cancel-btn` (**Cancel**) by default on open; `Left` / `Right` navigates between `exit-cancel-btn` (**Cancel**) and `exit-confirm-btn` (**Exit Kadr**); `Enter` activates the focused button.
   - Styled with Kadr theme tokens (`#2A0A0A`, `#3B1111`, `#FF6B00`, `#D43F15`, `.tv-focus-ring`) and explicit margins (`mr-4`, `mb-3`, `mb-6` — **zero `gap-*` classes**).

2. **Root Back Triggers (`BrowseScreen.tsx`, `ServerConnectScreen.tsx`, `App.tsx`):**
   - `BrowseScreenProps`: add optional `onRequestExit?: () => void`. In `BrowseScreen.tsx`'s `handleKeyDown` Back branch (`lines 954-967`), when `onSidebar` is `true` (or no content node exists to retreat from, e.g. empty/loading screen where sidebar holds focus) and `!isModalActive(activeTrap)`, call `e.preventDefault(); e.stopPropagation(); onRequestExit?.();`.
   - `ServerConnectScreenProps`: add optional `onRequestExit?: () => void`. Add a `keydown` handler in `ServerConnectScreen.tsx` that ignores `Backspace` while editing `#manual-ip-input` (and blurs `#manual-ip-input` first on `BACK_TIZEN` / `Escape` if `document.activeElement === inputRef.current`, matching `TVModal` / `SubtitleModal` input discipline!), and otherwise invokes `onRequestExit?.()` on `BACK_TIZEN` / `Escape` / `Backspace`.
   - `App.tsx`: holds `isExitModalOpen` (`boolean`, reset when view changes), renders `<ExitConfirmModal isOpen={isExitModalOpen} onCancel={() => setIsExitModalOpen(false)} onConfirmExit={() => { setIsExitModalOpen(false); exitTvApp(); }} />` when `view !== 'player'`, and wires `onRequestExit={() => setIsExitModalOpen(true)}` to `BrowseScreen` and `ServerConnectScreen`.

### 3.4 Global `401 Unauthorized` Session Expiry Recovery (`client.ts`, `libraries.ts`, `ProfileSelectScreen.tsx`, `App.tsx`)

1. **`ApiClient` (`src/api/client.ts`):**
   - Export `export interface ApiRequestOptions extends RequestInit { skipUnauthorizedHandler?: boolean; }`.
   - Add `private onUnauthorizedHandler: (() => void) | null = null;` and `setOnUnauthorized(handler: (() => void) | null): void`.
   - In both `fetch<T>(path, options)` and `fetchText(urlOrPath, options)`:
     - Destructure `{ skipUnauthorizedHandler, ...fetchInit } = options`.
     - When `res.status === 401` and `this.token !== null` and `!skipUnauthorizedHandler`:
       - Clear `this.token = null` first (so a burst of parallel in-flight requests all failing with `401` invokes `onUnauthorizedHandler` **strictly once**!) and call `this.onUnauthorizedHandler?.()`.
     - Still throw `new Error(\`HTTP error \${res.status}: \${res.statusText}\`)` so callers abort cleanly.

2. **Private Library PIN Exemption (`src/api/libraries.ts`):**
   - Update `unlockLibrary` to pass `{ skipUnauthorizedHandler: true }` to `client.fetch(...)` so an invalid 4-digit library PIN (`401 {"error": "Invalid PIN"}`) stays localized to `PinPadModal`.

3. **Session Expired Redirect & Banner (`src/App.tsx` & `src/screens/ProfileSelectScreen.tsx`):**
   - `ProfileSelectScreenProps`: add optional `noticeMessage?: string | null`. When provided, render a clean banner above the profile cards (e.g. `"Session expired — please enter your PIN to continue"`, cleared once the user logs in or switches servers) — and also replace the two pre-existing `gap-1.5` classes in `ProfileSelectScreen.tsx` (lines 80, 85) and `gap-*` classes in `ServerConnectScreen.tsx` so every touched file is 100% zero-`gap` Chromium 69 compliant!
   - `App.tsx`: registers `client.setOnUnauthorized(handleSessionExpired)` in a `useEffect`:
     - Clears `localStorage.removeItem('kadr_token')`, `setToken(null)`, `setCurrentUserId(null)`, `client.clearLibraryUnlockTokens()`, closes open browse/detail/folder/playlist modals, sets `sessionExpiredNotice = 'Session expired — please enter your PIN to continue'`, and transitions `setView('profiles')` (refreshing `listProfiles(serverUrl)` if `profiles.length === 0`, falling back to `'connect'` only if `serverUrl` is unreachable).

---

## 4. Testing Strategy

1. **Tizen Lifecycle Unit Tests (`tests/utils/tizenLifecycle.test.ts`):**
   - Verify `setTvScreenSaver(true / false)` invokes `webapis.appcommon.setScreenSaver` with `SCREEN_SAVER_OFF` (`1`) / `SCREEN_SAVER_ON` (`0`), deduplicates identical consecutive calls, and survives missing/throwing `webapis`.
   - Verify `exitTvApp()` invokes `tizen.application.getCurrentApplication().exit()` and falls back to `window.close()` when `window.tizen` is absent.
2. **Driver & Player Suspend/Restore + Screensaver Tests (`tests/player/driver.test.ts` & `tests/screens/PlayerScreen.test.tsx`):**
   - Verify `PlayerScreen` calls `setScreenSaver(OFF)` on `'playing'`/`'buffering'`, `setScreenSaver(ON)` on `'paused'`/`'ended'`/`'error'`/unmount.
   - Verify `visibilitychange` (`hidden -> visible`) on VOD flushes progress on hide, calls `avplay.suspend()`, restores via `avplay.restore(..., resumeMs, false)` on Direct Play (or reloads HLS at `resumeMs`) in `'paused'` state with OSD visible, and auto-resumes when `isLive === true`.
3. **Exit Confirmation & `401` Session Expiry Tests (`tests/components/ExitConfirmModal.test.tsx`, `tests/api/client.test.ts`, & `tests/App.test.tsx`):**
   - Verify pressing Back from `BrowseScreen` content moves focus to sidebar (does NOT open exit modal), pressing Back a second time on sidebar opens `<ExitConfirmModal>` (`role="dialog"`), pressing Back cancels it, and confirming calls `tizen.application.getCurrentApplication().exit()`.
   - Verify `ServerConnectScreen` Back blurs `#manual-ip-input` first when focused and opens `<ExitConfirmModal>` when unfocused.
   - Verify `401` on `fetchMediaItem` / `fetchLibraryFolders` clears `kadr_token` once (even across concurrent `401` responses) and transitions `<App />` to `ProfileSelectScreen` displaying `"Session expired — please enter your PIN to continue"`, whereas `401` on `unlockLibrary` keeps the user logged in inside `PinPadModal`!
