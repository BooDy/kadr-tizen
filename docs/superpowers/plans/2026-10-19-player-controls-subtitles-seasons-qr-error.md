# Player Controls, Subtitles, Season Navigation & QR Error Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement robust seeking/fast-forwarding with remote media keys, in-player subtitle track switching and OpenSubtitles language search, robust series season navigation in `ItemDetailModal`, and fail-fast buffering timeout with an on-screen SVG QR code error reporter on Samsung Tizen OS TV.

**Architecture:**
- Seeking: Register TV keys 417/412, fix `webapis.avplay.seekTo(ms, successCb, errorCb)` signature, debounce rapid seeks by 300ms, and display an on-screen scrub HUD badge.
- Subtitles: Create `SubtitleModal.tsx` supporting current track selection and OpenSubtitles online search with a quick language picker, downloading tracks via `/api/v1/subtitles/{item_id}/download` and auto-activating them.
- Season Navigation: Intercept Left/Right on season tabs to prevent geometric drift down to episode cards, require Enter to commit season changes, and provide direct Up/Down transit between action buttons, season tabs, and episode cards.
- Format Compatibility & QR Errors: Provide Samsung TV hardware compatibility matrix (`compatibility.ts`), enforce 10s fail-fast buffer watchdog in `PlayerScreen.tsx`, and render structured diagnostic QR code via pure-JS `qrcode` SVG generator.

**Tech Stack:**
- React 19, TypeScript 5.7, Tailwind CSS v4, Lucide React, Vitest, Testing Library, `qrcode`, Samsung Tizen AVPlay Web APIs.

## Global Constraints
- Target platform: Samsung Tizen OS TV (Chromium 69 compatible, transparent body for AVPlay hardware video plane).
- Key handling: TV remote D-Pad and media keys (Enter, Back, Play, Pause, PlayPause, FastForward 417, Rewind 412).
- Security: Subtitle and stream endpoints require auth token and library unlock tokens where applicable.
- TDD: Every task strictly follows RED -> GREEN -> REFACTOR with independent unit/integration tests.
- Zero external network dependencies for QR code generation (render pure SVG).

---

### Task 1: Seeking Engine & Remote Media Keys

**Files:**
- Modify: `src/navigation/keys.ts`
- Modify: `src/player/avplay-driver.ts`
- Modify: `src/screens/PlayerScreen.tsx`
- Test: `tests/player/driver.test.ts`
- Test: `tests/screens/PlayerScreen.seeking.test.tsx`

**Interfaces:**
- Consumes: `TVKeys` in `src/navigation/keys.ts`, `PlayerDriver` interface in `src/player/types.ts`.
- Produces: `TVKeys.FAST_FORWARD` (417), `TVKeys.REWIND` (412); AVPlay `seekTo(ms, successCb, errorCb)` 3-argument call; progressive jump amounts (30s, 60s, 120s) and seek HUD badge in `PlayerScreen.tsx`.

- [ ] **Step 1: Write the failing tests for AVPlay seekTo callbacks and PlayerScreen seeking keys**

Create `tests/screens/PlayerScreen.seeking.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { TVKeys } from '../../src/navigation/keys';
import { ApiClient } from '../../src/api/client';

vi.mock('../../src/player/driver', () => {
  return {
    createPlayerDriver: vi.fn(() => ({
      name: 'Tizen AVPlay',
      init: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      setSubtitleTrack: vi.fn(),
      destroy: vi.fn(),
      onTimeUpdate: vi.fn((cb) => cb(30000, 120000)),
      onStateChange: vi.fn((cb) => cb('playing')),
      onError: vi.fn(),
    })),
  };
});

describe('PlayerScreen Seeking & Fast Forward', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('handles TVKeys.FAST_FORWARD (417) with progressive skips and displays seek HUD', async () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        apiClient={apiClient}
        onExit={onExit}
      />
    );

    // Initial position is 30,000ms (30s)
    // 1st press FF: +30s -> target 60s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
    });

    expect(screen.getByTestId('seek-hud-badge')).toBeInTheDocument();
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('+30s');

    // Fast-forward debounce: advance timers 350ms
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // 2nd press FF within window: +60s -> target 120s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
    });
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('+60s');

    // 3rd press FF within window: +120s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
    });
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('+120s');

    // After 1500ms of inactivity, seek HUD hides
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.queryByTestId('seek-hud-badge')).not.toBeInTheDocument();
  });

  it('handles TVKeys.REWIND (412) with progressive backward skips', async () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        apiClient={apiClient}
        onExit={onExit}
      />
    );

    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.REWIND });
    });

    expect(screen.getByTestId('seek-hud-badge')).toBeInTheDocument();
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('-30s');
  });
});
```

Also add to `tests/player/driver.test.ts`:
```typescript
it('invokes webapis.avplay.seekTo with success and error callbacks', () => {
  const driver = new TizenAvplayDriver();
  const seekSpy = vi.fn();
  (window as any).webapis = {
    avplay: {
      seekTo: seekSpy,
    },
  };

  driver.seekTo(15000);
  expect(seekSpy).toHaveBeenCalledWith(
    15000,
    expect.any(Function),
    expect.any(Function)
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/screens/PlayerScreen.seeking.test.tsx`
Expected: FAIL with `TVKeys.FAST_FORWARD is undefined` or `seek-hud-badge not found`.

- [ ] **Step 3: Implement remote media keys, seekTo callbacks, debounced seeking, and seek HUD**

In `src/navigation/keys.ts`:
```typescript
export const TVKeys = {
  ENTER: 13,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  BACK_TIZEN: 10009,
  BACK_WEB: 27,
  BACKSPACE: 8,
  PLAY_PAUSE: 10252,
  PLAY: 415,
  PAUSE: 19,
  FAST_FORWARD: 417,
  REWIND: 412,
} as const;
```

In `registerTizenKeys()` inside `src/navigation/keys.ts`:
Register `MediaFastForward` and `MediaRewind`:
```typescript
['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaFastForward', 'MediaRewind', 'Search'].forEach((keyName) => {
  try {
    tvInputDevice.registerKey(keyName);
  } catch {
    // Ignore unsupported keys
  }
});
```

In `src/player/avplay-driver.ts`:
Update `seekTo`:
```typescript
  seekTo(ms: number): void {
    if (this.isDestroyed) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avplay = (window as any).webapis?.avplay;
      if (avplay && typeof avplay.seekTo === 'function') {
        avplay.seekTo(
          Math.max(0, Math.floor(ms)),
          () => {
            // Seek success
          },
          (err: any) => {
            console.error('[AVPlay] seekTo error:', err);
          }
        );
      }
    } catch (e) {
      console.error('[AVPlay] seekTo exception:', e);
    }
  }
```

In `src/screens/PlayerScreen.tsx`:
Add seek HUD state and progressive skip logic:
```typescript
  const [seekHud, setSeekHud] = useState<{ label: string; targetMs: number; direction: 'forward' | 'backward' } | null>(null);
  const seekHudTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seekDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveFfCountRef = useRef(0);
  const consecutiveRewCountRef = useRef(0);
  const lastFfTimeRef = useRef(0);
  const lastRewTimeRef = useRef(0);

  const applySeek = useCallback((deltaMs: number, direction: 'forward' | 'backward', stepLabel: string) => {
    resetOsdTimer();
    const current = positionMsRef.current;
    const dur = durationMsRef.current > 0 ? durationMsRef.current : Infinity;
    const targetMs = Math.max(0, Math.min(dur, current + deltaMs));
    positionMsRef.current = targetMs;
    setPositionMs(targetMs);

    setSeekHud({
      label: stepLabel,
      targetMs,
      direction,
    });

    if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
    seekHudTimerRef.current = setTimeout(() => {
      setSeekHud(null);
      consecutiveFfCountRef.current = 0;
      consecutiveRewCountRef.current = 0;
    }, 1500);

    if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
    seekDebounceTimerRef.current = setTimeout(() => {
      driverRef.current?.seekTo(targetMs);
    }, 300);
  }, [resetOsdTimer]);
```

In `handleKeyDown`:
- Handle `TVKeys.LEFT`: `applySeek(-10000, 'backward', '-10s');`
- Handle `TVKeys.RIGHT`: `applySeek(10000, 'forward', '+10s');`
- Handle `TVKeys.FAST_FORWARD`:
  - Calculate progressive step: count = 0 -> +30s; count = 1 -> +60s; count >= 2 -> +120s.
  - Increment `consecutiveFfCountRef.current`.
  - `applySeek(stepMs, 'forward', `+${stepMs / 1000}s`);`
- Handle `TVKeys.REWIND`:
  - Calculate progressive step: count = 0 -> -30s; count = 1 -> -60s; count >= 2 -> -120s.
  - Increment `consecutiveRewCountRef.current`.
  - `applySeek(-stepMs, 'backward', `-${stepMs / 1000}s`);`

In JSX:
Render `seek-hud-badge` in the center overlay when `seekHud` is present:
```tsx
{seekHud && (
  <div
    data-testid="seek-hud-badge"
    className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#3B1111]/90 backdrop-blur-md border border-[rgba(245,229,229,0.2)] px-6 py-3 rounded-2xl flex items-center gap-3 text-white text-2xl font-bold shadow-2xl animate-fade-in"
  >
    {seekHud.direction === 'forward' ? (
      <FastForward className="w-8 h-8 text-[#FF6B00]" />
    ) : (
      <Rewind className="w-8 h-8 text-[#FF6B00]" />
    )}
    <span>{seekHud.label}</span>
    <span className="text-[#F5E5E5]/60 text-lg font-normal">
      ({formatTime(seekHud.targetMs / 1000)} / {formatTime(durationMs / 1000)})
    </span>
  </div>
)}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/screens/PlayerScreen.seeking.test.tsx tests/player/driver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/navigation/keys.ts src/player/avplay-driver.ts src/screens/PlayerScreen.tsx tests/screens/PlayerScreen.seeking.test.tsx tests/player/driver.test.ts
git commit -m "feat(player): add TV remote fast-forward and rewind with seek HUD and debounced seeking"
```

---

### Task 2: Series Season Navigation in ItemDetailModal

**Files:**
- Modify: `src/screens/ItemDetailModal.tsx`
- Test: `tests/screens/ItemDetailModal.seasons.test.tsx`

**Interfaces:**
- Consumes: `ItemDetailModalProps`, `seasons: number[]`, `episodes: MediaItem[]`, `selectedSeason: number`.
- Produces: Strict Left/Right navigation across season tabs; pressing Enter commits `selectedSeason`; Down moves into the selected season's episode cards; Up returns from episodes to the active season tab.

- [ ] **Step 1: Write the failing tests for Season navigation**

Create `tests/screens/ItemDetailModal.seasons.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ItemDetailModal } from '../../src/screens/ItemDetailModal';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { TVKeys } from '../../src/navigation/keys';

const mockSeriesItem = {
  id: 10,
  title: 'Breaking Bad',
  type: 'series' as const,
  seasons: [1, 2, 3],
  episodes: [
    { id: 101, title: 'Pilot', season: 1, episode: 1, type: 'video' as const },
    { id: 102, title: 'Cat in the Bag', season: 1, episode: 2, type: 'video' as const },
    { id: 201, title: 'Seven Thirty-Seven', season: 2, episode: 1, type: 'video' as const },
  ],
};

describe('ItemDetailModal Season Navigation', () => {
  it('navigates strictly horizontally between season tabs with Left and Right', async () => {
    render(
      <FocusProvider>
        <ItemDetailModal
          item={mockSeriesItem}
          isOpen={true}
          onClose={vi.fn()}
          onPlay={vi.fn()}
          serverUrl="http://127.0.0.1:8492"
        />
      </FocusProvider>
    );

    // Initial season is 1
    const season1Tab = screen.getByRole('button', { name: /Season 1/i });
    const season2Tab = screen.getByRole('button', { name: /Season 2/i });

    // Focus Season 1
    act(() => {
      season1Tab.focus();
    });

    // Press Right
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });

    // Focus should move to Season 2 tab, NOT episode card
    expect(document.activeElement).toBe(season2Tab);

    // Press Enter to select Season 2
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER });
    });

    // Now Season 2 episodes should be rendered
    expect(screen.getByText('Seven Thirty-Seven')).toBeInTheDocument();
    expect(screen.queryByText('Pilot')).not.toBeInTheDocument();
  });

  it('navigates Down from active season tab to first episode card, and Up back to season tab', async () => {
    render(
      <FocusProvider>
        <ItemDetailModal
          item={mockSeriesItem}
          isOpen={true}
          onClose={vi.fn()}
          onPlay={vi.fn()}
          serverUrl="http://127.0.0.1:8492"
        />
      </FocusProvider>
    );

    const season1Tab = screen.getByRole('button', { name: /Season 1/i });
    act(() => {
      season1Tab.focus();
    });

    // Press Down from season tab
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN });
    });

    // Should focus episode card for Pilot (id 101)
    const episodeCard101 = screen.getByTestId('card-episode-card-101');
    expect(document.activeElement).toBe(episodeCard101);

    // Press Up from episode card
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.UP });
    });

    expect(document.activeElement).toBe(season1Tab);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/screens/ItemDetailModal.seasons.test.tsx`
Expected: FAIL due to missing horizontal navigation trap or focus mismatch.

- [ ] **Step 3: Implement explicit Season navigation key handling in ItemDetailModal**

In `src/screens/ItemDetailModal.tsx`:
In `handleKeyDown`:
```typescript
      if (seasons.length > 0) {
        const current = focusedId;

        // Down Navigation
        if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
          if (current && (current.startsWith('detail-') || current === 'item-detail-modal')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(`season-tab-${selectedSeason}`);
          } else if (current && current.startsWith('season-tab-')) {
            const seasonEps = episodes.filter((ep) => ep.season === selectedSeason);
            if (seasonEps.length > 0) {
              e.preventDefault();
              e.stopImmediatePropagation();
              setFocusedId(`episode-card-${seasonEps[0].id}`);
            }
          }
        } 
        // Up Navigation
        else if (code === TVKeys.UP || e.key === 'ArrowUp') {
          if (current && current.startsWith('episode-card-')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(`season-tab-${selectedSeason}`);
          } else if (current && current.startsWith('season-tab-')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(primaryBtnId);
          }
        }
        // Left Navigation on Season Tabs
        else if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
          if (current && current.startsWith('season-tab-')) {
            const seasonNum = parseInt(current.replace('season-tab-', ''), 10);
            const currentIdx = seasons.indexOf(seasonNum);
            if (currentIdx > 0) {
              e.preventDefault();
              e.stopImmediatePropagation();
              const prevSeason = seasons[currentIdx - 1];
              setFocusedId(`season-tab-${prevSeason}`);
            }
          }
        }
        // Right Navigation on Season Tabs
        else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
          if (current && current.startsWith('season-tab-')) {
            const seasonNum = parseInt(current.replace('season-tab-', ''), 10);
            const currentIdx = seasons.indexOf(seasonNum);
            if (currentIdx >= 0 && currentIdx < seasons.length - 1) {
              e.preventDefault();
              e.stopImmediatePropagation();
              const nextSeason = seasons[currentIdx + 1];
              setFocusedId(`season-tab-${nextSeason}`);
            }
          }
        }
        // Enter Navigation on Season Tabs: Commit Season Switch
        else if (code === TVKeys.ENTER || e.key === 'Enter') {
          if (current && current.startsWith('season-tab-')) {
            const seasonNum = parseInt(current.replace('season-tab-', ''), 10);
            if (!isNaN(seasonNum) && seasonNum !== selectedSeason) {
              e.preventDefault();
              e.stopImmediatePropagation();
              setSelectedSeason(seasonNum);
            }
          }
        }
      }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/screens/ItemDetailModal.seasons.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/ItemDetailModal.tsx tests/screens/ItemDetailModal.seasons.test.tsx
git commit -m "fix(series): isolate season tab navigation and commit season change on Enter"
```

---

### Task 3: In-Player Subtitle Selection & Online Search

**Files:**
- Create: `src/components/player/SubtitleModal.tsx`
- Modify: `src/screens/PlayerScreen.tsx`
- Modify: `src/components/player/PlayerOSD.tsx`
- Test: `tests/components/player/SubtitleModal.test.tsx`

**Interfaces:**
- Consumes: `itemId: string | number`, `apiClient: ApiClient`, `subtitles: SubtitleTrack[]`, `selectedSubtitleId: number | null`, `onSelectSubtitle: (id: number | null) => void`, `onClose: () => void`.
- Produces: `SubtitleModal` component with Tab 1 ("Tracks") and Tab 2 ("Search Online"). Queries `/api/v1/subtitles/{item_id}/search?languages={lang}` and downloads via `/api/v1/subtitles/{item_id}/download`.

- [ ] **Step 1: Write the failing tests for SubtitleModal**

Create `tests/components/player/SubtitleModal.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SubtitleModal } from '../../src/components/player/SubtitleModal';
import { ApiClient } from '../../src/api/client';
import { TVKeys } from '../../src/navigation/keys';

const mockTracks = [
  { id: 1, media_item_id: 10, source: 'embedded' as any, language: 'eng', title: 'English [Original]', format: 'srt' as any, is_default: true, is_forced: false, stream_url: '/api/v1/subtitles/1/stream.vtt' },
  { id: 2, media_item_id: 10, source: 'external' as any, language: 'ara', title: 'Arabic', format: 'vtt' as any, is_default: false, is_forced: false, stream_url: '/api/v1/subtitles/2/stream.vtt' },
];

describe('SubtitleModal', () => {
  it('renders track list and allows selecting a subtitle track or Off', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const apiClient = new ApiClient('http://127.0.0.1:8492');

    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={apiClient}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={onSelect}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Subtitles')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('English [Original] (eng)')).toBeInTheDocument();
    expect(screen.getByText('Arabic (ara)')).toBeInTheDocument();

    // Select Arabic
    fireEvent.click(screen.getByText('Arabic (ara)'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('searches OpenSubtitles by language and downloads chosen subtitle', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onSubtitleDownloaded = vi.fn();
    const apiClient = new ApiClient('http://127.0.0.1:8492');

    vi.spyOn(apiClient, 'fetch').mockImplementation(async (path: string, options?: any) => {
      if (path.includes('/search')) {
        return {
          configured: true,
          matches: [
            {
              file_id: 'os-999',
              language: 'ara',
              format: 'srt',
              title: 'Breaking.Bad.S01E01.Arabic.srt',
              download_count: 1420,
              hearing_impaired: false,
            },
          ],
        } as any;
      }
      if (path.includes('/download')) {
        return {
          id: 3,
          media_item_id: 10,
          source: 'online',
          language: 'ara',
          title: 'Breaking.Bad.S01E01.Arabic.srt',
          format: 'srt',
          is_default: false,
          is_forced: false,
          stream_url: '/api/v1/subtitles/3/stream.vtt',
        } as any;
      }
      return {} as any;
    });

    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={apiClient}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={onSelect}
        onSubtitleDownloaded={onSubtitleDownloaded}
        onClose={onClose}
      />
    );

    // Switch to "Search Online" tab
    fireEvent.click(screen.getByText('Search Online'));

    // Pick Arabic language button
    fireEvent.click(screen.getByTestId('lang-btn-ara'));

    await waitFor(() => {
      expect(screen.getByText('Breaking.Bad.S01E01.Arabic.srt')).toBeInTheDocument();
    });

    // Click Download button
    fireEvent.click(screen.getByText('Download & Activate'));

    await waitFor(() => {
      expect(onSubtitleDownloaded).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
      expect(onSelect).toHaveBeenCalledWith(3);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/player/SubtitleModal.test.tsx`
Expected: FAIL with `Cannot find module '../../src/components/player/SubtitleModal'`

- [ ] **Step 3: Implement SubtitleModal and integrate into PlayerScreen**

Create `src/components/player/SubtitleModal.tsx`:
```tsx
import React, { useState, useEffect } from 'react';
import { Check, Download, Globe, ListFilter, X, Search, Loader2 } from 'lucide-react';
import { SubtitleTrack } from '../../api/items';
import { ApiClient } from '../../api/client';
import { TVKeys } from '../../navigation/keys';

export interface SubtitleModalProps {
  isOpen: boolean;
  itemId: string | number;
  apiClient: ApiClient;
  subtitles: SubtitleTrack[];
  selectedSubtitleId: number | null;
  onSelectSubtitle: (id: number | null) => void;
  onSubtitleDownloaded?: (track: SubtitleTrack) => void;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'ara', name: 'Arabic' },
  { code: 'fre', name: 'French' },
  { code: 'spa', name: 'Spanish' },
  { code: 'ger', name: 'German' },
  { code: 'all', name: 'All Languages' },
];

export function SubtitleModal({
  isOpen,
  itemId,
  apiClient,
  subtitles,
  selectedSubtitleId,
  onSelectSubtitle,
  onSubtitleDownloaded,
  onClose,
}: SubtitleModalProps) {
  const [activeTab, setActiveTab] = useState<'tracks' | 'search'>('tracks');
  const [selectedLang, setSelectedLang] = useState<string>('eng');
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSearch = async (langCode: string) => {
    setSelectedLang(langCode);
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const queryParam = langCode === 'all' ? '' : `?languages=${langCode}`;
      const res = await apiClient.fetch<{ configured: boolean; matches: any[] }>(
        `/api/v1/subtitles/${itemId}/search${queryParam}`
      );
      if (!res.configured) {
        setSearchError('OpenSubtitles is not configured on the server.');
      } else {
        setSearchResults(res.matches || []);
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to search online subtitles.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = async (match: any) => {
    setDownloadingId(match.file_id);
    try {
      const downloadedTrack = await apiClient.fetch<SubtitleTrack>(
        `/api/v1/subtitles/${itemId}/download`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_id: match.file_id,
            language: match.language,
            title: match.title,
            is_forced: match.hearing_impaired || false,
          }),
        }
      );
      onSubtitleDownloaded?.(downloadedTrack);
      onSelectSubtitle(downloadedTrack.id);
      onClose();
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to download subtitle track.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Subtitles"
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-8 select-none"
    >
      <div className="w-[1000px] max-w-[90vw] max-h-[85vh] bg-[#2A0A0A] border border-[rgba(245,229,229,0.15)] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[rgba(245,229,229,0.08)] bg-[#3B1111]">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-black text-[#F5E5E5] flex items-center gap-3">
              <Globe className="w-7 h-7 text-[#FF6B00]" /> Subtitles
            </h2>
            <div className="flex items-center gap-2 bg-[#2A0A0A] p-1 rounded-xl border border-[rgba(245,229,229,0.08)]">
              <button
                type="button"
                onClick={() => setActiveTab('tracks')}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                  activeTab === 'tracks'
                    ? 'bg-[#FF6B00] text-white shadow-lg'
                    : 'text-[#F5E5E5]/70 hover:text-white'
                }`}
              >
                <ListFilter className="w-4 h-4 inline mr-2" /> Current Tracks ({subtitles.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('search');
                  if (searchResults.length === 0 && !isSearching) {
                    handleSearch(selectedLang);
                  }
                }}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                  activeTab === 'search'
                    ? 'bg-[#FF6B00] text-white shadow-lg'
                    : 'text-[#F5E5E5]/70 hover:text-white'
                }`}
              >
                <Search className="w-4 h-4 inline mr-2" /> Search Online
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full hover:bg-white/10 text-[#F5E5E5]/70 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-none">
          {activeTab === 'tracks' ? (
            <div className="space-y-3">
              {/* Off Track */}
              <button
                type="button"
                onClick={() => {
                  onSelectSubtitle(null);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-bold text-lg border transition ${
                  selectedSubtitleId === null
                    ? 'bg-[#FF6B00]/20 border-[#FF6B00] text-[#FF6B00]'
                    : 'bg-[#3B1111]/60 border-[rgba(245,229,229,0.08)] text-[#F5E5E5] hover:bg-[#3B1111]'
                }`}
              >
                <span>Off</span>
                {selectedSubtitleId === null && <Check className="w-6 h-6" />}
              </button>

              {subtitles.map((track) => {
                const isSelected = selectedSubtitleId === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => {
                      onSelectSubtitle(track.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-bold text-lg border transition ${
                      isSelected
                        ? 'bg-[#FF6B00]/20 border-[#FF6B00] text-[#FF6B00]'
                        : 'bg-[#3B1111]/60 border-[rgba(245,229,229,0.08)] text-[#F5E5E5] hover:bg-[#3B1111]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span>{track.title || `Track ${track.id}`}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-black/40 text-[#F5E5E5]/60 uppercase">
                        {track.language}
                      </span>
                      {track.is_default && (
                        <span className="text-xs px-2 py-0.5 rounded bg-[#FFB800]/20 text-[#FFB800]">
                          Default
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-6 h-6" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              {/* Language Picker */}
              <div className="flex items-center gap-3 overflow-x-auto pb-4 mb-6 border-b border-[rgba(245,229,229,0.08)]">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    data-testid={`lang-btn-${lang.code}`}
                    onClick={() => handleSearch(lang.code)}
                    className={`px-5 py-2.5 rounded-full font-bold text-sm shrink-0 transition ${
                      selectedLang === lang.code
                        ? 'bg-[#FF6B00] text-white'
                        : 'bg-[#3B1111] text-[#F5E5E5]/70 hover:text-white border border-[rgba(245,229,229,0.08)]'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>

              {/* Status / Results */}
              {isSearching && (
                <div className="flex flex-col items-center justify-center py-16 text-[#F5E5E5]/70">
                  <Loader2 className="w-10 h-10 animate-spin text-[#FF6B00] mb-4" />
                  <p className="text-lg font-bold">Searching OpenSubtitles...</p>
                </div>
              )}

              {searchError && (
                <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-2xl text-red-200 mb-6">
                  {searchError}
                </div>
              )}

              {!isSearching && searchResults.length === 0 && !searchError && (
                <div className="text-center py-16 text-[#F5E5E5]/60 text-lg">
                  No online subtitles found for this language.
                </div>
              )}

              <div className="space-y-3">
                {searchResults.map((match) => (
                  <div
                    key={match.file_id}
                    className="flex items-center justify-between p-4 bg-[#3B1111]/70 border border-[rgba(245,229,229,0.08)] rounded-2xl"
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="text-base font-bold text-[#F5E5E5] truncate">
                        {match.title || match.file_name || `Subtitle ${match.file_id}`}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#F5E5E5]/60 mt-1">
                        <span className="uppercase font-bold text-[#FFB800]">{match.language}</span>
                        <span>Format: {match.format || 'srt'}</span>
                        {match.download_count !== undefined && (
                          <span>Downloads: {match.download_count}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={downloadingId === match.file_id}
                      onClick={() => handleDownload(match)}
                      className="px-5 py-2.5 rounded-xl font-bold bg-[#FF6B00] text-white flex items-center gap-2 hover:bg-[#FF8533] disabled:opacity-50 transition"
                    >
                      {downloadingId === match.file_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>Download & Activate</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Now integrate `SubtitleModal` in `src/screens/PlayerScreen.tsx`:
- Add `const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState(false);`
- When Subtitle button in OSD is clicked, set `setIsSubtitleModalOpen(true)`.
- Pass `onSubtitleDownloaded={(track) => setSubtitles(prev => [...prev, track])}`.
- Mount `<SubtitleModal ... />`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/components/player/SubtitleModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/player/SubtitleModal.tsx src/screens/PlayerScreen.tsx src/components/player/PlayerOSD.tsx tests/components/player/SubtitleModal.test.tsx
git commit -m "feat(player): add in-player subtitle modal with track selection and OpenSubtitles language search"
```

---

### Task 4: Hardware Codec Compatibility Matrix, 10s Fail-Fast Watchdog & SVG QR Code Error Reporter

**Files:**
- Create: `src/player/compatibility.ts`
- Create: `src/components/player/ErrorQRCode.tsx`
- Modify: `src/screens/PlayerScreen.tsx`
- Test: `tests/player/compatibility.test.ts`
- Test: `tests/components/player/ErrorQRCode.test.tsx`
- Test: `tests/screens/PlayerScreen.timeout.test.tsx`

**Interfaces:**
- Consumes: Media stream info (codecs, container), TV model/user-agent, error details.
- Produces: `isSupportedOnSamsungTv(videoCodec, audioCodec, container)`; 10s fail-fast buffer watchdog in `PlayerScreen.tsx`; `ErrorQRCode` generating clean SVG QR code with structured diagnostic payload.

- [ ] **Step 1: Write the failing tests for compatibility and QR code generation**

Create `tests/player/compatibility.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { checkMediaCompatibility, KNOWN_COMPATIBILITY_INFO } from '../../src/player/compatibility';

describe('Samsung TV Codec Compatibility Matrix', () => {
  it('identifies supported codecs (h264, hevc, aac, ac3)', () => {
    const result = checkMediaCompatibility('h264', 'aac', 'mp4');
    expect(result.isSupported).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('identifies unsupported DTS audio on Samsung TV hardware', () => {
    const result = checkMediaCompatibility('hevc', 'dts', 'mkv');
    expect(result.isSupported).toBe(false);
    expect(result.reasons).toContain('DTS audio is not supported on Samsung TV hardware (2018+ models lack DTS decoders).');
  });

  it('identifies unsupported AV1 video on pre-2021 Tizen chipsets', () => {
    const result = checkMediaCompatibility('av1', 'aac', 'mp4');
    expect(result.isSupported).toBe(false);
    expect(result.reasons).toContain('AV1 video decoding is not supported on this TV hardware.');
  });
});
```

Create `tests/components/player/ErrorQRCode.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ErrorQRCode } from '../../src/components/player/ErrorQRCode';

describe('ErrorQRCode', () => {
  it('renders an SVG QR code containing the structured diagnostic payload', async () => {
    const errorPayload = {
      app: 'kadr-tizen',
      item_id: 1234,
      title: 'Breaking Bad S01E01',
      video_codec: 'hevc',
      audio_codec: 'dts',
      stream_url: 'http://192.168.1.109:8492/api/v1/stream/1234',
      driver: 'Tizen AVPlay',
      error: 'Buffering timeout after 10s (Likely unsupported codec: dts)',
      tv_model: 'UA55TU7000UXEG',
      tizen_version: '5.5',
      timestamp: '2026-10-19T22:50:00Z',
    };

    render(<ErrorQRCode payload={errorPayload} />);

    expect(screen.getByTestId('error-qr-code')).toBeInTheDocument();
    // SVG element should be rendered
    const svg = screen.getByTestId('error-qr-code').querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
```

Create `tests/screens/PlayerScreen.timeout.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { ApiClient } from '../../src/api/client';

vi.mock('../../src/player/driver', () => {
  return {
    createPlayerDriver: vi.fn(() => ({
      name: 'Tizen AVPlay',
      init: vi.fn().mockImplementation(() => new Promise(() => {})), // hangs indefinitely
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      setSubtitleTrack: vi.fn(),
      destroy: vi.fn(),
      onTimeUpdate: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn(),
    })),
  };
});

describe('PlayerScreen 10s Fail-Fast Buffering Timeout', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('triggers error screen with QR code if stream does not play within 10 seconds', async () => {
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="555"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    // Initial state is buffering/loading
    expect(screen.queryByTestId('error-qr-code')).not.toBeInTheDocument();

    // Advance timers by 10,000ms
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Should now display error screen with QR code
    expect(screen.getByText(/Buffering timeout after 10s/i)).toBeInTheDocument();
    expect(screen.getByTestId('error-qr-code')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/player/compatibility.test.ts tests/components/player/ErrorQRCode.test.tsx tests/screens/PlayerScreen.timeout.test.tsx`
Expected: FAIL due to missing files/modules.

- [ ] **Step 3: Implement compatibility matrix, ErrorQRCode component, and fail-fast watchdog**

Create `src/player/compatibility.ts`:
```typescript
export interface CompatibilityResult {
  isSupported: boolean;
  reasons: string[];
  warnings: string[];
}

export const KNOWN_COMPATIBILITY_INFO = {
  supportedVideo: ['h264', 'avc', 'hevc', 'h265', 'vp9', 'mpeg4'],
  unsupportedVideo: ['av1', 'hi10p', 'vc1', 'rv40'],
  supportedAudio: ['aac', 'ac3', 'eac3', 'mp3', 'flac', 'pcm'],
  unsupportedAudio: ['dts', 'dts-hd', 'dts-x', 'truehd'],
  supportedContainers: ['mp4', 'mkv', 'webm', 'ts'],
  unsupportedContainers: ['iso', 'vob', 'rmvb'],
};

export function checkMediaCompatibility(
  videoCodec?: string,
  audioCodec?: string,
  container?: string
): CompatibilityResult {
  const v = videoCodec?.toLowerCase().trim() || '';
  const a = audioCodec?.toLowerCase().trim() || '';
  const c = container?.toLowerCase().trim() || '';

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (KNOWN_COMPATIBILITY_INFO.unsupportedAudio.some((bad) => a.includes(bad))) {
    reasons.push('DTS audio is not supported on Samsung TV hardware (2018+ models lack DTS decoders).');
  }

  if (KNOWN_COMPATIBILITY_INFO.unsupportedVideo.some((bad) => v.includes(bad))) {
    if (v.includes('av1')) {
      reasons.push('AV1 video decoding is not supported on this TV hardware.');
    } else if (v.includes('hi10p')) {
      reasons.push('Hi10P (H.264 10-bit) is not supported by TV hardware decoders.');
    } else {
      reasons.push(`Video codec "${videoCodec}" is unsupported on Samsung Tizen.`);
    }
  }

  if (c && KNOWN_COMPATIBILITY_INFO.unsupportedContainers.some((bad) => c.includes(bad))) {
    reasons.push(`Container format "${container}" is not supported.`);
  }

  return {
    isSupported: reasons.length === 0,
    reasons,
    warnings,
  };
}
```

Create `src/components/player/ErrorQRCode.tsx`:
```tsx
import React, { useMemo } from 'react';
import QRCode from 'qrcode';

export interface DiagnosticPayload {
  app: string;
  item_id: string | number;
  title?: string;
  video_codec?: string;
  audio_codec?: string;
  stream_url: string;
  driver: string;
  error: string;
  tv_model?: string;
  tizen_version?: string;
  timestamp: string;
}

export function ErrorQRCode({ payload }: { payload: DiagnosticPayload }) {
  const qrSvg = useMemo(() => {
    try {
      const text = JSON.stringify(payload, null, 2);
      let svg = '';
      QRCode.toString(text, { type: 'svg', margin: 1, width: 220, color: { dark: '#000000', light: '#FFFFFF' } }, (err, string) => {
        if (!err && string) {
          svg = string;
        }
      });
      return svg;
    } catch {
      return '';
    }
  }, [payload]);

  return (
    <div
      data-testid="error-qr-code"
      className="bg-white p-3 rounded-2xl shadow-xl flex flex-col items-center justify-center shrink-0"
    >
      {qrSvg ? (
        <div
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          className="w-[200px] h-[200px] flex items-center justify-center"
        />
      ) : (
        <div className="w-[200px] h-[200px] flex items-center justify-center text-black font-bold">
          QR Code Unavailable
        </div>
      )}
      <span className="text-black text-xs font-bold mt-1 text-center">
        Scan with Phone Camera to Copy
      </span>
    </div>
  );
}
```

In `src/screens/PlayerScreen.tsx`:
Add a 10s watchdog timer in `useEffect` when initializing driver:
```typescript
    const bufferWatchdog = setTimeout(() => {
      if (playerStateRef.current !== 'playing') {
        console.error('[PlayerScreen] 10s buffering timeout fired');
        driver.destroy();
        setPlayerState('error');
        playerStateRef.current = 'error';
        setPlaybackError({
          message: 'Buffering timeout after 10s. The stream may contain an unsupported codec (e.g. DTS audio or AV1 video) or network stalls.',
          streamUrl,
          driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
        });
      }
    }, 10000);
```
Clear `bufferWatchdog` inside `driver.onStateChange` once state is `'playing'`, and in effect cleanup.

In error screen layout:
Render `ErrorQRCode` on the right side of the error card with structured diagnostic data, plus the codec compatibility reference list.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/player/compatibility.test.ts tests/components/player/ErrorQRCode.test.tsx tests/screens/PlayerScreen.timeout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/player/compatibility.ts src/components/player/ErrorQRCode.tsx src/screens/PlayerScreen.tsx tests/player/compatibility.test.ts tests/components/player/ErrorQRCode.test.tsx tests/screens/PlayerScreen.timeout.test.tsx
git commit -m "feat(player): add codec compatibility check, 10s fail-fast buffer watchdog, and SVG QR error reporter"
```

---

### Task 5: Integration Wiring, Test Suite Verification & Package Build

**Files:**
- Modify: `tests/App.test.tsx`
- Run: full test suite and production build

**Interfaces:**
- Consumes: All modules from Tasks 1–4.
- Produces: 100% passing test suite across all 28+ test files, clean production build `npm run build`, and validated packaging ready for TV deployment.

- [ ] **Step 1: Run full test suite to verify no regressions**

Run: `npm test`
Expected: 28+ test files pass, 0 failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with 0 TypeScript and Vite bundle errors.

- [ ] **Step 3: Run package-wgt script to prepare package**

Run: `npm run package:wgt`
Expected: Generates `kadr.wgt` ready for deployment to Samsung TV.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: complete integration and verify packaging for player controls, subtitles, seasons, and QR error reporting"
```
