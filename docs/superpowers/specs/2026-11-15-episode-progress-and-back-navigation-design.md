# Episode Progress Sync & Back-Button Navigation Usability — Design Specification

**Date:** 2026-11-15
**Target Platform:** Samsung Tizen TV (`UA55TU7000UXEG`, Tizen 5.5 / Chromium 69) & Web Dev Harness

---

## 1. Problem Statement

Real-world TV usage surfaced two high-impact usability issues:

1. **Episode watch progress is not reflected after finishing or exiting an episode:**
   - In `src/App.tsx` (`handleExitPlayer`), `fetchMediaItem` only runs `if (!activeItem && playerItem)`. When playing an episode from a series `ItemDetailModal`, `activeItem` already holds the series payload, so exiting `PlayerScreen` leaves `activeItem.episodes` stuck on its pre-watch snapshot (`playback_progress: 0`, no `WATCHED` badge or orange progress bar, stale `NEXT UP`).
   - `PlayerScreen` invokes `sessionManager.updateProgress(...)` and `sessionManager.destroy()` without awaiting completion before `onExit()`, and does not snap reported position to `durationMs` when `PlayerState` reaches `'ended'` (`onstreamcompleted`), creating both end-of-episode under-reporting and a network race against `GET /api/v1/items/{id}`.
   - `ItemDetailModal` computes `Math.round(epProgress * 100)` (`0..90` milliseconds!) for resumable episodes instead of letting `PlaybackSessionManager` auto-resume from the server's `resume_position_seconds`.

2. **Pressing Back produces unexpected jumps instead of unwinding one UI layer at a time:**
   - **Subtitles dialog exits the episode:** `PlayerScreen` registers its `window` `keydown` listener before `SubtitleModal` opens and omits the `isModalOpen` guard on `BACK_TIZEN` (`10009`) / `Escape`, calling `onExit()` before `SubtitleModal`'s bubble-phase listener runs.
   - **Player OSD cannot be dismissed with Back:** Pressing Back while the OSD progress/control bar is visible immediately exits playback instead of hiding the OSD first.
   - **Subfolder reset on video exit:** `FolderBrowserModal` keeps subfolder navigation (`currentPath`) in local component state without reporting changes to `App.tsx` (`folderBrowserState.path`). Entering `view === 'player'` unmounts `FolderBrowserModal`, so returning from playback remounts it at `path: ''` (the root folder listing) instead of the video's subfolder.
   - **Lost tab/screen context & fabricated modals:** `BrowseScreen` resets `activeTab` to `'home'` after remounting from `view === 'player'`; direct playback from `BrowseScreen` (e.g., Hero `Play`) fabricates and opens `ItemDetailModal` on exit even though the user never opened it; and `ItemDetailModal -> Browse Folder` discards `ItemDetailModal` rather than stacking above/returning cleanly.
   - **Inconsistent modal Back phase:** Some modals (`ItemDetailModal`, `AddToPlaylistModal`, `PlaylistDetailModal`, `ImageViewerModal`) bind `keydown` in capture phase (`true`), while `SubtitleModal` and `TVModal` (used by `PinPadModal`) bind in bubble phase, risking Back leakage across stacked modals.

---

## 2. Goals & Non-Goals

### Goals
- Immediately reflect accurate watch progress (`WATCHED` badge at `>= 90%`, progress bar at `< 90%`, updated `NEXT UP` / `Resume` CTA, and refreshed Continue Watching / Folder / Playlist cards) when finishing, advancing, or exiting an episode or movie.
- Make **Back** (`TVKeys.BACK_TIZEN = 10009`, `Escape`, `Backspace` outside text inputs) strictly unwind one UI layer or history step at a time across every dialog, player overlay, folder level, and screen.
- Keep `BrowseScreen` and modal trees unmounted during `view === 'player'` so Samsung Tizen's hardware `AVPlay` plane and WebView memory remain completely clean.
- Maintain 100% Chromium 69 compatibility (zero flex `gap-*` classes, no unsupported CSS/JS APIs).

### Non-Goals
- Server-side schema or endpoint changes in Kadr (existing `/api/v1/playback/*` and `/api/v1/items/{id}` contracts already persist per-episode `PlaybackState` and hydrate `episodes[].playback_progress`).
- Changing `FolderBrowserModal`'s parent-folder climbing behavior (`subfolder -> parent -> '' -> close`), which remains intact.

---

## 3. Architecture & Data Flow

### 3.1 Layered Back Priority Inside `PlayerScreen`

`PlayerScreen` (`src/screens/PlayerScreen.tsx`) will evaluate Back presses in strict innermost-to-outermost priority:

1. **Error Technical Details Modal (`showDetailsModal === true`)**:
   - Close only the details modal (`setShowDetailsModal(false)`).
2. **Playback Error Screen (`playbackError !== null`)**:
   - Flush any recorded progress and exit playback (`onExit`).
3. **Child Modal / Popup (`isSubtitleModalOpen || isSubtitlePopupOpen`)**:
   - `SubtitleModal` (`src/components/player/SubtitleModal.tsx`) and `PlayerOSD` quick popup (`src/components/osd/PlayerOSD.tsx`) bind `window.addEventListener('keydown', ..., true)` (capture phase) with `e.preventDefault(); e.stopImmediatePropagation();` and close only themselves, restoring focus to the OSD Subtitles button (`osdFocusedItem = 'subtitles'`).
   - `PlayerScreen` additionally guards its Back branch with `if (isModalOpen) return;` as defense in depth.
4. **Auto-Advance Next-Episode Overlay (`autoAdvanceCountdown !== null`)**:
   - Cancel the countdown (`setAutoAdvanceCountdown(null)`, `autoAdvanceDismissedRef.current = true`) and remain in the player.
5. **Visible Player OSD (`showOSD === true` after playback has started)**:
   - Track `hasStartedPlaybackRef` (`true` as soon as `playerState` enters `'playing'`, `'paused'`, or `'ended'`, or `positionMs > 0`).
   - When `hasStartedPlaybackRef.current === true` and `showOSDRef.current === true`:
     - If a debounced skip preview is uncommitted (`seekDebounceTimerRef.current`), clear the pending timer and `seekHud` without jumping, or if none is pending, simply dismiss the OSD.
     - Set `osdDismissedByUserRef.current = true`, `setShowOSD(false)`, reset `osdFocusedItem` to `'progress'`, and clear `osdTimerRef`.
     - Update the OSD visibility `useEffect` so `paused` / `ended` states respect `osdDismissedByUserRef.current === true` (until any subsequent non-Back key press or state transition summons the OSD again via `resetOsdTimer()`).
   - **Pre-play buffering exception**: When `hasStartedPlaybackRef.current === false` (initial loading spinner before playback has ever started), pressing Back exits immediately so canceling a slow/loading stream never requires two Back presses.
6. **Hidden OSD (`showOSD === false` or pre-play buffering)**:
   - Run `exitPlayback()` -> flush final scrobble (bounded by `800ms`) -> destroy session -> invoke `onExit(exitPayload)`.

### 3.2 Strict Screen-to-Screen Navigation History (`App.tsx` & Modals)

Instead of inferring where the user came from on player exit, `App.tsx` maintains explicit state for active browse context and stacked overlays:

1. **`BrowseScreen` Tab & Focus Continuity (`src/screens/BrowseScreen.tsx`, `src/App.tsx`)**:
   - `App.tsx` stores `activeBrowseTab` (default `'home'`) and `lastBrowseFocusId` (`string | null`), passed to `BrowseScreen` via `initialTab={activeBrowseTab}`, `onTabChange={setActiveBrowseTab}`, `initialFocusId={lastBrowseFocusId}`, and `onContentFocusChange={setLastBrowseFocusId}`.
   - Returning from `view === 'player'` to `view === 'browse'` remounts `BrowseScreen` directly on the same library/playlists tab and restores focus to the originating card/button when no modal is open above it.

2. **`FolderBrowserModal` Subfolder & Focus Continuity (`src/screens/FolderBrowserModal.tsx`, `src/App.tsx`)**:
   - Add `onPathChange?: (path: string) => void` and `onFocusItemChange?: (itemId: number | string) => void` to `FolderBrowserModalProps`.
   - Whenever `navigateToPath` or `goBack` changes `currentPath`, `FolderBrowserModal` calls `onPathChange(nextPath)` so `folderBrowserState.path` in `App.tsx` always mirrors the active subfolder (e.g., `'2025/Trip'`).
   - Change `<FolderBrowserModal key={folderBrowserState.libraryId} ... />` in `App.tsx` (removing `-${folderBrowserState.path}` from `key`) so subfolder navigation updates state in-place without unmounting/remounting `FolderBrowserModal`, while remounting after `view === 'player'` initializes directly at `initialPath={folderBrowserState.path}` and `initialFocusItemId={folderBrowserState.lastItemId}`.
   - Inside `FolderBrowserModal`, pressing Back continues climbing `currentPath -> parent_path -> '' -> onClose()`.

3. **`ItemDetailModal` Season/Focus Memory & `Browse Folder` Return Stack (`src/screens/ItemDetailModal.tsx`, `src/App.tsx`)**:
   - `App.tsx` tracks `itemDetailViewState` (`{ selectedSeason?: number; lastFocusedId?: string }`) alongside `activeItem` so returning from `PlayerScreen` to `ItemDetailModal` restores the exact season tab and focused episode card / action button.
   - When the user clicks **Browse Folder** inside `ItemDetailModal`:
     - `App.tsx` pushes `{ item: activeItem, detailState: itemDetailViewState }` onto `suspendedItemDetail` before clearing `activeItem` and opening `FolderBrowserModal` at `{ libraryId, path: folderPath, lastItemId: activeItem.id }`.
     - Inside `FolderBrowserModal`, Back climbs parent folders up to `''`; when `FolderBrowserModal` closes at root `''`, if `suspendedItemDetail` is present, `App.tsx` restores `activeItem` and `itemDetailViewState` (and clears `suspendedItemDetail`).

4. **Origin-Faithful Player Exit (`src/App.tsx`)**:
   - Remove the `if (!activeItem && playerItem) { setActiveItem(detail); }` block in `handleExitPlayer`.
   - Exiting `PlayerScreen` returns strictly to whatever was open when playback started:
     - Started from `ItemDetailModal` -> `activeItem` is still open (over `FolderBrowserModal`, `PlaylistDetailModal`, or `BrowseScreen`); Back once more closes `ItemDetailModal` into that exact underlying modal/subfolder/tab.
     - Started directly from `BrowseScreen` (e.g., Hero `Play`) -> returns directly to `BrowseScreen` on `activeBrowseTab`.
     - Started directly from `PlaylistDetailModal` (`Play All` / row `Play`) -> returns directly to `PlaylistDetailModal`.

5. **Capture-Phase Trap Discipline Across All Modals (`src/components/tv/TVModal.tsx`, `src/components/player/SubtitleModal.tsx`)**:
   - Update `TVModal` and `SubtitleModal` `keydown` listeners to `{ capture: true }` with `e.stopImmediatePropagation()`, checking `activeTrap === trapGroupId` (and ignoring `Backspace` inside text inputs while blurring text inputs on `BACK_TIZEN`/`Escape`).

### 3.3 Episode & Media Progress Synchronization

1. **Progress Snapshot Tracking (`PlayerExitProgress` / `onProgressCommitted`)**:
   - Define `PlaybackProgressSnapshot`:
     ```ts
     export interface PlaybackProgressSnapshot {
       itemId: number | string;
       positionMs: number;
       durationMs: number;
     }
     ```
   - `PlayerScreen` accepts:
     - `onExit: (snapshot?: PlaybackProgressSnapshot) => void`
     - `onEpisodeProgress?: (snapshot: PlaybackProgressSnapshot) => void` (invoked when switching episodes via Next, Previous, or Auto-Advance so multi-episode binge sessions record every episode's progress).

2. **Completion Snapping on `'ended'` & Auto-Advance**:
   - When `driver.onStateChange` transitions to `'ended'` (and `!isLiveStreamRef.current` and `durationMsRef.current > 0`):
     - Set `positionMsRef.current = durationMsRef.current` and `setPositionMs(durationMsRef.current)`.
     - Immediately flush `Math.floor(durationMsRef.current / 1000)` to `sessionManager.updateProgress` (or `reportPlaybackProgress` fallback).
   - When auto-advancing to the next episode (either countdown reaches `0` or user presses `Enter` while `autoAdvanceCountdown !== null`), report `Math.max(positionMsRef.current, durationMsRef.current)` so the finished episode crosses the `>= 0.9` completion threshold before loading the next episode.

3. **Bounded Async Flush Before `onExit`**:
   - Add a `flushFinalProgress(posMs: number)` helper in `PlayerScreen` guarded by `finalFlushedForItemRef`:
     - Sends `sessionManager.updateProgress(Math.floor(posMs / 1000))` (or `reportPlaybackProgress` if no active session) awaited with `Promise.race([flushPromise, sleep(800)])`, then calls `sessionManager.destroy()`.
     - Prevents the unmount `useEffect` cleanup from issuing a duplicate `destroy()` before `updateProgress` finishes.
   - `handleExit` awaits `flushFinalProgress(positionMsRef.current)` (at most `800ms`, typically `< 15ms` on LAN) and then calls `onExit({ itemId, positionMs, durationMs })`.

4. **Optimistic Update + Server Re-Fetch in `App.tsx`**:
   - Add a pure helper `applyOptimisticProgress(item: MediaItemDetail, snapshots: Map<string, PlaybackProgressSnapshot>): MediaItemDetail`:
     - Updates `item.card.playback_progress` / `item.resume_position_ms` when `String(item.id)` matches.
     - Updates matching entries in `item.episodes` (`playback_progress = Math.min(1, posMs / durMs)`, clearing stale server `badge` if `playback_progress >= 0.9` so `EpisodeLandscapeCard` renders `WATCHED` immediately).
   - In `handleExitPlayer(snapshot)`:
     - Record `snapshot` into `sessionSnapshotsRef`.
     - If `activeItem` is set:
       1. Immediately apply `setActiveItem((prev) => prev ? applyOptimisticProgress(prev, sessionSnapshotsRef.current) : prev)` before/as `'browse'` renders so frame 1 already shows updated episode badges and progress bars.
       2. Call `fetchMediaItem(client, activeItem.id)` and `setActiveItem(fresh)` when it resolves so server-computed watch state, `resume_position_seconds`, and metadata stay authoritative.
     - Always increment `screenRefreshKey` on player exit, increment `folderRefreshKey` when `folderBrowserState` is open, and increment `playlistRefreshKey` when `activePlaylistId` is open.

5. **Fix Resumable Episode Start Time (`ItemDetailModal.tsx` & `PlayerScreen.tsx`)**:
   - Remove `Math.round(epProgress * 100)` in `ItemDetailModal.tsx` (`nextEpisodeResumeMs` and `handleSelectEpisode`).
   - Pass `resumeMs = 0` when selecting an episode or clicking `Resume SxxExx` (letting `PlayerScreen`'s `sessionManager.start` auto-resume from `session.resume_position_seconds` when `allowSessionAutoResumeRef.current === true`), while passing an explicit `startFromBeginning?: boolean` flag (`disableAutoResume?: boolean` on `PlayerScreen`) when the user clicks a dedicated `Play from Beginning` button so `0:00` is respected without session auto-resume overriding it.

---

## 4. Error Handling & Edge Cases

- **Offline or Unresponsive Server on Exit**: `flushFinalProgress` races against an `800ms` ceiling so pressing Back to exit playback never hangs the UI if Wi-Fi drops or the server stalls; optimistic progress still updates `activeItem` in memory, and `fetchMediaItem` failures log a warning without clearing `activeItem`.
- **Zero/Unknown Duration or Live Streams**: If `durationMs <= 0` or `isLiveStream === true`, optimistic progress division is skipped (`no NaN/Infinity`).
- **Text Inputs Inside Modals (`Search` / `Create Playlist` / `PIN`)**: `Backspace` continues deleting characters inside `<input>`/`<textarea>`, while `TVKeys.BACK_TIZEN` (`10009`) / `Escape` blurs the focused input first (dismissing Tizen's IME keyboard) before a subsequent Back closes the modal.
- **Short Accidental Play (`positionMs === 0`)**: If the user cancels during pre-play buffering (`positionMs === 0` and `!hasStartedPlaybackRef.current`), `PlayerScreen` does not overwrite an existing non-zero resume position with `0` (`updateProgress` is skipped when `!hasStartedPlaybackRef.current && positionMs === 0`).

---

## 5. Testing Strategy

1. **Unit Tests — Progress & Resume (`tests/screens/ItemDetailModal*.test.tsx`, `tests/screens/PlayerScreen*.test.tsx`)**:
   - Verify `EpisodeLandscapeCard` & `ItemDetailModal` do not pass `Math.round(progress * 100)` (`50ms`), and properly render `WATCHED` (`>= 0.9`), orange progress bar (`0 < p < 0.9`), and updated `NEXT UP` when `item.episodes` updates.
   - Verify `PlayerScreen` snaps reported progress to `durationMs` on `'ended'` and flushes `sessionManager.updateProgress` before `sessionManager.destroy()` on exit, without overwriting progress with `0` if canceled before playback starts.
2. **Unit Tests — Layered Player Back (`tests/screens/PlayerScreen.test.tsx`, `tests/screens/PlayerScreen.subtitles.test.tsx`)**:
   - Verify pressing `BACK_TIZEN` / `Escape` while `SubtitleModal` is open closes **only** `SubtitleModal` (`onExit` is NOT called and player remains mounted).
   - Verify pressing `BACK_TIZEN` / `Escape` while `PlayerOSD` is visible (in `playing`, `paused`, and `ended` states) hides `PlayerOSD` first (`onExit` not called), and a second `BACK_TIZEN` / `Escape` calls `onExit`.
   - Verify pressing `BACK_TIZEN` / `Escape` during initial pre-play `buffering` exits immediately in one press.
3. **Integration Tests — App Navigation History & Episode Refresh (`tests/App.test.tsx`, `tests/screens/FolderBrowserModal.test.tsx`)**:
   - **Series episode flow**: Open Show -> play Episode 1 -> simulate progress/completion -> exit player -> verify `fetchMediaItem(showId)` is re-fetched and Episode 1 card immediately displays `WATCHED` while Episode 2 becomes `NEXT UP`.
   - **Subfolder video flow**: Open `FolderBrowserModal` -> navigate into subfolder `2025/Trip` -> select video -> play -> Back (hide OSD / exit player) -> Back (close `ItemDetailModal`) -> verify `FolderBrowserModal` is still at `2025/Trip` (not root `''`) with the video card focused, and pressing Back again climbs `2025/Trip -> 2025 -> '' -> BrowseScreen`.
   - **Direct play & tab preservation**: Switch `BrowseScreen` to `Shows` tab -> play item directly -> exit player -> verify `BrowseScreen` remains on `Shows` tab and `ItemDetailModal` is NOT unexpectedly opened.
   - **`ItemDetailModal -> Browse Folder` return**: Open item from `BrowseScreen` -> click `Browse Folder` -> press Back to root and close `FolderBrowserModal` -> verify `ItemDetailModal` is restored.
