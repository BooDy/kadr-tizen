# Sub-Project 6: Large-Folder & Season Row Virtualization — Design Spec

**Date:** 2026-11-22
**Parent Roadmap:** `docs/superpowers/specs/2026-11-19-v1-milestone-roadmap.md` (Phase 6 of 7)
**Target Hardware:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69, 1.5 GHz quad-core Cortex-A53) & Web Dev Harness
**Repositories:**
- Client: `/home/boody/work/personal/kadr-tizenos`
- Server (no backend changes): `/home/boody/work/personal/kadr`

---

## 1. Purpose & Problem Statement

`FocusContext.tsx` resolves directional D-pad moves by scanning registered `useFocusable` nodes and measuring `getBoundingClientRect()`. When a library grid, folder listing, or long-running anime/show season mounts hundreds of cards simultaneously:
1. **Large Folders (`FolderBrowserModal.tsx`):** Opening a home-video, music, or photo directory with `200–1,000+` entries mounts every `6`-column row into the DOM at once, causing slow initial opens and `100–250ms` layout reflows per remote press on Tizen hardware.
2. **Long-Running Seasons (`ItemDetailModal.tsx`):** Seasons with `100–1,000+` episodes (e.g., *One Piece*, *Detective Conan*, *Naruto*) mount every `EpisodeLandscapeCard` horizontally at once and require hundreds of repeated `ArrowRight` presses to reach later episodes.
3. **Large Library Tabs (`CatalogGridWidget.tsx`):** Library screens with `200+` movies/series mount every `TVCard` simultaneously (and still carry legacy Tailwind `gap-6` classes unsafe on Chromium 69).

Sub-Project 6 introduces a zero-dependency, `FocusContext`-safe **Focus-Anchored + Scroll-Synchronized Windowing Engine** (`src/utils/virtualWindow.ts`) across `FolderBrowserModal`, `ItemDetailModal`, and `CatalogGridWidget`, paired with **Episode Range Pills (`1–50`, `51–100`, ...)** and **`FF`/`REW` `±10`-Episode Fast Skip** for long seasons.

---

## 2. Approved UX & Scope Decisions

1. **Shared Vertical Row Windowing (`FolderBrowserModal` + `CatalogGridWidget`):**
   - Grids with `<= 48` items (`8` rows at `6` columns) bypass windowing so small folders and libraries incur zero overhead and preserve exact DOM output.
   - Grids with `> 48` items mount only the active/visible row window plus `±3` overscan rows (`~10–12` rows / `~60–72` cards max regardless of whether the collection has `200` or `2,000` items), maintaining exact `paddingTop` and `paddingBottom` spacers.
   - Also replace `CatalogGridWidget.tsx`'s legacy Tailwind `gap-6` classes with explicit inline `gridGap: '24px'` for Chromium 69 layout compatibility.
2. **Long-Season Horizontal Windowing + Range Jump Pills & `FF`/`REW` `±10` Skip (`ItemDetailModal`):**
   - Seasons with `<= 30` episodes render un-windowed with no extra range bar.
   - Seasons with `> 30` episodes:
     - Horizontally window `EpisodeLandscapeCard`s (`~21` mounted cards: `activeIndex ± 10`) with exact `paddingLeft` and `paddingRight` spacers.
     - Render compact **Episode Range Pills** (`1–50`, `51–100`, `101–150`, ..., `episode-range-pill-{startIndex}`) between the Season header row and the episode strip so users can jump across hundreds of episodes in 1–2 clicks.
     - Support **`FF` / `REW` (`TVKeys.FAST_FORWARD` / `TVKeys.REWIND`)** while focused in the episode strip (or range pills) to jump `±10` episodes instantly, while keeping `CH_UP` / `CH_DOWN` dedicated to switching seasons.

---

## 3. Architecture & Component Design

### 3.1 Pure Windowing Math & React Hooks (`src/utils/virtualWindow.ts`)

1. **Constants & Pure Calculators:**
   - `export const VIRTUAL_GRID_ITEM_THRESHOLD = 48;`
   - `export const VIRTUAL_EPISODE_THRESHOLD = 30;`
   - `export const EPISODE_RANGE_SIZE = 50;`
   - `export interface VirtualRowWindow { isVirtualized: boolean; startRow: number; endRow: number; startIndex: number; endIndex: number; topSpacerPx: number; bottomSpacerPx: number; totalHeightPx: number; }`
   - `export function computeVirtualRowWindow(params: { totalItems: number; columns: number; rowHeightPx: number; rowSpacingPx: number; viewportHeightPx: number; scrollTopPx: number; anchorRow?: number | null; overscanRows?: number; thresholdItems?: number }): VirtualRowWindow`:
     - When `totalItems <= (thresholdItems ?? VIRTUAL_GRID_ITEM_THRESHOLD)` or `totalRows <= visibleRows + overscan * 2`: returns `{ isVirtualized: false, startRow: 0, endRow: totalRows - 1, startIndex: 0, endIndex: totalItems, topSpacerPx: 0, bottomSpacerPx: 0, totalHeightPx }`.
     - Computes scroll-visible rows `[scrollFirstRow, scrollLastRow]` from `scrollTopPx` and `viewportHeightPx` (defaulting `viewportHeightPx` to `760` when `<= 0` in JSDOM).
     - When `anchorRow` is provided (`0 <= anchorRow < totalRows`): if `anchorRow` lies within `[scrollFirstRow - overscan, scrollLastRow + overscan]`, expands the window to include `[Math.min(scrollFirstRow, anchorRow) - overscan, Math.max(scrollLastRow, anchorRow) + overscan]`; if `anchorRow` jumped outside the scroll viewport (e.g., `CH_DOWN`, `initialFocusId`, or JSDOM where `scrollTop` stays `0`), centers a `visibleRows + overscan * 2` window around `anchorRow`!
     - Computes exact `topSpacerPx = startRow * rowStride` and `bottomSpacerPx = Math.max(0, (totalRows - 1 - endRow) * rowStride)` (`rowStride = rowHeightPx + rowSpacingPx`).
   - `export interface VirtualHorizontalWindow { isVirtualized: boolean; startIndex: number; endIndex: number; leftSpacerPx: number; rightSpacerPx: number; }`
   - `export function computeVirtualHorizontalWindow(params: { totalItems: number; itemWidthPx: number; itemSpacingPx: number; viewportWidthPx: number; scrollLeftPx: number; anchorIndex: number; overscanItems?: number; thresholdItems?: number }): VirtualHorizontalWindow`:
     - Returns un-virtualized full range when `totalItems <= (thresholdItems ?? VIRTUAL_EPISODE_THRESHOLD)`.
     - Centers/unions around `anchorIndex` (`overscanItems = 8`, yielding `~20–22` mounted cards) with `leftSpacerPx = startIndex * itemStride` and `rightSpacerPx = Math.max(0, (totalItems - endIndex) * itemStride)` (`itemStride = itemWidthPx + itemSpacingPx = 320 + 16 = 336px`).
   - `export interface EpisodeRangeGroup { startIndex: number; endIndex: number; label: string; }` (`label: "${firstEpNum}–${lastEpNum}"` or `"${startIndex + 1}–${endIndex + 1}"` using 1-based ordinal labels `1–50`, `51–100` so seasons with non-contiguous or multi-season episode numbering always display unambiguous range labels).

2. **`FocusContext` Trap-Safe Jump Handoff (`useDeferredWindowFocus`):**
   - In `FocusContext.tsx:352-361`, when a modal trap is active (`folder-browser-modal` or `item-detail-modal`), if `setFocusedId(targetId)` is called *before* `targetId`'s DOM element has registered in `nodesRef`, the first newly mounted card in the shifted window calls `registerNode` while `!nodesRef.get(targetId)` and hijacks focus onto itself!
   - To guarantee 100% deterministic jumps across unmounted rows/cards:
     - Single-step D-pad moves (`ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`) always land on an **already-mounted** overscan card (`±3` rows / `±8` cards), so `document.getElementById(targetId)` already exists -> `setFocusedId(targetId)` runs immediately in the same event!
     - Long jumps (`CH_UP`/`CH_DOWN` `±5` rows, Episode Range Pill `[OK]`, `FF`/`REW` `±10` episodes, or `initialFocusId` on deep items):
       - If `document.getElementById(targetId)` is already mounted: `setFocusedId(targetId)` runs immediately and scrolls container smoothly into view.
       - If `document.getElementById(targetId)` is **not** mounted yet: update the window's `anchorIndex` state, set container `scrollTop` / `scrollLeft` to the target's exact pixel offset, store `pendingFocusIdRef.current = targetId`, and inside `useLayoutEffect` (which fires after all child `useFocusable` callback refs in the newly rendered window have registered in `nodesRef`!), call `setFocusedId(targetId)` + `document.getElementById(targetId)?.focus({ preventScroll: true })` and clear `pendingFocusIdRef`!

### 3.2 `FolderBrowserModal.tsx` Virtualized Sections

- Each of the 3 grid sections (`directories` `rowHeight=96`, `items` `rowHeight=364`, `images` `rowHeight=216`, `columns=6`, `rowSpacing=24`) computes its own `VirtualRowWindow` from:
  - `[data-folder-scroll-container="true"]` `scrollTop` (minus section offsetTop when available) + `viewportHeight`, AND
  - `anchorRow` derived from the active/pending target ID in that section (`folder-dir-{idx}`, `folder-item-{item.id}`, `folder-image-{idx}`), seeded on open from `initialFocusItemId` / `lastFocusedItemIdRef` so returning from `PlayerScreen` or `ItemDetailModal` to item `#300` mounts Row `50` on the very first render!
- `validNodeIds` and `contentRows` continue to include **all** logical items in the folder (`O(N)` lightweight string IDs in memory, `< 0.1ms` for `2,000` items), so:
  - `isValidNode` / `lastFocusedItemIdRef` never discards a valid folder item ID, and
  - `CH_UP` / `CH_DOWN` (`±5` rows) computes `nextId` across the full `contentRows` table, triggering the two-phase `anchorRow` + `useLayoutEffect` focus commit whenever `nextId` is not yet mounted in DOM!
- Render each virtualized section's `<div className="grid grid-cols-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gridGap: '24px', paddingTop: `${win.topSpacerPx}px`, paddingBottom: `${win.bottomSpacerPx}px` }}>` containing only `slice(win.startIndex, win.endIndex)`.

### 3.3 `ItemDetailModal.tsx` Windowed Episode Strip, Range Pills & `FF`/`REW` Skip

1. **Initial Active Episode Seeding:**
   - Initialize `activeEpisodeId` (and reset on `seasonScopeKey` change) by checking:
     1. If `initialFocusedId?.startsWith('episode-card-')` matches an episode in `visibleSeasonEpisodes`, use that episode's `id`!
     2. Else if `nextEpisode` belongs to `selectedSeason`, use `nextEpisode.id`.
     3. Else `visibleSeasonEpisodes[0]?.id ?? null`.
   - This guarantees returning from `PlayerScreen` with `initialFocusedId="episode-card-250"` mounts the horizontal window centered on Episode `250` on frame 1!
2. **Horizontal Strip Windowing (`> 30` episodes):**
   - `activeEpisodeIndex = Math.max(0, visibleSeasonEpisodes.findIndex(e => String(e.id) === String(activeEpisode?.id)))`.
   - `epWindow = computeVirtualHorizontalWindow({ totalItems: visibleSeasonEpisodes.length, itemWidthPx: 320, itemSpacingPx: 16, viewportWidthPx: stripWidth, scrollLeftPx: stripScrollLeft, anchorIndex: pendingEpisodeIndex ?? activeEpisodeIndex, overscanItems: 8, thresholdItems: 30 })`.
   - Render `visibleSeasonEpisodes.slice(epWindow.startIndex, epWindow.endIndex)` inside `<div ref={episodeStripRef} onScroll={...} className="flex overflow-x-auto pb-3 pt-2 scrollbar-none" style={{ paddingLeft: `${epWindow.leftSpacerPx}px`, paddingRight: `${epWindow.rightSpacerPx}px` }}>`.
   - Deterministic `ArrowLeft` / `ArrowRight` on `isEpisodeCard`: explicitly step `activeEpisodeIndex - 1` / `activeEpisodeIndex + 1` in `ItemDetailModal`'s capture-phase `keydown` handler (calling `jumpToEpisodeIndex(targetIdx)`) so holding D-pad Left/Right through `500` episodes never relies on geometric rect scanning and keeps the horizontal scroll container centered smoothly!
3. **Episode Range Pills (`visibleSeasonEpisodes.length > 30`):**
   - Group `visibleSeasonEpisodes` into chunks of `50` (`1–50`, `51–100`, ..., `id="episode-range-pill-${group.startIndex}"`, `data-testid="episode-range-pills"`).
   - Active pill highlights whichever range contains `activeEpisodeIndex`.
   - Vertical D-pad routing when `episodeRangeGroups.length > 1`:
     - `isSeasonRow` (`season-tab-*` or `season-watch-toggle-btn`) + `ArrowDown` -> focuses active `episode-range-pill-${activeRangeStart}`.
     - `isEpisodeRangePill` + `ArrowUp` -> focuses `season-tab-${selectedSeason}`.
     - `isEpisodeRangePill` + `ArrowLeft` / `ArrowRight` -> steps across `episode-range-pill-*` pills.
     - `isEpisodeRangePill` + `[OK]` (`Enter`) -> calls `jumpToEpisodeIndex(group.startIndex)` (updates `activeEpisodeId`, shifts `epWindow` + `scrollLeft`, and moves focus onto `episode-card-${ep.id}`).
     - `isEpisodeRangePill` + `ArrowDown` -> focuses `episode-card-${activeEpisode.id}`.
     - `isEpisodeCard` + `ArrowUp` -> focuses active `episode-range-pill-${activeRangeStart}` (when range pills are rendered; otherwise `season-tab-${selectedSeason}` as before!).
4. **`FF` / `REW` `±10`-Episode Skip:**
   - When focused on `isEpisodeCard` or `isEpisodeRangePill`:
     - `TVKeys.FAST_FORWARD` (`e.key === 'MediaFastForward'`) jumps to `Math.min(visibleSeasonEpisodes.length - 1, activeEpisodeIndex + 10)` and focuses that episode card.
     - `TVKeys.REWIND` (`e.key === 'MediaRewind'`) jumps to `Math.max(0, activeEpisodeIndex - 10)` and focuses that episode card.
   - Footer hint updates dynamically when `visibleSeasonEpisodes.length > 30` to display `[FF/REW] ±10 Eps`.

### 3.4 `CatalogGridWidget.tsx` Virtualized Browse Grids & Zero-`gap-*` Cleanup

- Replace `className={... gap-6 ...}` in `src/components/widgets/CatalogGridWidget.tsx` with zero-`gap-*` classes (`className="grid py-2 px-2"`) and explicit inline `style={{ display: 'grid', gridTemplateColumns: \`repeat(\${columns}, minmax(0, 1fr))\`, gridGap: '24px', paddingTop: \`\${win.topSpacerPx}px\`, paddingBottom: \`\${win.bottomSpacerPx}px\` }}` (`columns = widget.columns || 6`).
- Attach a scroll listener to the nearest scrollable ancestor (`el.closest('main')` in `BrowseScreen`) and derive `anchorRow` from `useFocusContext().focusedId` whenever `focusedId` matches `grid-${widget.id}-${itemId}`.
- Add `CH_UP` / `CH_DOWN` (`±5` rows) fast page jumping inside `CatalogGridWidget` when focused on a `grid-${widget.id}-*` card so `300+` movie/anime library tabs enjoy the same fast remote page-jumping as `FolderBrowserModal`!

---

## 4. Platform Invariants & Error Handling

- **Chromium 69 / Tizen 5.5 CSS Safety:** Zero flex/grid `gap-*` classes anywhere in `virtualWindow.ts`, `FolderBrowserModal.tsx`, `ItemDetailModal.tsx`, or `CatalogGridWidget.tsx` (verified via `! grep -rn "gap-"`).
- **Zero Regression Below Threshold:** Small folders (`<= 48` items), small libraries (`<= 48` items), and normal TV seasons (`<= 30` episodes) bypass virtualization and range pills completely, keeping existing layouts and tests 100% intact.
- **Layered Back Navigation:** Range pills and virtualized cards introduce zero new modal layers (`Back` in `ItemDetailModal` still closes `ItemDetailModal`; `Back` in `FolderBrowserModal` still ascends parent directory or closes at root; `Back` in `CatalogGridWidget` still moves focus to `BrowseScreen` sidebar).

---

## 5. Testing & Verification Strategy

1. **Windowing Math Unit Tests (`tests/utils/virtualWindow.test.ts`):**
   - Threshold bypass (`<= 48` grid items, `<= 30` episodes), overscan clamping at boundaries (`row 0`, final partial row), JSDOM `viewportHeight === 0` fallback, `anchorRow` inside vs outside `scrollTop` viewport, spacer pixel invariants (`topSpacerPx + renderedRowsHeight + bottomSpacerPx === totalHeightPx`), and `buildEpisodeRangeGroups` (`1–50`, `51–100`, `101–123`).
2. **`FolderBrowserModal` Virtualization Tests (`tests/screens/FolderBrowserModal.virtualization.test.tsx`):**
   - Renders a `240`-item (`40`-row) folder and asserts `< 90` `.folder-item-*` DOM nodes are mounted at any time (instead of `240`).
   - Verifies `CH_DOWN` repeated jumps (`row 0 -> 5 -> 10 -> 15 -> ...`) shift the mounted window and land exact `focusedId` on the target row/column without `FocusContext` trap hijacking.
   - Verifies opening with `initialFocusItemId={210}` immediately mounts the deep row and focuses `folder-item-210`.
3. **`ItemDetailModal` Long-Season Tests (`tests/screens/ItemDetailModal.virtualization.test.tsx`):**
   - Renders a `180`-episode season: asserts `< 30` `EpisodeLandscapeCard`s are mounted in DOM, `episode-range-pills` (`1–50`, `51–100`, `101–150`, `151–180`) render with zero `gap-*` classes, activating `episode-range-pill-100` jumps focus to Episode `101`, `TVKeys.FAST_FORWARD` / `TVKeys.REWIND` jumps `±10` episodes, `ArrowDown` reaches `#episode-action-strip`, and `initialFocusedId="episode-card-145"` restores focus directly onto Episode `145` on mount.
4. **`CatalogGridWidget` Virtualization & Zero-`gap-*` Tests (`tests/components/widgets/CatalogGridWidget.test.tsx`):**
   - Verifies zero `gap-*` classes, `<= 48` items un-virtualized, `180` items virtualized (`< 90` `TVCard`s mounted), focus restoration on `grid-{widgetId}-150`, and `CH_DOWN`/`CH_UP` `±5`-row jumps.
5. **Full Suite + Build + `.wgt` Verification:**
   - Zero `gap-*` grep check across all 4 files, `npm test -- --run`, `npm run build`, and `npm run package:wgt -- --no-build`.
