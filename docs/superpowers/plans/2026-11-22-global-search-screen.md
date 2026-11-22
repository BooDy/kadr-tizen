# Sub-Project 4: Global Search Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a split-layout living-room **Global Search** tab (`<SearchView />`) in `BrowseScreen` featuring a fast `6×6` D-pad alphanumeric keyboard, focusable native `<input dir="auto">` for Samsung Tizen IME / Arabic / SmartThings / USB keyboards, media-type filter pills, and live FTS5 `/api/v1/search` results opening `ItemDetailModal` on `[OK]` and instant-playing on `Play`.

**Architecture:** Add a typed `/api/v1/search` client + profile-scoped session state helper (`src/api/search.ts`), build `<SearchView />` (`src/screens/SearchView.tsx`) with deterministic intra- and cross-zone D-pad navigation across the Input Bar, Utility Keys, `6×6` Keyboard Grid, Filter Pills, and `4`-column Results Grid, and mount it as a virtual sidebar view (`activeTab === 'search'`, `nav-screen-search`) inside `BrowseScreen.tsx`.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6 (`chrome69`), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex `gap-*` classes** in any new or modified JSX/CSS (`SearchView.tsx`, `BrowseScreen.tsx`, `App.tsx`); use explicit physical margins (`mr-*`, `mb-*`, `ml-*`) and inline `gridGap` on CSS Grid containers.
- Keep `BrowseScreen` (and `<SearchView />`) unmounted while `view === 'player'` so `AVPlay`'s transparent hardware plane remains unobstructed, while preserving the active search query & filter in `savedSearchState` across player round-trips and resetting `savedSearchState` on profile switch, server switch, and `401` session expiry.
- Place `nav-screen-search` in `sidebar-items-container` immediately above `nav-screen-playlists` (`order = screenItems.length + 1`) so `Home` (`order = 1`) and library tabs (`2..N`) remain contiguous.
- Pressing `[OK]` (`Enter`) on a `search-card-{id}` calls `onSelectItem(item.id)` (`ItemDetailModal`), while pressing `TVKeys.PLAY` (`415` / `e.key === 'MediaPlay'`) calls `onPlayItem(item.id, resumeSentinel, item.title)` (`PlayerScreen`).
- Strict layered Back navigation:
  1. While editing `<input>` (`document.activeElement` is the search text input): `BACK_TIZEN` / `Escape` / `IME_DONE` / `IME_CANCEL` blurs `<input>` keeping TV focus on `search-query-input` (`Backspace` edits text normally).
  2. Focused anywhere in `<SearchView />` (not editing `<input>`): `Back` moves focus to sidebar `nav-screen-search`.
  3. Focused on `nav-screen-search`: `Back` triggers `onRequestExit` (`<ExitConfirmModal>`).

---

### Task 1: Search Types, `/api/v1/search` Client Helper & Saved Search Session State (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/types/kadr.ts:115-145`
- Create: `src/api/search.ts`
- Create: `tests/api/search.test.ts`

**Interfaces:**
- Produces:
  - `src/types/kadr.ts`: `SearchFilterType`, `SearchResultItem`, `SearchResponse`
  - `src/api/search.ts`:
    - `export const DEFAULT_TV_SEARCH_LIMIT = 48;`
    - `export interface FetchSearchOptions { q: string; itemType?: SearchFilterType; libraryId?: string; limit?: number; signal?: AbortSignal; }`
    - `export async function fetchSearchResults(client: ApiClient, options: FetchSearchOptions): Promise<SearchResponse>`
    - `export interface SavedSearchState { query: string; filter: SearchFilterType; }`
    - `export function getSavedSearchState(): SavedSearchState`
    - `export function setSavedSearchState(next: SavedSearchState): void`
    - `export function resetSavedSearchState(): void`

- [ ] **Step 1: Write failing unit tests in `tests/api/search.test.ts`**

Create `tests/api/search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import {
  DEFAULT_TV_SEARCH_LIMIT,
  fetchSearchResults,
  getSavedSearchState,
  resetSavedSearchState,
  setSavedSearchState,
} from '../../src/api/search';

describe('search API client & saved session state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSavedSearchState();
  });

  it('short-circuits empty or whitespace queries without making a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('http://192.168.1.50:8492');

    const res = await fetchSearchResults(client, { q: '   ' });
    expect(res).toEqual({ query: '', total: 0, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes q, default limit=48, omits item_type for "all", and forwards item_type and AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'dune',
        total: 1,
        items: [
          {
            id: 10,
            library_id: 'lib-1',
            library_name: 'Movies',
            item_type: 'movie',
            title: 'Dune',
            poster_url: '/api/v1/artwork/10/poster',
            duration_seconds: 9300,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('jwt-abc');
    const controller = new AbortController();

    const allRes = await fetchSearchResults(client, {
      q: '  dune  ',
      itemType: 'all',
      signal: controller.signal,
    });
    expect(allRes.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://192.168.1.50:8492/api/v1/search?q=dune&limit=${DEFAULT_TV_SEARCH_LIMIT}`,
      expect.objectContaining({ signal: controller.signal })
    );

    await fetchSearchResults(client, {
      q: 'severance',
      itemType: 'show',
      limit: 24,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://192.168.1.50:8492/api/v1/search?q=severance&limit=24&item_type=show',
      expect.any(Object)
    );
  });

  it('persists and resets in-memory saved search state cleanly', () => {
    expect(getSavedSearchState()).toEqual({ query: '', filter: 'all' });
    setSavedSearchState({ query: 'matrix', filter: 'movie' });
    expect(getSavedSearchState()).toEqual({ query: 'matrix', filter: 'movie' });
    resetSavedSearchState();
    expect(getSavedSearchState()).toEqual({ query: '', filter: 'all' });
  });
});
```

- [ ] **Step 2: Run Vitest on `tests/api/search.test.ts` to verify failure (RED)**

Run: `npx vitest run tests/api/search.test.ts`
Expected: FAIL (`Cannot find module '../../src/api/search'`).

- [ ] **Step 3: Implement `SearchResultItem` types and `src/api/search.ts`**

1. Append `SearchFilterType`, `SearchResultItem`, and `SearchResponse` to `src/types/kadr.ts`:
   ```ts
   export type SearchFilterType =
     | 'all'
     | 'movie'
     | 'show'
     | 'episode'
     | 'anime'
     | 'music'
     | 'audiobook'
     | 'live_channel';

   export interface SearchResultItem {
     id: number;
     library_id: string;
     library_name: string;
     item_type: string;
     title: string;
     original_title?: string | null;
     release_year?: number | null;
     overview?: string | null;
     poster_url: string;
     backdrop_url?: string | null;
     badge?: string | null;
     rating?: number | null;
     duration_seconds: number;
     playback_progress?: number | null;
     series_title?: string | null;
     season?: number | null;
     episode?: number | null;
     genres?: string[];
     director?: string | null;
   }

   export interface SearchResponse {
     query: string;
     total: number;
     items: SearchResultItem[];
   }
   ```
2. Create `src/api/search.ts`:
   ```ts
   import { ApiClient } from './client';
   import { SearchFilterType, SearchResponse } from '../types/kadr';

   export const DEFAULT_TV_SEARCH_LIMIT = 48;

   export interface FetchSearchOptions {
     q: string;
     itemType?: SearchFilterType;
     libraryId?: string;
     limit?: number;
     signal?: AbortSignal;
   }

   export interface SavedSearchState {
     query: string;
     filter: SearchFilterType;
   }

   let savedState: SavedSearchState = {
     query: '',
     filter: 'all',
   };

   export function getSavedSearchState(): SavedSearchState {
     return { ...savedState };
   }

   export function setSavedSearchState(next: SavedSearchState): void {
     savedState = {
       query: next.query,
       filter: next.filter,
     };
   }

   export function resetSavedSearchState(): void {
     savedState = {
       query: '',
       filter: 'all',
     };
   }

   export async function fetchSearchResults(
     client: ApiClient,
     options: FetchSearchOptions
   ): Promise<SearchResponse> {
     const trimmed = options.q.trim();
     if (!trimmed) {
       return { query: '', total: 0, items: [] };
     }

     const params = new URLSearchParams();
     params.set('q', trimmed);
     params.set('limit', String(options.limit ?? DEFAULT_TV_SEARCH_LIMIT));
     if (options.itemType && options.itemType !== 'all') {
       params.set('item_type', options.itemType);
     }
     if (options.libraryId && options.libraryId.trim()) {
       params.set('library_id', options.libraryId.trim());
     }

     return client.fetch<SearchResponse>(`/api/v1/search?${params.toString()}`, {
       signal: options.signal,
     });
   }
   ```

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `npx vitest run tests/api/search.test.ts && npx tsc -b`
Expected: PASS (3/3 tests green, `tsc -b` exit 0).

- [ ] **Step 5: Commit Task 1**

```bash
git add src/types/kadr.ts src/api/search.ts tests/api/search.test.ts
git commit -m "feat(search): add /api/v1/search client helper and saved session state"
```

---

### Task 2: `<SearchView />` Split TV Keyboard, IME Input Bar, Filter Pills, Results Grid & Deterministic D-Pad Matrix (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Create: `src/screens/SearchView.tsx`
- Create: `tests/screens/SearchView.test.tsx`

**Interfaces:**
- Consumes: `fetchSearchResults`, `getSavedSearchState`, `setSavedSearchState` from `src/api/search.ts`; `SearchFilterType`, `SearchResultItem` from `src/types/kadr.ts`; `getAuthenticatedImageUrl` from `src/utils/imageUrl.ts`; `toResumePercentageSentinel` from `src/utils/playbackProgress.ts`
- Produces:
  - `src/screens/SearchView.tsx`:
    - `export interface SearchViewProps { client: ApiClient; serverUrl: string; token?: string; refreshKey?: number; onSelectItem: (itemId: number | string) => void; onPlayItem: (itemId: number | string, resumeMs?: number, title?: string) => void; onNavigateToSidebar?: () => void; }`
    - `export function SearchView(props: SearchViewProps): JSX.Element`
    - `export function isSearchContentNodeId(id: string | null | undefined): boolean`
    - `export function isSearchLeftmostNodeId(id: string | null | undefined): boolean`
    - `export function getFirstSearchFocusableId(): string`

- [ ] **Step 1: Write failing component & D-pad tests in `tests/screens/SearchView.test.tsx`**

Create `tests/screens/SearchView.test.tsx` testing:
1. Renders idle discovery state with zero `gap-*` classes across the entire rendered tree (`container.innerHTML` / `className` check).
2. Typing via `search-key-d`, `search-key-u`, `search-key-n`, `search-key-e`, `search-action-space`, `search-action-backspace` (including surrogate-pair emoji safety), and `search-action-clear` updates `search-query-input`, debounces `fetchSearchResults` by `220ms`, and aborts superseded in-flight requests.
3. Native `<input>` IME editing flow: pressing `Enter` on `search-query-input` focuses the underlying `<input>` element; while focused, `Backspace` edits text without leaving `SearchView`, and `TVKeys.IME_DONE` / `TVKeys.BACK_TIZEN` / `Escape` blurs the `<input>` keeping TV focus on `search-query-input` (without calling `onNavigateToSidebar`).
4. Deterministic cross-zone D-pad navigation:
   - Keyboard `col 0` (`search-key-a`, `search-action-space`, `search-query-input`) + `ArrowLeft` calls `onNavigateToSidebar`.
   - Keyboard `col 5` (`search-key-f`) + `ArrowRight` jumps to `search-card-{firstId}` when results exist (or `search-filter-all` when empty).
   - Results `col 0` (`search-card-{firstId}`) + `ArrowLeft` returns to `search-key-f` (`lastKeyboardFocusId`) instead of jumping to sidebar!
   - Results row `0` + `ArrowUp` moves to `search-filter-{activeFilter}`, and activating `search-filter-show` immediately re-queries with `itemType: 'show'`.
   - When `activeFilter !== 'all'` yields `0` results, `search-reset-filter-btn` resets filter back to `'all'`.
5. Result card actions: `[OK]` (`Enter`) calls `onSelectItem(item.id)`, while `TVKeys.PLAY` calls `onPlayItem(item.id, resumeSentinel, item.title)`.

- [ ] **Step 2: Run Vitest on `tests/screens/SearchView.test.tsx` to verify failure (RED)**

Run: `npx vitest run tests/screens/SearchView.test.tsx`
Expected: FAIL (`Cannot find module '../../src/screens/SearchView'`).

- [ ] **Step 3: Implement `src/screens/SearchView.tsx`**

Implement `SearchView.tsx` following `docs/superpowers/specs/2026-11-21-global-search-screen-design.md` verbatim:
- Export pure helpers `isSearchContentNodeId(id)`, `isSearchLeftmostNodeId(id)` (`true` **only** for `search-query-input`, `search-action-space`, and the 6 `col === 0` keys `search-key-a`, `search-key-g`, `search-key-m`, `search-key-s`, `search-key-y`, `search-key-4`), and `getFirstSearchFocusableId()` (`'search-key-a'` if in DOM, else `'search-query-input'`).
- Render `#search-query-input` as a focusable wrapper `<div id="search-query-input" role="button" tabIndex={-1}>` containing `<input ref={inputRef} data-testid="search-native-input" type="text" dir="auto" tabIndex={-1} />` so D-pad navigation onto `#search-query-input` does **not** trigger the blocking Samsung Tizen system IME involuntarily; pressing `[OK]` (`Enter`) on `#search-query-input` (or clicking the `<input>`) calls `inputRef.current?.focus()` to enter IME mode (`document.activeElement === inputRef.current`), and pressing `TVKeys.BACK_TIZEN`, `Escape`, `TVKeys.IME_DONE`, or `TVKeys.IME_CANCEL` while editing calls `inputRef.current?.blur()` and restores focus to `#search-query-input` without calling `onNavigateToSidebar`.
- Initialize `[query, setQuery]` and `[activeFilter, setActiveFilter]` from `getSavedSearchState()`, syncing changes back via `setSavedSearchState({ query, filter: activeFilter })`.
- Debounce `fetchSearchResults` by `220ms` when `query` changes (and fetch immediately with `0ms` delay when `activeFilter`, `refreshKey`, or `retryNonce` changes while `query.trim()` is non-empty!), aborting previous `AbortController` on cleanup.
- Include a `SearchFocusBridge` (matching `PlaylistsFocusBridge` in `PlaylistsView.tsx`) so entering `SearchView` places initial focus on `'search-key-a'` when not on sidebar and no modal is open, AND ensure if results update/shrink while a `search-card-*` was focused that no longer exists, focus anchors safely on `results[0]` or `search-filter-${activeFilter}`!
- Sync `setFocusedId(targetId)` AND `document.getElementById(targetId)?.focus({ preventScroll: true })` (wrapped in `try/catch` fallback `.focus()`) in the capture-phase D-pad router so `document.activeElement` and `FocusContext` stay 100% synchronized.
- Zero `gap-*` classes anywhere in JSX or comments (`mr-*`, `mb-*`, `ml-*`, and inline `gridGap: '24px'` on the 4-col CSS Grid).

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/screens/SearchView.tsx) && npx vitest run tests/screens/SearchView.test.tsx && npx tsc -b`
Expected: PASS (100% green, 0 `gap-*` matches, `tsc -b` exit 0).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/screens/SearchView.tsx tests/screens/SearchView.test.tsx
git commit -m "feat(search): implement split TV SearchView with D-pad keyboard, IME input, and filters"
```

---

### Task 3: `BrowseScreen` Sidebar Search Tab, Virtual-View Focus Bridge & `App.tsx` Session Reset (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/screens/BrowseScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/screens/BrowseScreen.test.tsx`
- Modify: `tests/App.test.tsx`

**Interfaces:**
- Consumes: `SearchView`, `isSearchContentNodeId`, `isSearchLeftmostNodeId`, `getFirstSearchFocusableId` from `src/screens/SearchView.tsx`; `resetSavedSearchState` from `src/api/search.ts`

- [ ] **Step 1: Write failing integration tests in `tests/screens/BrowseScreen.test.tsx` and `tests/App.test.tsx`**

1. In `tests/screens/BrowseScreen.test.tsx`:
   - Add test `renders Search sidebar tab above Playlists, mounts SearchView without fetchScreenLayout, and bridges D-pad focus between sidebar, keyboard, and results`:
     - Verifies `nav-screen-search` exists in `sidebar-items-container` right before `nav-screen-playlists` (keeping `nav-screen-home` -> `nav-screen-movies` contiguous!).
     - Activating `nav-screen-search` mounts `<SearchView />`, does **not** call `fetchScreenLayout(client, 'search')`, focuses `search-key-a` on `ArrowRight`, returns to `nav-screen-search` on `ArrowLeft` from `search-key-a` (and on `Escape`/`BACK_TIZEN` when not editing `<input>`), and blurs `<input>` without jumping to sidebar when `BACK_TIZEN` is pressed on `window` while `<input>` is focused!
2. In `tests/App.test.tsx`:
   - Add test `searches globally from BrowseScreen Search tab, opens ItemDetailModal on [OK], preserves search state across PlayerScreen, and clears search state on profile switch`:
     - Navigates to `nav-screen-search`, types query, receives mocked `/api/v1/search` items, presses `[OK]` on result card -> opens `ItemDetailModal`, plays item -> exits `PlayerScreen` -> confirms `BrowseScreen` returns to `search` tab with the query & results preserved, and confirms switching profile resets `getSavedSearchState()` to `{ query: '', filter: 'all' }`.

- [ ] **Step 2: Run Vitest on targeted tests to verify failure (RED)**

Run: `npx vitest run tests/screens/BrowseScreen.test.tsx tests/App.test.tsx -t "Search"`
Expected: FAIL (`nav-screen-search` is `null`).

- [ ] **Step 3: Wire `SearchView` into `src/screens/BrowseScreen.tsx` and `resetSavedSearchState` into `src/App.tsx`**

1. In `src/screens/BrowseScreen.tsx`:
   - Import `Search` icon from `lucide-react`, `isTextInputElement` from `../navigation/useFocusable`, and `SearchView`, `getFirstSearchFocusableId`, `isSearchContentNodeId`, `isSearchLeftmostNodeId` from `./SearchView`.
   - In `isLeftmostContentNode`: add `if (activeTab === 'search') return isSearchLeftmostNodeId(id);`.
   - In `isValidContentNode`: add `if (activeTab === 'search') return Boolean(isSearchContentNodeId(id) && (typeof document === 'undefined' || document.getElementById(id)));`.
   - In `BrowseSidebar`: render `SidebarCard` `id="nav-screen-search"` (`order={screenItems.length + 1}`, `title="Search"`, `subtitle="Movies, shows & episodes"`, `chip="/search"`, `tile={<Search className="w-6 h-6" />}`) immediately before `nav-screen-playlists` (`order={screenItems.length + 2}`) and update `nav-switch-profile` to `order={screenItems.length + 3}`.
   - Filter `'search'` alongside `'playlists'` in `displayScreens` fallback (`s.id !== 'playlists' && s.id !== 'search'`) and `targetLibId` (`activeTab !== 'home' && activeTab !== 'playlists' && activeTab !== 'search'`).
   - Preserve `'search'` in `fetchScreens` `setActiveTab((prev) => prev === 'playlists' || prev === 'search' || ...)`, initialize `loading` as `useState(initialTab !== 'playlists' && initialTab !== 'search')`, and skip `fetchScreenLayout` when `activeTab === 'search'` (mirroring `activeTab === 'playlists'` at lines `866-880`, focusing `initialFocusId` if valid for `'search'` else `getFirstSearchFocusableId()`).
   - Update Guard 1 in `BrowseScreen`'s `handleKeyDown` (`lines 944-951`) to check:
     ```ts
     const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
     if (isTextInputElement(targetEl) || isTextInputElement(activeEl)) {
       return;
     }
     ```
   - Update `ArrowRight` from sidebar (`lines 1010-1029`) to include `currentTab === 'search'` (`getFirstSearchFocusableId()`).
   - Pass `searchRefreshKey={refreshKey}` and `onNavigateToSearchSidebar={handleNavigateToSearchSidebar}` (`useCallback(() => setFocusedId('nav-screen-search'), [setFocusedId])`) into `BrowseMainContent`, and render `<SearchView />` in `BrowseMainContent` when `activeTab === 'search'`.
2. In `src/App.tsx`:
   - Import `resetSavedSearchState` from `./api/search` and invoke `resetSavedSearchState()` inside `handleUnauthorized`, `handleSwitchServer`, and `onSwitchProfile`.

- [ ] **Step 4: Run zero-gap check, full Vitest suite, `chrome69` build, and `.wgt` packaging (GREEN)**

Run:
1. `(! grep -rn "gap-" src/api/search.ts src/screens/SearchView.tsx src/screens/BrowseScreen.tsx src/App.tsx)`
2. `npm test -- --run`
3. `npm run build && npm run package:wgt -- --no-build`
Expected: 100% test suites passing, 0 `gap-*` matches, `chrome69` build green, and `kadr.wgt` signed cleanly.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/screens/BrowseScreen.tsx src/App.tsx tests/screens/BrowseScreen.test.tsx tests/App.test.tsx
git commit -m "feat(browse): integrate global Search sidebar tab and session-scoped state reset"
```
