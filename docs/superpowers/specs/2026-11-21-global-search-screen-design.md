# Sub-Project 4: Global Search Screen — Design Spec

**Date:** 2026-11-21
**Parent Roadmap:** `docs/superpowers/specs/2026-11-19-v1-milestone-roadmap.md` (Phase 4 of 7)
**Target Hardware:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69) & Web Dev Harness
**Repositories:**
- Client: `/home/boody/work/personal/kadr-tizenos`
- Server (existing API, zero backend changes): `/home/boody/work/personal/kadr` (`GET /api/v1/search`)

---

## 1. Purpose & Problem Statement

`kadr-server` already exposes an authenticated, privacy-aware SQLite FTS5 BM25 global search endpoint (`GET /api/v1/search?q=...&item_type=...&library_id=...&limit=...`), yet `kadr-tizenos` currently offers no search screen—requiring TV users to browse library carousels or folder hierarchies manually to find a movie, series, episode, anime, music album/track, or audiobook.

Sub-Project 4 introduces a dedicated **Global Search** sidebar tab (`activeTab === 'search'`, `<SearchView />`) tailored for Samsung's 5-button One Remote while also supporting native Samsung Tizen IME (Arabic & multi-language), SmartThings mobile keyboard, and USB keyboards.

---

## 2. Approved UX & Scope Decisions

1. **Split TV Search Layout (Netflix/YouTube Living-Room Pattern):**
   - **Left Column (`w-[420px] shrink-0`):**
     - Focusable native `<input type="text" dir="auto">` (`search-query-input`) for Samsung Tizen IME (Arabic & multi-language), SmartThings mobile typing, or physical keyboards.
     - Utility action row: `Space` (`search-action-space`), `⌫` (`search-action-backspace`), `Clear` (`search-action-clear`).
     - Fast `6×6` alphanumeric D-pad keyboard grid (`A–Z` + `0–9`, `search-key-a` .. `search-key-9`) for instant 1-thumb typing without triggering a blocking system IME popup.
   - **Right Column (`flex-1 min-w-0`):**
     - Media-type filter pill strip: `All`, `Movies`, `TV Shows`, `Episodes`, `Anime`, `Music`, `Audiobooks`, `Live`.
     - Live `220ms` debounced `4`-column results grid (`search-card-{id}`) with empty-query discovery hints, loading indicator, no-results state (with quick `"Reset Filter to All"` button when a non-`all` filter is active), and error retry state.
2. **Search Result Selection:**
   - Pressing **`[OK]` (`Enter`)** on any search result card (`search-card-{id}`) calls `onSelectItem(item.id)` to open `ItemDetailModal` (matching Browse carousels/grids so *Resume*, *Play from Beginning*, *Mark Watched*, *Browse Folder*, and *Add to Playlist* are all available).
   - Pressing the physical **`Play` (`TVKeys.PLAY` / `MediaPlay`)** remote key while focused on a search result card instant-plays directly into `PlayerScreen` (`onPlayItem(item.id, resumeSentinel, item.title)`).

---

## 3. Architecture & Component Design

### 3.1 Search Types & API Client (`src/types/kadr.ts` & `src/api/search.ts`)

1. **Types (`src/types/kadr.ts`):**
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
2. **Client Helper (`src/api/search.ts`):**
   - `export const DEFAULT_TV_SEARCH_LIMIT = 48;`
   - `export async function fetchSearchResults(client: ApiClient, options: { q: string; itemType?: SearchFilterType; limit?: number; signal?: AbortSignal }): Promise<SearchResponse>`:
     - If `options.q.trim().length === 0`, resolves `{ query: '', total: 0, items: [] }` immediately with zero network requests.
     - Builds `URLSearchParams` with `q: options.q.trim()`, `limit: String(options.limit ?? DEFAULT_TV_SEARCH_LIMIT)`, and `item_type: options.itemType` when `options.itemType && options.itemType !== 'all'`.
     - Calls `client.fetch<SearchResponse>(\`/api/v1/search?\${params.toString()}\`, { signal: options.signal })` (automatically attaching `Authorization` + `X-Kadr-Unlocked` headers and triggering `App.tsx`'s centralized `401` handler on session expiry).
3. **In-Memory Session State Helper (`src/api/search.ts` or `src/screens/SearchView.tsx`):**
   - `getSavedSearchState(): { query: string; filter: SearchFilterType }`
   - `setSavedSearchState(state: { query: string; filter: SearchFilterType }): void`
   - `resetSavedSearchState(): void`
   - Preserves the active query and filter across `view === 'player'` unmounts while clearing cleanly on profile switch, server switch, or `401` session expiry in `src/App.tsx`.

### 3.2 `<SearchView />` Component & Deterministic 5-Button D-Pad Matrix (`src/screens/SearchView.tsx`)

1. **Props:**
   ```ts
   export interface SearchViewProps {
     client: ApiClient;
     serverUrl: string;
     token?: string;
     refreshKey?: number;
     onSelectItem: (itemId: number | string) => void;
     onPlayItem: (
       itemId: number | string,
       resumeMs?: number,
       title?: string
     ) => void;
     onNavigateToSidebar?: () => void;
   }
   ```
2. **Debounced FTS5 Query & `AbortController` Lifecycle:**
   - When `query.trim()` is empty: cancels any pending timer/request, clears `results` to `[]`, `total` to `0`, `loading` to `false`, and `error` to `null`.
   - When `query.trim()` is non-empty: debounces by `220ms` (`0ms` immediate fetch when only `activeFilter`, `refreshKey`, or `retryNonce` changes for an already non-empty query!), aborts any in-flight `AbortController`, and calls `fetchSearchResults`. Ignores `AbortError` silently.
3. **Left Pane (`w-[420px] shrink-0 mr-10` — Zero `gap-*`):**
   - **Focusable Input Bar (`id="search-query-input"`):**
     - Registered with `useFocusable` (`id: 'search-query-input'`, `groupId: 'search-content'`).
     - Tracks `isEditingInput` (`document.activeElement === inputRef.current`):
       - Pressing `[OK]` (`Enter`) when focused on `search-query-input` focuses the underlying `<input>` element (`inputRef.current?.focus()`) to invoke Samsung Tizen's native IME (supporting Arabic and all languages).
       - While `isEditingInput === true`: `Backspace` edits text normally; `ArrowLeft`/`ArrowRight` move the text cursor; `TVKeys.IME_DONE` (`65376`), `TVKeys.IME_CANCEL` (`65385`), `TVKeys.BACK_TIZEN` (`10009`), `Escape`, or `ArrowDown` blurs the `<input>` (`inputRef.current?.blur()`) and keeps TV focus inside `SearchView` (`ArrowDown` moves to `search-action-space`; `Back`/`Escape` exits IME back to TV focus on `search-query-input` without jumping to the sidebar!).
   - **Utility Row (`mb-3`):**
     - 3 buttons with explicit `mr-2.5 last:mr-0`:
       - `search-action-space` (`Space` — appends `' '` when `query.length > 0 && !query.endsWith(' ')`)
       - `search-action-backspace` (`⌫` — removes last code point via `Array.from(prev).slice(0, -1).join('')` so surrogate pairs / emoji / multi-byte characters slice cleanly!)
       - `search-action-clear` (`Clear` — resets `query` to `''`)
   - **`6×6` Alphanumeric Grid:**
     - Keys `['a'..'z', '0'..'9']` (`36` keys, 6 rows × 6 columns), IDs `search-key-${ch}`, explicit `mr-2 mb-2` (`mr-0` on col `5`), appending `ch` to `query`.
4. **Right Pane (`flex-1 min-w-0 flex flex-col` — Zero `gap-*`):**
   - **Filter Pills (`mb-6`):**
     - `SEARCH_FILTERS`: `all` (`All`), `movie` (`Movies`), `show` (`TV Shows`), `episode` (`Episodes`), `anime` (`Anime`), `music` (`Music`), `audiobook` (`Audiobooks`), `live_channel` (`Live`).
     - IDs `search-filter-${filter.value}`, explicit `mr-3 last:mr-0`. Selecting a filter updates `activeFilter` immediately.
   - **Results Grid (`4` columns, explicit `gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'`, `gridGap: '24px'`, zero Tailwind `gap-*` classes):**
     - Card ID `search-card-${item.id}` (`data-search-col={String(idx % 4)}`).
     - Artwork URL via `getAuthenticatedImageUrl(serverUrl, item.poster_url, token, unlockTokens)` with fallback initial tile on image error (`onError`).
     - Badges:
       - Top-left type tag: `SxxExx` for episodes (when `season`/`episode` present, else `EPISODE`), or uppercase type (`MOVIE`, `SHOW`, `ANIME`, `MUSIC`, `BOOK`, `LIVE`, `VIDEO`).
       - Top-right status badge: `WATCHED` when `(item.playback_progress ?? 0) >= 0.9`, else `item.badge` (`RESUME`, `NEW`, `4K`).
       - Bottom progress track when `(item.playback_progress ?? 0) > 0`.
     - Metadata footer: `<h3 dir="auto">` title + subtitle (`series_title` for episodes, else `release_year • library_name`).
     - Actions:
       - `[OK]` (`Enter`) / click -> `onSelectItem(item.id)`.
       - Physical `Play` (`TVKeys.PLAY` / `e.key === 'MediaPlay'`) -> `onPlayItem(item.id, item.item_type === 'live_channel' ? 0 : toResumePercentageSentinel(item.playback_progress ?? undefined), item.title)`.
   - **Empty / Error States:**
     - Empty query: discovery card explaining search scope (`Titles, TV Episodes, Directors & Genres`).
     - No matches with `activeFilter !== 'all'`: renders focusable `search-reset-filter-btn` (`"Show All Categories"`) resetting `activeFilter` to `'all'`.
     - Network error: renders focusable `search-retry-btn` (`"Retry Search"`).
5. **Deterministic Intra- & Cross-Zone D-Pad Navigation (`capture: true` listener in `SearchView`):**
   - Inactive whenever `isAnyModalActive(activeTrap)` is true (`ItemDetailModal`, `PinPadModal`, `ExitConfirmModal`, etc.) or when `isEditingInput` handles text editing.
   - Tracks `lastKeyboardFocusIdRef` (default `'search-key-a'`, updated whenever focus is on `search-query-input`, `search-action-*`, or `search-key-*`).
   - **Left Pane internal & boundary routing:**
     - `search-query-input`: `ArrowDown` -> `search-action-space`; `ArrowLeft` -> sidebar (`onNavigateToSidebar`); `ArrowRight` -> Right Pane entry (`firstResultCardId ?? \`search-filter-\${activeFilter}\``).
     - `search-action-*` (`[space, backspace, clear]`): `ArrowLeft`/`ArrowRight` steps across the 3 buttons (`ArrowLeft` on `space` -> sidebar; `ArrowRight` on `clear` -> Right Pane entry); `ArrowUp` -> `search-query-input`; `ArrowDown` -> top row of `6×6` grid (`col 0, 2, 4`).
     - `search-key-*` (`row 0..5, col 0..5`):
       - `ArrowLeft`: `col > 0` -> `row * 6 + (col - 1)`; `col === 0` -> sidebar (`onNavigateToSidebar`).
       - `ArrowRight`: `col < 5` -> `row * 6 + (col + 1)`; `col === 5` -> Right Pane entry (`firstResultCardId ?? \`search-filter-\${activeFilter}\``).
       - `ArrowUp`: `row > 0` -> `(row - 1) * 6 + col`; `row === 0` -> `search-action-${col < 2 ? 'space' : col < 4 ? 'backspace' : 'clear'}`.
       - `ArrowDown`: `row < 5` -> `(row + 1) * 6 + col` (clamped at `row === 5`).
   - **Right Pane internal & boundary routing:**
     - `search-filter-*` (`idx 0..7`):
       - `ArrowLeft`: `idx > 0` -> `idx - 1`; `idx === 0` -> `lastKeyboardFocusIdRef.current`.
       - `ArrowRight`: `idx < 7` -> `idx + 1` (clamped at right end).
       - `ArrowDown`: `firstResultCardId` if results exist, else `search-reset-filter-btn` / `search-retry-btn` if rendered.
     - `search-card-*` (`idx 0..N-1`, `4` columns):
       - `ArrowLeft`: `idx % 4 > 0` -> `results[idx - 1]`; `idx % 4 === 0` -> `lastKeyboardFocusIdRef.current`!
       - `ArrowRight`: `idx % 4 < 3 && idx + 1 < results.length` -> `results[idx + 1]` (clamped at row right edge).
       - `ArrowUp`: `idx >= 4` -> `results[idx - 4]`; `idx < 4` -> `search-filter-${activeFilter}`.
       - `ArrowDown`: `idx + 4 < results.length` -> `results[idx + 4]` (or `results[results.length - 1]` when moving down into a partial final row!).
     - `search-reset-filter-btn` / `search-retry-btn`:
       - `ArrowLeft` -> `lastKeyboardFocusIdRef.current`; `ArrowUp` -> `search-filter-${activeFilter}`.

### 3.3 `BrowseScreen.tsx` & `App.tsx` Integration

1. **`src/screens/BrowseScreen.tsx`:**
   - Render `SidebarCard` `id="nav-screen-search"` (`order={screenItems.length + 1}`, `Search` icon from `lucide-react`, `title="Search"`, `subtitle="Movies, shows & episodes"`, `chip="/search"`) immediately above `nav-screen-playlists` (`order={screenItems.length + 2}`) and `nav-switch-profile` (`order={screenItems.length + 3}`).
   - Treat `activeTab === 'search'` as a virtual view alongside `'playlists'`:
     - Skip `fetchScreenLayout` when `activeTab === 'search'`.
     - `getFirstSearchFocusableId()` returns `'search-key-a'` (if mounted) or `'search-query-input'`.
     - `isValidContentNode(id, layout, 'search')` recognizes `search-query-input`, `search-action-*`, `search-key-*`, `search-filter-*`, `search-card-*`, `search-reset-filter-btn`, and `search-retry-btn` (verifying `document.getElementById(id)` exists).
     - Note: because `SearchView`'s capture-phase handler routes `ArrowLeft` from `search-card-*` (`col 0`) and `search-filter-all` back to `lastKeyboardFocusIdRef`, `isLeftmostContentNode(id, layout, 'search')` returns `true` **only** for the leftmost column of the Left Pane (`search-query-input`, `search-action-space`, and `search-key-*` at `col === 0`).
     - Also extend `BrowseScreen.tsx` Guard 1 to check `isTextInputElement(targetEl) || (typeof document !== 'undefined' && isTextInputElement(document.activeElement))` so `window`-targeted `BACK_TIZEN` / `Escape` events while `<input>` is focused are handled by `SearchView`'s input-blur handler rather than jumping straight to the sidebar.
   - Render `<SearchView />` inside `BrowseMainContent` when `activeTab === 'search'`, passing `refreshKey`, `onSelectItem`, `onPlayItem`, and `onNavigateToSidebar={() => setFocusedId('nav-screen-search')}`.
2. **`src/App.tsx`:**
   - Call `resetSavedSearchState()` inside `handleUnauthorized`, `handleSwitchServer`, and manual `onSwitchProfile` so search queries never carry across user profiles or servers.

---

## 4. Platform Invariants & Error Handling

- **Chromium 69 / Tizen 5.5 CSS Safety:** Zero flex `gap-*` classes anywhere in `SearchView.tsx`, `BrowseScreen.tsx`, or `App.tsx` (CSS Grid uses inline `gridGap: '24px'`, matching `PlaylistsView.tsx`).
- **AVPlay Hardware Plane Transparency:** `BrowseScreen` (and `<SearchView />` inside it) remains completely unmounted whenever `view === 'player'`, while `savedSearchState` + `App.tsx`'s `activeBrowseTab` / `lastBrowseFocusId` seamlessly restore the search session upon player exit.
- **Strict Layered Back Navigation:**
  1. Editing `<input>` (`search-query-input` active) -> `Back` blurs `<input>`, keeping focus on `search-query-input`.
  2. Focused anywhere in `<SearchView />` -> `Back` moves focus to sidebar `nav-screen-search`.
  3. Focused on `nav-screen-search` -> `Back` opens `<ExitConfirmModal>`.
- **RTL & International Titles:** Both `<input dir="auto">` and result card titles `<h3 dir="auto">` render Arabic and mixed-script titles cleanly.

---

## 5. Testing & Verification Strategy

1. **API & Session State Unit Tests (`tests/api/search.test.ts`):**
   - Empty/whitespace query short-circuits without calling `fetch`.
   - Encodes `q`, `limit=48`, and `item_type` (omitting `item_type` for `'all'`), forwards `AbortSignal`, and persists/resets `savedSearchState`.
2. **`SearchView` Component & D-Pad Matrix Tests (`tests/screens/SearchView.test.tsx`):**
   - Zero `gap-*` classes across all states (idle, loading, results, empty, error).
   - Typing via `search-key-*`, `Space`, `⌫` (including multi-byte/emoji characters), and `Clear` triggers debounced `fetchSearchResults` and aborts superseded requests.
   - Native `<input>` IME flow: `Enter` focuses `<input>`, `Backspace` edits text without leaving `SearchView`, `IME_DONE` / `BACK_TIZEN` blurs `<input>` without jumping to sidebar.
   - Cross-zone D-pad navigation: Keyboard `col 5` `ArrowRight` -> Results card `0` -> `ArrowLeft` returns to last keyboard key -> `col 0` `ArrowLeft` calls `onNavigateToSidebar`; `ArrowUp` from top result row focuses active filter pill; switching filter re-queries immediately.
   - `[OK]` (`Enter`) on a result card calls `onSelectItem(id)`, while `TVKeys.PLAY` calls `onPlayItem(id, resumeSentinel, title)`.
3. **`BrowseScreen` & `App` Integration Tests (`tests/screens/BrowseScreen.test.tsx` & `tests/App.test.tsx`):**
   - `nav-screen-search` renders in sidebar without invoking `fetchScreenLayout('search')`, bridges `ArrowRight` / `ArrowLeft` / `Back` cleanly, opens `ItemDetailModal` from a search result, preserves query/filter across player round-trip, and resets `savedSearchState` on profile switch / `401`.
4. **Full Suite + Build + `.wgt` Verification:**
   - Zero `gap-*` check, `npm test -- --run`, `npm run build`, and `npm run package:wgt -- --no-build`.
