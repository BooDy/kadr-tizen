# Episode Progress Sync & Back-Button Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure episode/movie watch progress updates immediately on screen when finishing, advancing, or exiting playback, and make the TV Back button (`10009` / `Escape` / `Backspace`) unwind strictly one UI layer or history step at a time across dialogs, the player OSD, subfolders, tabs, and modals.

**Architecture:** Introduce sequenced session progress flushing (`PlaybackSessionManager.flushAndDestroy` + `PlaybackProgressSnapshot` with `flushPromise`) paired with optimistic client-side progress hydration (`applyOptimisticProgress`) and server `fetchMediaItem` reconciliation in `App.tsx`. Enforce capture-phase `stopImmediatePropagation()` Back discipline across stacked modals (`SubtitleModal`, `TVModal`), layered OSD-before-exit Back handling in `PlayerScreen`, and explicit tab/subfolder/detail state continuity across `BrowseScreen`, `FolderBrowserModal`, `ItemDetailModal`, and `App.tsx` while keeping browse DOM unmounted during `AVPlay` playback.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6 (`chrome69` legacy bundle), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex `gap-*` classes** in any new or modified JSX/CSS (Chromium 69 does not support CSS flexbox `gap`; use explicit margins/spacers).
- Keep `BrowseScreen` and modal trees unmounted while `view === 'player'` so `AVPlay`'s transparent hardware video plane and WebView memory remain unobstructed.
- Never run destructive git commands (`git checkout`, `git restore`, `git reset`, `git clean`, `git stash`), and stage **only** the specific files touched in each task if committing, since unrelated working-tree changes exist in the repo.
- `BACKSPACE` inside `<input>` or `<textarea>` must continue editing text rather than closing modals, whereas `TVKeys.BACK_TIZEN` (`10009`) / `Escape` blurs an active text input first before a subsequent Back closes the modal.

---

### Task 1: Sequenced Session Progress Flush, Optimistic Progress Helper & ItemDetailModal View Continuity

**Files:**
- Create: `src/utils/playbackProgress.ts`
- Modify: `src/player/session.ts:46-66`
- Modify: `src/screens/ItemDetailModal.tsx:26-44,443-482,731-754`
- Test: `tests/player/scrobble.test.ts`
- Test: `tests/screens/ItemDetailModal.test.tsx`

**Interfaces:**
- Produces:
  - `src/utils/playbackProgress.ts`:
    - `export interface PlaybackProgressSnapshot { itemId: number | string; positionMs: number; durationMs: number; flushPromise?: Promise<void>; }`
    - `export function toResumePercentageSentinel(progress?: number): number`
    - `export function applyOptimisticProgress(item: MediaItemDetail, snapshots: ReadonlyMap<string, PlaybackProgressSnapshot>): MediaItemDetail`
  - `src/player/session.ts`:
    - `PlaybackSessionManager.prototype.flushAndDestroy(positionSeconds?: number): Promise<void>` (sequences `reportSessionProgress` strictly **before** `endPlaybackSession` so `DELETE /api/v1/playback/sessions/{id}` never races ahead of `POST /api/v1/playback/{id}/progress`)
  - `src/screens/ItemDetailModal.tsx`:
    - Optional props `initialSelectedSeason?: number`, `initialFocusedId?: string | null`, `onViewStateChange?: (state: { selectedSeason: number; lastFocusedId: string | null }) => void`

- [ ] **Step 1: Write the failing unit tests in `tests/player/scrobble.test.ts` and `tests/screens/ItemDetailModal.test.tsx`**

Append to `tests/player/scrobble.test.ts`:

```tsx
import { ApiClient } from '../../src/api/client';
import { PlaybackSessionManager } from '../../src/player/session';
import {
  applyOptimisticProgress,
  PlaybackProgressSnapshot,
  toResumePercentageSentinel,
} from '../../src/utils/playbackProgress';
import { MediaItemDetail } from '../../src/types/kadr';

describe('PlaybackSessionManager.flushAndDestroy & applyOptimisticProgress', () => {
  it('awaits reportSessionProgress strictly before endPlaybackSession in flushAndDestroy', async () => {
    const callOrder: string[] = [];
    let resolveProgress!: () => void;
    const progressGate = new Promise<void>((res) => {
      resolveProgress = res;
    });

    const client = {
      fetch: vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/api/v1/playback/sessions' && init?.method === 'POST') {
          callOrder.push('start');
          return {
            session_id: 'sess-99',
            media_item_id: 201,
            duration_seconds: 1200,
            resume_position_seconds: 0,
          };
        }
        if (path === '/api/v1/playback/sess-99/progress') {
          callOrder.push('progress:start');
          await progressGate;
          callOrder.push('progress:done');
          return undefined;
        }
        if (path === '/api/v1/playback/sessions/sess-99' && init?.method === 'DELETE') {
          callOrder.push('delete');
          return undefined;
        }
        return undefined;
      }),
    } as unknown as ApiClient;

    const mgr = new PlaybackSessionManager(client);
    await mgr.start(201);

    const flushPromise = mgr.flushAndDestroy(1180);
    await Promise.resolve();
    expect(callOrder).toEqual(['start', 'progress:start']);

    resolveProgress();
    await flushPromise;
    expect(callOrder).toEqual(['start', 'progress:start', 'progress:done', 'delete']);

    // Subsequent destroy() is a safe no-op
    await mgr.destroy();
    expect(callOrder).toEqual(['start', 'progress:start', 'progress:done', 'delete']);
  });

  it('updates episode playback_progress, clears stale badge on >=90% completion, and computes resume sentinel safely', () => {
    expect(toResumePercentageSentinel(0)).toBe(0);
    expect(toResumePercentageSentinel(0.003)).toBe(1);
    expect(toResumePercentageSentinel(0.3)).toBe(30);
    expect(toResumePercentageSentinel(0.95)).toBe(0);

    const show: MediaItemDetail = {
      id: 10,
      title: 'Severance',
      media_type: 'show',
      episodes: [
        { id: 201, title: 'Ep 1', season: 1, episode: 1, playback_progress: 0, badge: 'NEXT UP' },
        { id: 202, title: 'Ep 2', season: 1, episode: 2, playback_progress: 0 },
      ],
    };

    const map = new Map<string, PlaybackProgressSnapshot>([
      ['201', { itemId: 201, positionMs: 2700000, durationMs: 2700000 }],
    ]);

    const updated = applyOptimisticProgress(show, map);
    expect(updated.episodes?.[0].playback_progress).toBe(1);
    expect(updated.episodes?.[0].badge).toBeUndefined();
    expect(updated.episodes?.[1].playback_progress).toBe(0);
  });
});
```

Add to `tests/screens/ItemDetailModal.test.tsx` (inside `describe('Series / Episodes Support', ...)`):

```tsx
    it('preserves tiny non-zero episode progress (<0.5%) as sentinel 1 and restores initialSelectedSeason', () => {
      const onPlay = vi.fn();
      const showTinyProgress: MediaItemDetail = {
        ...mockShowDetail,
        episodes: [
          { id: 206, title: 'Ep 1', season: 1, episode: 1, playback_progress: 0.003 },
          { id: 301, title: 'S2 Ep 1', season: 2, episode: 1, playback_progress: 0 },
        ],
      };

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={showTinyProgress}
            serverUrl="http://localhost:8492"
            initialSelectedSeason={2}
            onClose={vi.fn()}
            onPlay={onPlay}
          />
        </FocusProvider>
      );

      // Season 2 episode is immediately visible because initialSelectedSeason={2}
      expect(screen.getByText('S2 Ep 1')).toBeInTheDocument();

      // Resume Next button still targets Ep 1 with sentinel >= 1 (never 0)
      fireEvent.click(screen.getByRole('button', { name: /Resume Next/i }));
      expect(onPlay).toHaveBeenCalledWith(206, 1, 'Ep 1', undefined, expect.any(Array), 0);
    });
```

- [ ] **Step 2: Run Vitest on the two test files to verify failure**

Run: `npx vitest run tests/player/scrobble.test.ts tests/screens/ItemDetailModal.test.tsx`
Expected: FAIL (`Cannot find module '../../src/utils/playbackProgress'`).

- [ ] **Step 3: Implement `src/utils/playbackProgress.ts`, `PlaybackSessionManager.flushAndDestroy`, and `ItemDetailModal` updates**

Create `src/utils/playbackProgress.ts`:

```ts
import { MediaItemDetail } from '../types/kadr';

export interface PlaybackProgressSnapshot {
  itemId: number | string;
  positionMs: number;
  durationMs: number;
  flushPromise?: Promise<void>;
}

/**
 * Converts a 0..1 playback_progress fraction into PlayerScreen's 1..99 percentage sentinel
 * so even very early resumable positions (e.g. 0.003 = 0.3%) never round down to 0
 * (which PlayerScreen treats as "start from 0:00 without session auto-resume").
 */
export function toResumePercentageSentinel(progress?: number): number {
  if (!progress || !Number.isFinite(progress) || progress <= 0 || progress >= 0.9) {
    return 0;
  }
  return Math.min(89, Math.max(1, Math.round(progress * 100)));
}

export function applyOptimisticProgress(
  item: MediaItemDetail,
  snapshots: ReadonlyMap<string, PlaybackProgressSnapshot>
): MediaItemDetail {
  if (snapshots.size === 0) return item;

  let nextItem = item;
  const selfSnap = snapshots.get(String(item.id ?? item.card?.id ?? ''));
  if (selfSnap && selfSnap.durationMs > 0) {
    const ratio = Math.min(1, Math.max(0, selfSnap.positionMs / selfSnap.durationMs));
    const isCompleted = ratio >= 0.9;
    nextItem = {
      ...nextItem,
      duration_ms: nextItem.duration_ms || selfSnap.durationMs,
      resume_position_ms: isCompleted ? 0 : selfSnap.positionMs,
      resume_position_seconds: isCompleted ? 0 : Math.floor(selfSnap.positionMs / 1000),
      card: nextItem.card
        ? {
            ...nextItem.card,
            playback_progress: isCompleted ? 1 : ratio,
          }
        : nextItem.card,
    };
  }

  if (nextItem.episodes && nextItem.episodes.length > 0) {
    let episodesChanged = false;
    const updatedEpisodes = nextItem.episodes.map((ep) => {
      const snap = snapshots.get(String(ep.id));
      if (!snap || snap.durationMs <= 0) return ep;
      const ratio = Math.min(1, Math.max(0, snap.positionMs / snap.durationMs));
      const isCompleted = ratio >= 0.9;
      const nextProgress = isCompleted ? 1 : ratio;
      const nextBadge = isCompleted ? undefined : ep.badge;
      if (ep.playback_progress === nextProgress && ep.badge === nextBadge) {
        return ep;
      }
      episodesChanged = true;
      return {
        ...ep,
        playback_progress: nextProgress,
        badge: nextBadge,
      };
    });

    if (episodesChanged) {
      nextItem = {
        ...nextItem,
        episodes: updatedEpisodes,
      };
    }
  }

  return nextItem;
}
```

Update `src/player/session.ts` (`flushAndDestroy` + `destroy`):

```ts
  async flushAndDestroy(positionSeconds?: number): Promise<void> {
    const currentSessionId = this.sessionId;
    this.isDestroyed = true;
    this.currentStartId++;
    this.sessionId = null;
    if (!currentSessionId) return;

    if (
      positionSeconds !== undefined &&
      Number.isFinite(positionSeconds) &&
      positionSeconds >= 0
    ) {
      try {
        await reportSessionProgress(this.client, currentSessionId, positionSeconds);
      } catch {
        // Catches any error silently to avoid disrupting exit
      }
    }

    try {
      await endPlaybackSession(this.client, currentSessionId);
    } catch {
      // Catches any error silently
    }
  }
```

Update `src/screens/ItemDetailModal.tsx`:
- Import `toResumePercentageSentinel` from `../utils/playbackProgress`.
- Add optional props to `ItemDetailModalProps`:
  ```ts
  initialSelectedSeason?: number;
  initialFocusedId?: string | null;
  onViewStateChange?: (state: { selectedSeason: number; lastFocusedId: string | null }) => void;
  ```
- Initialize `selectedSeason` from `initialSelectedSeason && seasons.includes(initialSelectedSeason) ? initialSelectedSeason : defaultSeason`, only resetting to `defaultSeason` when `resolvedId` changes (unless `initialSelectedSeason` is provided for that item).
- Replace `Math.round(nextEpisode.playback_progress * 100)` and `Math.round(epProgress * 100)` with `toResumePercentageSentinel(nextEpisode?.playback_progress)` and `toResumePercentageSentinel(ep.playback_progress)`.
- Report `{ selectedSeason, lastFocusedId }` via `onViewStateChange` when `selectedSeason` changes or before invoking `onPlay` / `onBrowseFolder`, and restore `initialFocusedId` on mount when valid.

- [ ] **Step 4: Run Vitest to verify Task 1 passes**

Run: `npx vitest run tests/player/scrobble.test.ts tests/screens/ItemDetailModal.test.tsx tests/screens/ItemDetailModal.seasons.test.tsx`
Expected: PASS (all tests green).

---

### Task 2: Capture-Phase Modal Back Discipline & Layered PlayerScreen Back + Completion Sync

**Files:**
- Modify: `src/components/player/SubtitleModal.tsx:144-232`
- Modify: `src/components/tv/TVModal.tsx:39-66`
- Modify: `src/screens/PlayerScreen.tsx:25-70,138-235,500-535,723-741,852-903,1252-1360,1491-1507`
- Test: `tests/components/player/SubtitleModal.test.tsx`
- Test: `tests/components/TVPrimitives.test.tsx`
- Test: `tests/screens/PlayerScreen.test.tsx`
- Test: `tests/screens/PlayerScreen.subtitles.test.tsx`

**Interfaces:**
- Consumes: `PlaybackProgressSnapshot` from `src/utils/playbackProgress.ts`, `PlaybackSessionManager.flushAndDestroy` from `src/player/session.ts`
- Produces:
  - `PlayerScreenProps`:
    - `onExit: (snapshot?: PlaybackProgressSnapshot) => void`
    - `onEpisodeProgress?: (snapshot: PlaybackProgressSnapshot) => void`
  - `SubtitleModal` and `TVModal` capture-phase (`true`) Back handlers with `stopImmediatePropagation()` and `activeTrap` guard.

- [ ] **Step 1: Write failing tests for SubtitleModal Back isolation, PlayerOSD Back-first dismissal, and `'ended'` completion flush**

Add to `tests/screens/PlayerScreen.subtitles.test.tsx`:

```tsx
  it('closes only SubtitleModal on TV Back / Escape without calling onExit on PlayerScreen', async () => {
    const onExit = vi.fn();
    render(
      <FocusProvider>
        <PlayerScreen
          itemId={101}
          title="Episode 1"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={onExit}
        />
      </FocusProvider>
    );

    await act(async () => {
      mockDriver.stateCallback?.('playing');
    });

    fireEvent.click(screen.getByTestId('subtitles-button'));
    expect(screen.getByRole('dialog', { name: 'Subtitles' })).toBeInTheDocument();

    // First Back press closes SubtitleModal ONLY; player remains mounted and onExit is NOT called
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Subtitles' })).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });
```

Add to `tests/screens/PlayerScreen.test.tsx`:

```tsx
  it('hides visible PlayerOSD on first Back press once playback has started, then exits on second Back press with progress snapshot', () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        itemId="ep-201"
        title="Episode 1"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={onExit}
      />
    );

    act(() => {
      mockDriver.stateCallback?.('playing');
      mockDriver.timeCallback?.(45000, 90000);
    });

    // OSD is visible initially -> first Back hides OSD without exiting
    const osdRoot = screen.getByText('Episode 1').closest('[class*="transition-opacity"]');
    expect(osdRoot?.className).toContain('opacity-100');

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN, cancelable: true })
      );
    });
    expect(onExit).not.toHaveBeenCalled();
    expect(osdRoot?.className).toContain('opacity-0');

    // Second Back while OSD is hidden exits playback and passes progress snapshot
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN, cancelable: true })
      );
    });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'ep-201',
        positionMs: 45000,
        durationMs: 90000,
      })
    );
  });

  it('snaps reported progress to full durationMs when playback reaches ended state', () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        itemId={201}
        title="Episode Finale"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={onExit}
      />
    );

    act(() => {
      mockDriver.stateCallback?.('playing');
      mockDriver.timeCallback?.(1198000, 1200000);
      mockDriver.stateCallback?.('ended');
    });

    // First Back hides OSD on ended screen; second Back exits with 100% positionMs === durationMs
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN, cancelable: true }));
    });
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN, cancelable: true }));
    });
    expect(onExit).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 201,
        positionMs: 1200000,
        durationMs: 1200000,
      })
    );
  });
```

- [ ] **Step 2: Run Vitest on the player & modal tests to verify failure**

Run: `npx vitest run tests/screens/PlayerScreen.subtitles.test.tsx tests/screens/PlayerScreen.test.tsx`
Expected: FAIL (`onExit` called when `SubtitleModal` is open and on first Back while OSD is visible).

- [ ] **Step 3: Implement capture-phase modal Back handlers and PlayerScreen layered Back + completion flush**

1. In `src/components/player/SubtitleModal.tsx`:
   - Read `activeTrap = focusCtx?.activeTrap` via ref (`activeTrapRef`), pop trap by name `popTrap('subtitle-modal')`, and update the `keydown` effect (lines 214–231):
     ```tsx
     useEffect(() => {
       if (!isOpen) return;
       const handleKeyDown = (e: KeyboardEvent) => {
         if (activeTrapRef.current && activeTrapRef.current !== 'subtitle-modal') return;
         const activeEl =
           (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null) ||
           (e.target as HTMLElement | null);
         const isEditing = isTextInputElement(activeEl);
         const code = e.keyCode || e.which;

         if ((code === TVKeys.BACKSPACE || e.key === 'Backspace') && isEditing) {
           return;
         }
         if (
           code === TVKeys.BACK_TIZEN ||
           code === TVKeys.BACK_WEB ||
           code === TVKeys.BACKSPACE ||
           e.key === 'Escape'
         ) {
           e.preventDefault();
           e.stopPropagation();
           e.stopImmediatePropagation();
           if (isEditing && activeEl && typeof activeEl.blur === 'function') {
             activeEl.blur();
             return;
           }
           onClose();
         }
       };
       window.addEventListener('keydown', handleKeyDown, true);
       return () => window.removeEventListener('keydown', handleKeyDown, true);
     }, [isOpen, onClose]);
     ```

2. In `src/components/tv/TVModal.tsx`:
   - Bind `window.addEventListener('keydown', handleKeyDown, true)` (capture phase), allow `Backspace` to edit text inputs while `BACK_TIZEN`/`Escape` blurs an active text input first, and handle `TVKeys.BACKSPACE` outside text inputs identically to `BACK_TIZEN`/`Escape`.

3. In `src/screens/PlayerScreen.tsx`:
   - Update `PlayerScreenProps`:
     - `onExit: (snapshot?: PlaybackProgressSnapshot) => void;`
     - `onEpisodeProgress?: (snapshot: PlaybackProgressSnapshot) => void;`
   - Add refs:
     - `showOSDRef` synced to `showOSD`
     - `hasStartedPlaybackRef = useRef(false)` (reset to `false` on `itemId` change; set to `true` when `state === 'playing'`, `state === 'paused'`, `state === 'ended'`, or `pos > 0`)
     - `osdDismissedByUserRef = useRef(false)` (reset to `false` inside `resetOsdTimer` and on `itemId` change)
     - `finalFlushedItemRef = useRef<string | null>(null)` (prevents duplicate unmount flush after explicit exit/episode switch)
   - In `resetOsdTimer`: set `osdDismissedByUserRef.current = false` before `setShowOSD(true)`.
   - In the OSD visibility `useEffect([playerState, isSubtitlePopupOpen, isSubtitleModalOpen])`:
     - When `playerState !== 'playing'` (e.g. `paused` or `ended`), only call `setShowOSD(true)` if `!osdDismissedByUserRef.current` (resetting `osdDismissedByUserRef.current = false` whenever `playerState` itself transitions to `'paused'` or `'ended'` via a `prevPlayerStateRef` check so pausing or ending naturally reveals the OSD, while pressing Back afterward can dismiss it!).
   - In `driver.onStateChange`:
     - When `state === 'ended'`: mark `hasStartedPlaybackRef.current = true`; if `!isLiveStreamRef.current && durationMsRef.current > 0`, snap `positionMsRef.current = durationMsRef.current`, `setPositionMs(durationMsRef.current)`, and report `Math.floor(durationMsRef.current / 1000)` to `sessionManager.updateProgress` (or `reportPlaybackProgress` fallback).
   - Create helper `buildAndFlushSnapshot(overridePosMs?: number, destroySession = false): PlaybackProgressSnapshot`:
     - Computes `posMs = overridePosMs ?? positionMsRef.current`, `durMs = durationMsRef.current`.
     - Skips network progress write if `!hasStartedPlaybackRef.current && posMs === 0` or `isLiveStreamRef.current`.
     - If `destroySession` is `true`, marks `finalFlushedItemRef.current = String(itemId)` and sets `flushPromise` to `hasActiveSessionRef.current ? sessionManager.flushAndDestroy(shouldWrite ? Math.floor(posMs / 1000) : undefined) : (shouldWrite ? Promise.all([reportPlaybackProgress(serverUrl, token, itemId, posMs, true), sessionManager.destroy()]).then(() => {}) : sessionManager.destroy())`.
     - If `destroySession` is `false` (episode transition), chains `sessionManager.updateProgress(Math.floor(posMs / 1000))` (or `reportPlaybackProgress`) and invokes `onEpisodeProgressRef.current?.(snapshot)`.
   - On auto-advance (`countdown === 0` or `Enter` while `autoAdvanceCountdown !== null`), pass `overridePosMs = durationMsRef.current > 0 ? Math.max(positionMsRef.current, durationMsRef.current) : positionMsRef.current` to `buildAndFlushSnapshot(..., false)` before `onNextRef.current?.()`.
   - On manual `Next` / `Previous` (media keys or OSD buttons), call `buildAndFlushSnapshot(undefined, false)` before `onNextRef.current()` / `onPreviousRef.current()`.
   - In `handleKeyDown`:
     - Do **not** call `resetOsdTimer()` blindly before checking Back! Only call `resetOsdTimer()` on non-Back keys (calling `resetOsdTimer()` at the top of `handleKeyDown` before checking Back would re-open a hidden OSD right as Back tries to check `showOSDRef.current`!).
     - On `BACK_TIZEN` / `BACK_WEB` / `BACKSPACE` / `Escape`:
       1. If `isModalOpen` (`isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current`), `return;` immediately without touching OSD or calling `onExit`.
       2. If `seekDebounceTimerRef.current` is active, cancel the uncommitted skip (`clearTimeout`, `seekDebounceTimerRef.current = null`, `commitPendingSeekRef.current = null`, `setSeekHud(null)`).
       3. If `hasStartedPlaybackRef.current && showOSDRef.current`:
          - `e.preventDefault();`
          - If `osdTimerRef.current`, `clearTimeout(osdTimerRef.current)`.
          - `osdDismissedByUserRef.current = true;`
          - `osdFocusedItemRef.current = 'progress';`
          - `setOsdFocusedItem('progress');`
          - `setShowOSD(false);`
          - `return;`
       4. Otherwise (`!hasStartedPlaybackRef.current` or `!showOSDRef.current`):
          - `e.preventDefault();`
          - `const snap = buildAndFlushSnapshot(undefined, true);`
          - `onExit(snap);`

- [ ] **Step 4: Run all PlayerScreen & modal tests to verify Task 2 passes**

Run: `npx vitest run tests/components/player/SubtitleModal.test.tsx tests/components/TVPrimitives.test.tsx tests/components/PinPadModal.test.tsx tests/screens/PlayerScreen.test.tsx tests/screens/PlayerScreen.subtitles.test.tsx tests/screens/PlayerScreen.seeking.test.tsx tests/screens/PlayerScreen.playlist.test.tsx tests/screens/PlayerScreen.error.test.tsx`
Expected: PASS (100% green).

---

### Task 3: Subfolder & Tab Continuity + Strict App Navigation History & Episode Refresh

**Files:**
- Modify: `src/screens/FolderBrowserModal.tsx:17-33,763-800`
- Modify: `src/screens/BrowseScreen.tsx:28-51,720-736,822-870`
- Modify: `src/App.tsx:36-68,182-310,374-490,536-552`
- Test: `tests/screens/FolderBrowserModal.test.tsx`
- Test: `tests/screens/BrowseScreen.test.tsx`
- Test: `tests/App.test.tsx`

**Interfaces:**
- Consumes:
  - `PlaybackProgressSnapshot`, `applyOptimisticProgress` from `src/utils/playbackProgress.ts`
  - `PlayerScreen` `onExit(snapshot)` & `onEpisodeProgress(snapshot)` from Task 2
  - `ItemDetailModal` `initialSelectedSeason`, `initialFocusedId`, `onViewStateChange` from Task 1
- Produces:
  - `FolderBrowserModalProps.onPathChange?: (path: string) => void`
  - `BrowseScreenProps.onTabChange?: (tab: string) => void`, `initialFocusId?: string | null`, `onContentFocusChange?: (id: string | null) => void`
  - End-to-end history preservation & live episode progress refresh in `App.tsx`

- [ ] **Step 1: Write failing integration tests in `tests/App.test.tsx` and `tests/screens/FolderBrowserModal.test.tsx`**

Add to `tests/App.test.tsx`:
1. Update existing `App.test.tsx` player-exit tests where playback reached `'paused'` (line 978–980: first Escape hides OSD when paused, second Escape exits player — AND assert at line 975 that `expect(screen.getByText('Playing')).toBeInTheDocument()` proves `PlayerScreen` stayed mounted when `SubtitleModal` closed!).
2. Add three end-to-end regression tests in `tests/App.test.tsx`:
   - **`updates episode card progress and WATCHED badge on ItemDetailModal after watching an episode`**:
     - Open `Trending Severance Series` (`ItemDetailModal` opens, `Episode 201` has `playback_progress: 0`).
     - Click `Episode 201` -> enters `PlayerScreen`.
     - Simulate playback completion / progress and exit `PlayerScreen` (mocking updated `fetchMediaItem` returning `playback_progress: 1` for `201`, plus verifying optimistic update works even before `fetchMediaItem` resolves).
     - Assert `fetchMediaItem` was called again for the series ID on exit, `ItemDetailModal` re-renders on Season 2 (where `Episode 201` lives!), and `Episode 201` displays `WATCHED`.
   - **`returns to exact video subfolder (not root folder listing) when exiting video played from FolderBrowserModal`**:
     - Open `FolderBrowserModal` -> enter subfolder `Season 1` (`path: 'Season 1'`) -> click item `folder-item-501` -> `ItemDetailModal` opens -> click `Play` -> exit `PlayerScreen` -> press Back to close `ItemDetailModal`.
     - Assert `FolderBrowserModal` is still at `path: 'Season 1'` (NOT root `''`) with `folder-item-501` focused, and pressing Back once more climbs from `'Season 1'` to `''`.
   - **`preserves active library tab on BrowseScreen and does not fabricate ItemDetailModal after direct play`**:
     - Switch `BrowseScreen` sidebar to `Movies` tab -> trigger direct play -> exit `PlayerScreen`.
     - Assert `ItemDetailModal` (`role="dialog"`) is NOT opened, and `BrowseScreen` remains on `Movies` tab.
   - **`restores ItemDetailModal when closing FolderBrowserModal opened via Browse Folder button`**:
     - Open `Trending Dune Part Two` (`ItemDetailModal`) -> click `Browse Folder` -> `FolderBrowserModal` opens at item's folder -> press Back up to root and close `FolderBrowserModal` -> assert `ItemDetailModal` (`Dune: Part Two`) is restored.

- [ ] **Step 2: Run Vitest on `tests/App.test.tsx` to verify the new tests fail**

Run: `npx vitest run tests/App.test.tsx`
Expected: FAIL on episode progress not re-fetching `activeItem`, subfolder resetting to root `''`, and direct play / Browse Folder transitions.

- [ ] **Step 3: Implement `FolderBrowserModal`, `BrowseScreen`, and `App.tsx` navigation & progress sync**

1. In `src/screens/FolderBrowserModal.tsx`:
   - Add `onPathChange?: (path: string) => void;` to `FolderBrowserModalProps` (and `onPathChangeRef`).
   - In `navigateToPath(nextPath, sourceNodeId)` and `goBack()` (when `!isAtRoot`), invoke `onPathChangeRef.current?.(nextPath)` / `onPathChangeRef.current?.(parent)`.
   - In the `useEffect([libraryId, initialPath, initialFocusItemId])` sync effect (lines 753–759), guard `if (initialPath !== undefined && initialPath !== currentPath)` so calling `onPathChange` (which updates `initialPath` to the same `currentPath`) never clears `exitedChildPathRef` or `lastFocusedItemIdRef`!

2. In `src/screens/BrowseScreen.tsx`:
   - Add optional props `onTabChange?: (tab: string) => void`, `initialFocusId?: string | null`, and `onContentFocusChange?: (id: string | null) => void`.
   - Notify `onTabChange?.(activeTab)` when `activeTab` changes, notify `onContentFocusChange?.(focusedId)` when `lastContentFocusedIdRef` updates, and prefer `initialFocusId` (when `isValidContentNode(initialFocusId, data, activeTab)`) over `getFirstFocusableId(data)` on initial layout load when `focusedIdRef.current === null`.

3. In `src/App.tsx`:
   - Track:
     - `activeBrowseTab` (`string`, default `'home'`) and `lastBrowseFocusId` (`string | null`)
     - `itemDetailViewState` (`{ itemId: number | string; selectedSeason: number; lastFocusedId: string | null } | null`)
     - `suspendedItemDetail` (`{ item: MediaItemDetail; viewState: typeof itemDetailViewState } | null`)
     - `sessionProgressRef = useRef<Map<string, PlaybackProgressSnapshot>>(new Map())`
   - Reset all navigation states cleanly in `handleSwitchServer` and `onSwitchProfile`.
   - Clear `sessionProgressRef.current.clear()` when starting a fresh `handlePlayItem` from `browse` view (`view !== 'player'`).
   - Record intermediate episode progress via `handleEpisodeProgress(snap)` (`sessionProgressRef.current.set(String(snap.itemId), snap)`).
   - Rewrite `handleExitPlayer(snapshot?: PlaybackProgressSnapshot)`:
     ```ts
     const handleExitPlayer = async (snapshot?: PlaybackProgressSnapshot) => {
       if (snapshot) {
         sessionProgressRef.current.set(String(snapshot.itemId), snapshot);
       }
       const progressMap = new Map(sessionProgressRef.current);

       if (activeItem && progressMap.size > 0) {
         setActiveItem((prev) => (prev ? applyOptimisticProgress(prev, progressMap) : prev));
       }

       setView('browse');

       if (snapshot?.flushPromise) {
         await Promise.race([
           snapshot.flushPromise,
           new Promise<void>((resolve) => setTimeout(resolve, 800)),
         ]);
       }

       setScreenRefreshKey((k) => k + 1);
       if (folderBrowserState) {
         setFolderRefreshKey((k) => k + 1);
       }
       if (activePlaylistId) {
         setPlaylistRefreshKey((k) => k + 1);
       }

       if (activeItem) {
         const targetId = activeItem.id ?? activeItem.card?.id;
         if (targetId !== undefined && targetId !== null) {
           try {
             const fresh = await fetchMediaItem(client, targetId);
             setActiveItem((prev) => {
               // Only update if user is still viewing the same item
               const prevId = prev?.id ?? prev?.card?.id;
               return prev && String(prevId) === String(targetId) ? fresh : prev;
             });
           } catch (e) {
             console.warn('[App] Failed to refresh item detail on player exit:', e);
           }
         }
       }
     };
     ```
   - Update `<FolderBrowserModal>`:
     - Change `key={folderBrowserState.libraryId}` (instead of `${libraryId}-${path}`).
     - Pass `onPathChange={(nextPath) => setFolderBrowserState((prev) => (prev ? { ...prev, path: nextPath } : prev))}`.
     - In `onClose`:
       ```ts
       onClose={() => {
         setFolderBrowserState(null);
         if (suspendedItemDetail) {
           setActiveItem(suspendedItemDetail.item);
           setItemDetailViewState(suspendedItemDetail.viewState);
           setSuspendedItemDetail(null);
         }
       }}
       ```
   - Update `<ItemDetailModal>` `onBrowseFolder`:
     ```ts
     onBrowseFolder={(libraryId, folderPath) => {
       if (activeItem) {
         setSuspendedItemDetail({
           item: activeItem,
           viewState: itemDetailViewState,
         });
       }
       const focusItemId = activeItem?.id ?? activeItem?.card?.id;
       setActiveItem(null);
       setFolderBrowserState({
         libraryId,
         path: folderPath,
         lastItemId: focusItemId,
       });
     }}
     ```

- [ ] **Step 4: Run full test suite, zero-gap check, and production `chrome69` build**

Run:
1. `grep -rn "gap-" src/utils/playbackProgress.ts src/player/session.ts src/components/player/SubtitleModal.tsx src/components/tv/TVModal.tsx src/screens/PlayerScreen.tsx src/screens/ItemDetailModal.tsx src/screens/FolderBrowserModal.tsx src/screens/BrowseScreen.tsx src/App.tsx` (note: check any existing pre-change lines in `SubtitleModal.tsx` and ensure zero `gap-*` in touched/added code, or replace remaining `gap-*` in `SubtitleModal.tsx` header with margins!)
2. `npm test -- --run`
3. `npm run build`
Expected: 100% test suites passing and `tsc -b && vite build` succeeding with exit code 0.
