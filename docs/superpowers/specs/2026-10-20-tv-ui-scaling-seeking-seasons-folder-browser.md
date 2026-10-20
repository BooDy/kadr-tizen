# TV UI Scaling, Seeking Lock, Season Focus, and Library Folder Browser Design

**Date:** 2026-10-20  
**Status:** Approved  
**Platform Target:** Samsung Tizen OS TV (Tizen 5.5+, Chromium 69 compatible) & Kadr Backend

---

## 1. Problem Statement & User Feedback

During TV testing on Samsung TV (`UA55TU7000UXEG`), five specific issues were reported:
1. **Fast-forwarding snaps back**: The scrubber moves forward while pressing the button, but immediately upon release snaps back to the original playback position and does not seek.
2. **Season selection unreachable**: The focus indicator cannot navigate from action buttons to the season tabs row.
3. **Random scrollbars**: Gray desktop scrollbars appear in the middle of the TV screen across carousel and scrollable areas.
4. **Detail view too small**: The video detail view is a small centered popup with tiny buttons and text, unreadable on a 10-foot TV.
5. **Missing directory browsing per library**: No way to browse directories directly from a library view in `BrowseScreen`.

---

## 2. Technical Solutions

### 2.1 AVPlay Seeking Lock & Smoothing (`src/screens/PlayerScreen.tsx`, `src/player/avplay-driver.ts`)
- **Root Cause**: `seekDebounceTimerRef.current` expired at 300ms and became `null`, while AVPlay takes 500ms–1500ms to buffer and complete the seek. In the interim, AVPlay's `oncurrentplaytime` emits the pre-seek position, overwriting `positionMs` and snapping the UI backward.
- **Solution**:
  - In `PlayerScreen.tsx`, introduce a `seekLockUntilMsRef = useRef<number>(0)`. When seeking, set `seekLockUntilMsRef.current = Date.now() + 1500`.
  - In `driver.onTimeUpdate`: ignore position updates if `Date.now() < seekLockUntilMsRef.current`.
  - In `avplay-driver.ts`: add `seekTo(ms, successCb, errorCb)` callback invocation in `PlayerDriver` interface, so when AVPlay confirms seek completion, `seekLockUntilMsRef.current = 0` clears the lock immediately.

### 2.2 Season Selection Focus Capture (`src/screens/ItemDetailModal.tsx`)
- **Root Cause**: Spatial navigation in `FocusContext` fails horizontal alignment threshold `Math.abs(dx) <= currentRect.width * 1.5` when moving Down from right-aligned action buttons to the Season 1 tab on the left.
- **Solution**:
  - In `ItemDetailModal.tsx`, attach keydown listener with `{ capture: true }` so it intercepts Down/Up/Left/Right BEFORE `FocusContext` runs spatial candidate matching.
  - When on any action button (`detail-play-btn`, `detail-resume-btn`, `detail-restart-btn`, `detail-browse-folder-btn`, `detail-close-btn`):
    - `ArrowDown` unconditionally focuses `season-tab-${selectedSeason}`.
  - On season tabs:
    - `ArrowUp` unconditionally focuses the primary button (`primaryBtnId`).
    - `ArrowDown` unconditionally focuses the first episode card of that season (`episode-card-${firstEpisodeId}`).
    - `ArrowLeft` / `ArrowRight` cycles through season tabs with strict boundary clamping.
    - `Enter` commits the season change and loads that season's episodes.
  - On episode cards:
    - `ArrowUp` unconditionally returns to `season-tab-${selectedSeason}`.

### 2.3 Global Scrollbar Suppression (`src/index.css`)
- **Solution**: Add Chromium 69 compatible global scrollbar suppression:
  ```css
  *::-webkit-scrollbar,
  ::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    background: transparent !important;
  }
  * {
    -ms-overflow-style: none !important;
    scrollbar-width: none !important;
  }
  ```

### 2.4 True Full-Screen 10-Foot Video Details Screen (`src/screens/ItemDetailModal.tsx`)
- **Solution**:
  - Replace centered dialog container with full-screen layout: `fixed inset-0 w-screen h-screen bg-[#1F0707] z-[60] flex flex-col p-16 select-none overflow-hidden`.
  - Giant typography: Title `text-6xl font-black mb-4 tracking-tight`, metadata badges `text-xl px-3 py-1 font-bold`, overview `text-2xl leading-relaxed max-w-4xl line-clamp-3 text-[#F5E5E5]/80`.
  - Giant action buttons: `!py-5 !px-8 !text-2xl font-black rounded-2xl gap-4 shadow-xl`.
  - Giant Season tabs: `!py-4 !px-8 !text-2xl font-black rounded-2xl mr-4`.
  - Poster enlarged to `w-72 h-[420px] rounded-3xl shadow-2xl shrink-0 mr-12`.
  - High-contrast glowing focus indicators (`tv-focus-ring` with scale 1.05 and bright gold glow).

### 2.5 Library Directory Browsing Entry Point (`src/screens/BrowseScreen.tsx`, `src/App.tsx`)
- **Solution**:
  - In `BrowseScreen.tsx`, when viewing a library screen (`activeTab !== 'home'`), render a prominent top action banner/button:
    `TVButton id="library-browse-folders-btn" variant="secondary" onClick={() => onBrowseFolder?.(currentLib.id)}` with `<Folder className="w-8 h-8 mr-3" /> Browse Folders`.
  - Wire `onBrowseFolder` prop through `BrowseScreen` in `App.tsx` to set `folderBrowserState = { isOpen: true, libraryId, initialPath: undefined }`.
