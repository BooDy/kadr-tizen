# Sub-Project 6: Large-Folder & Season Row Virtualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate DOM/reflow bottlenecks on `200–1,000+` item folders, library grids, and long-running TV/anime seasons on Samsung Tizen (`UA55TU7000UXEG` Cortex-A53) via focus-anchored + scroll-synchronized windowing (`src/utils/virtualWindow.ts`), Episode Range Jump Pills (`1–50`, `51–100`, ...), and `FF`/`REW` `±10`-episode fast skipping.

**Architecture:** Build pure, deterministic windowing calculators (`computeVirtualRowWindow`, `computeVirtualHorizontalWindow`, `buildEpisodeRangeGroups`) in `src/utils/virtualWindow.ts` that bypass small lists (`<= 48` grid items, `<= 30` episodes) and bound large lists to `~10–12` mounted rows or `~20` episode cards using exact CSS padding spacers plus a `useLayoutEffect` post-mount focus handoff so `FocusContext` traps never hijack focus during long jumps. Integrate across `FolderBrowserModal.tsx`, `ItemDetailModal.tsx`, and `CatalogGridWidget.tsx`.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6 (`chrome69`), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex/grid `gap-*` classes** anywhere in `src/utils/virtualWindow.ts`, `src/screens/FolderBrowserModal.tsx`, `src/screens/ItemDetailModal.tsx`, or `src/components/widgets/CatalogGridWidget.tsx` (avoid even literal `gap-` substrings in comments so `(! grep -rn "gap-" ...)` exits `0`). Use explicit physical margins (`mr-*`, `mb-*`) and inline `gridGap: '24px'`.
- **Zero Regression Below Threshold:** Grids with `<= 48` items and seasons with `<= 30` episodes MUST render un-virtualized (and without episode range pills), preserving existing layouts and unit tests verbatim.
- **`FocusContext` Trap Safety on Long Jumps:** When jumping to an item not yet mounted in the DOM (`CH_UP`/`CH_DOWN` `±5` rows, Episode Range Pill `[OK]`, `FF`/`REW` `±10` skip, or `initialFocusId` restoration), update the window anchor state first and commit `setFocusedId(targetId)` inside `useLayoutEffect` **after** child `useFocusable` callback refs have registered in `FocusContext`, preventing `FocusContext.tsx:360` from snapping focus onto the first mounted card of the shifted window.
- Give `EpisodeRangePill` `groupId="item-detail-episode-ranges"` (matching `nodeGroupId.startsWith('item-detail-')` in `FocusContext.tsx:61`) so `item-detail-modal` trap validation accepts range pills natively.

---

### Task 1: Pure Virtual Window Calculators & Episode Range Builders (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Create: `src/utils/virtualWindow.ts`
- Create: `tests/utils/virtualWindow.test.ts`

**Interfaces:**
- Produces:
  - `export const VIRTUAL_GRID_ITEM_THRESHOLD = 48;`
  - `export const VIRTUAL_EPISODE_THRESHOLD = 30;`
  - `export const EPISODE_RANGE_SIZE = 50;`
  - `export const DEFAULT_GRID_VIEWPORT_HEIGHT_PX = 760;`
  - `export const DEFAULT_STRIP_VIEWPORT_WIDTH_PX = 1760;`
  - `export interface VirtualRowWindowParams { totalItems: number; columns: number; rowHeightPx: number; rowSpacingPx: number; viewportHeightPx?: number; scrollTopPx?: number; anchorRow?: number | null; overscanRows?: number; thresholdItems?: number; }`
  - `export interface VirtualRowWindow { isVirtualized: boolean; totalRows: number; startRow: number; endRow: number; startIndex: number; endIndex: number; topSpacerPx: number; bottomSpacerPx: number; totalHeightPx: number; }`
  - `export function computeVirtualRowWindow(params: VirtualRowWindowParams): VirtualRowWindow`
  - `export interface VirtualHorizontalWindowParams { totalItems: number; itemWidthPx: number; itemSpacingPx: number; viewportWidthPx?: number; scrollLeftPx?: number; anchorIndex?: number | null; overscanItems?: number; thresholdItems?: number; }`
  - `export interface VirtualHorizontalWindow { isVirtualized: boolean; startIndex: number; endIndex: number; leftSpacerPx: number; rightSpacerPx: number; totalWidthPx: number; }`
  - `export function computeVirtualHorizontalWindow(params: VirtualHorizontalWindowParams): VirtualHorizontalWindow`
  - `export interface EpisodeRangeGroup { startIndex: number; endIndex: number; label: string; }`
  - `export function buildEpisodeRangeGroups(totalEpisodes: number, rangeSize?: number, threshold?: number): EpisodeRangeGroup[]`

- [ ] **Step 1: Write failing unit tests in `tests/utils/virtualWindow.test.ts`**

Create `tests/utils/virtualWindow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  EPISODE_RANGE_SIZE,
  VIRTUAL_EPISODE_THRESHOLD,
  VIRTUAL_GRID_ITEM_THRESHOLD,
  buildEpisodeRangeGroups,
  computeVirtualHorizontalWindow,
  computeVirtualRowWindow,
} from '../../src/utils/virtualWindow';

describe('virtualWindow calculators', () => {
  it('bypasses vertical virtualization at or below threshold (<= 48 items)', () => {
    const win = computeVirtualRowWindow({
      totalItems: VIRTUAL_GRID_ITEM_THRESHOLD,
      columns: 6,
      rowHeightPx: 364,
      rowSpacingPx: 24,
      viewportHeightPx: 760,
      scrollTopPx: 0,
    });
    expect(win.isVirtualized).toBe(false);
    expect(win.startIndex).toBe(0);
    expect(win.endIndex).toBe(48);
    expect(win.topSpacerPx).toBe(0);
    expect(win.bottomSpacerPx).toBe(0);
  });

  it('windows 300-item 6-col grid (~50 rows) with exact spacers and JSDOM 0px viewport fallback', () => {
    const win = computeVirtualRowWindow({
      totalItems: 300,
      columns: 6,
      rowHeightPx: 364,
      rowSpacingPx: 24,
      viewportHeightPx: 0, // JSDOM fallback -> 760px
      scrollTopPx: 0,
      anchorRow: 0,
      overscanRows: 3,
    });
    expect(win.isVirtualized).toBe(true);
    expect(win.totalRows).toBe(50);
    expect(win.startRow).toBe(0);
    expect(win.endIndex - win.startIndex).toBeLessThanOrEqual(72);
    const renderedRows = win.endRow - win.startRow + 1;
    const renderedHeight = renderedRows * 364 + Math.max(0, renderedRows - 1) * 24;
    expect(win.topSpacerPx + renderedHeight + win.bottomSpacerPx).toBe(win.totalHeightPx);
  });

  it('centers vertical window around deep anchorRow when anchor jumps outside scrollTop viewport', () => {
    const win = computeVirtualRowWindow({
      totalItems: 303, // 51 rows (last row partial with 3 items)
      columns: 6,
      rowHeightPx: 364,
      rowSpacingPx: 24,
      viewportHeightPx: 760,
      scrollTopPx: 0,
      anchorRow: 42,
      overscanRows: 3,
    });
    expect(win.isVirtualized).toBe(true);
    expect(win.startRow).toBeLessThanOrEqual(39);
    expect(win.endRow).toBeGreaterThanOrEqual(45);
    expect(win.startIndex).toBe(win.startRow * 6);
    expect(win.topSpacerPx).toBe(win.startRow * (364 + 24));
  });

  it('bypasses horizontal virtualization at <= 30 episodes and windows 200 episodes with exact spacers', () => {
    const small = computeVirtualHorizontalWindow({
      totalItems: VIRTUAL_EPISODE_THRESHOLD,
      itemWidthPx: 320,
      itemSpacingPx: 16,
      anchorIndex: 0,
    });
    expect(small.isVirtualized).toBe(false);
    expect(small.startIndex).toBe(0);
    expect(small.endIndex).toBe(30);

    const large = computeVirtualHorizontalWindow({
      totalItems: 200,
      itemWidthPx: 320,
      itemSpacingPx: 16,
      viewportWidthPx: 0, // JSDOM fallback
      scrollLeftPx: 0,
      anchorIndex: 120,
      overscanItems: 8,
    });
    expect(large.isVirtualized).toBe(true);
    expect(large.startIndex).toBeLessThanOrEqual(112);
    expect(large.endIndex).toBeGreaterThanOrEqual(129);
    expect(large.endIndex - large.startIndex).toBeLessThanOrEqual(28);
    const renderedCount = large.endIndex - large.startIndex;
    const renderedWidth = renderedCount * 320 + Math.max(0, renderedCount - 1) * 16;
    // Note: each mounted card except possibly final item in full list carries mr-4 (16px)
    expect(large.leftSpacerPx).toBe(large.startIndex * 336);
    expect(large.rightSpacerPx).toBe((200 - large.endIndex) * 336);
    expect(renderedWidth).toBeGreaterThan(0);
  });

  it('builds episode range pill groups (>= 2 groups) only when totalEpisodes > 30', () => {
    expect(buildEpisodeRangeGroups(30)).toEqual([]);
    expect(buildEpisodeRangeGroups(40, EPISODE_RANGE_SIZE)).toEqual([
      { startIndex: 0, endIndex: 24, label: '1–25' },
      { startIndex: 25, endIndex: 39, label: '26–40' },
    ]);
    expect(buildEpisodeRangeGroups(123, EPISODE_RANGE_SIZE)).toEqual([
      { startIndex: 0, endIndex: 49, label: '1–50' },
      { startIndex: 50, endIndex: 99, label: '51–100' },
      { startIndex: 100, endIndex: 122, label: '101–123' },
    ]);
  });
});
```

- [ ] **Step 2: Run Vitest on `tests/utils/virtualWindow.test.ts` to verify RED failure**

Run: `npx vitest run tests/utils/virtualWindow.test.ts`
Expected: FAIL (`Cannot find module '../../src/utils/virtualWindow'`).

- [ ] **Step 3: Implement `src/utils/virtualWindow.ts`**

Create `src/utils/virtualWindow.ts` implementing `computeVirtualRowWindow`, `computeVirtualHorizontalWindow`, and `buildEpisodeRangeGroups` with zero `gap-*` substrings and exact spacer math:
- `totalRows = Math.ceil(totalItems / safeColumns)`.
- `totalHeightPx = totalRows > 0 ? totalRows * rowHeightPx + Math.max(0, totalRows - 1) * rowSpacingPx : 0`.
- When `isVirtualized`:
  - `rowStride = rowHeightPx + rowSpacingPx`.
  - `visibleRows = Math.max(1, Math.ceil(effectiveViewportH / rowStride))`.
  - Compute `[scrollFirstRow, scrollLastRow]` from `scrollTopPx`.
  - If `anchorRow` is valid (`0 <= anchorRow < totalRows`):
    - If `anchorRow >= scrollFirstRow - overscan && anchorRow <= scrollLastRow + overscan`: `startRow = Math.max(0, Math.min(scrollFirstRow, anchorRow) - overscan)`, `endRow = Math.min(totalRows - 1, Math.max(scrollLastRow, anchorRow) + overscan)`.
    - Else (deep jump / JSDOM `scrollTop = 0`): center around `anchorRow`: `halfSpan = Math.ceil(visibleRows / 2) + overscan`, `startRow = Math.max(0, anchorRow - halfSpan)`, `endRow = Math.min(totalRows - 1, anchorRow + halfSpan)`.
  - `topSpacerPx = startRow * rowStride` and `bottomSpacerPx = Math.max(0, (totalRows - 1 - endRow) * rowStride)`.
- For `computeVirtualHorizontalWindow`:
  - `itemStride = itemWidthPx + itemSpacingPx`.
  - `visibleItems = Math.max(1, Math.ceil(effectiveViewportW / itemStride))`.
  - Similar scroll + `anchorIndex` union/centering with `overscanItems = 8`, `leftSpacerPx = startIndex * itemStride`, `rightSpacerPx = Math.max(0, (totalItems - endIndex) * itemStride)`.
- For `buildEpisodeRangeGroups(totalEpisodes, rangeSize = EPISODE_RANGE_SIZE, threshold = VIRTUAL_EPISODE_THRESHOLD)`:
  - When `totalEpisodes <= threshold`, return `[]`.
  - When `totalEpisodes <= rangeSize` (e.g. `31..50`), use `effectiveStep = Math.max(1, Math.floor(rangeSize / 2))` (`25`) so at least 2 jump ranges are always produced; otherwise use `rangeSize` (`50`).

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/utils/virtualWindow.ts) && npx vitest run tests/utils/virtualWindow.test.ts && npx tsc -b`
Expected: PASS (5/5 tests green, `0` `gap-*` matches, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 1**

```bash
git add src/utils/virtualWindow.ts tests/utils/virtualWindow.test.ts
git commit -m "feat(virtual-window): add focus-anchored row and horizontal strip window calculators"
```

---

### Task 2: `FolderBrowserModal` Multi-Section Row Virtualization & Trap-Safe `CH_UP`/`CH_DOWN` Jumps (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/screens/FolderBrowserModal.tsx`
- Create: `tests/screens/FolderBrowserModal.virtualization.test.tsx`

**Interfaces:**
- Consumes: `computeVirtualRowWindow`, `VIRTUAL_GRID_ITEM_THRESHOLD` from `src/utils/virtualWindow.ts`

- [ ] **Step 1: Write failing virtualization & fast-jump tests in `tests/screens/FolderBrowserModal.virtualization.test.tsx`**

Create `tests/screens/FolderBrowserModal.virtualization.test.tsx` testing:
1. Renders a `240`-item (`40`-row) folder inside `<FocusProvider>`:
   - Zero `gap-*` classes in the rendered DOM.
   - Fewer than `90` `[id^="folder-item-"]` cards are mounted in the DOM (instead of `240`), with positive `paddingBottom` spacer on the items grid.
2. Repeated `CH_DOWN` (`TVKeys.CH_DOWN`) presses from `folder-item-1` (`row 0 -> row 5 -> row 10 -> row 15 -> row 20`) shift the virtualized window and land exact `focusedId` (`data-focused="true"`) on `folder-item-31`, `folder-item-61`, `folder-item-91`, `folder-item-121` — never hijacked to the first card of the shifted window! And `CH_UP` steps cleanly back up by 5 rows!
3. Mounting `FolderBrowserModal` with `initialFocusItemId={211}` (`row 35`) immediately mounts the deep window containing `folder-item-211` and sets `data-focused="true"` on `folder-item-211` on open.
4. Also tests a `180`-photo folder (`images`) confirming `< 90` `[id^="folder-image-"]` nodes mount at once while `CH_DOWN` jumps cleanly across photo rows.

- [ ] **Step 2: Run Vitest on `tests/screens/FolderBrowserModal.virtualization.test.tsx` to verify RED failure**

Run: `npx vitest run tests/screens/FolderBrowserModal.virtualization.test.tsx`
Expected: FAIL (`240` `[id^="folder-item-"]` nodes mounted instead of `< 90`).

- [ ] **Step 3: Implement multi-section row windowing & trap-safe focus handoff in `src/screens/FolderBrowserModal.tsx`**

1. Track `scrollTop` + `viewportHeight` on `[data-folder-scroll-container="true"]` (`scrollContainerRef`) via `onScroll` (resetting to `0` on `currentPath` / `libraryId` change).
2. Track `targetFocusId` state (initialized from `initialFocusItemId !== undefined ? \`folder-item-\${initialFocusItemId}\` : null` and updated whenever `focusedId` changes inside `FolderBrowserModal` or when `CH_UP`/`CH_DOWN` / `FolderFocusBridge` targets a deep node!).
3. Compute `dirWindow`, `itemWindow`, and `imageWindow` via `computeVirtualRowWindow`:
   - `directories`: `columns = 6`, `rowHeightPx = 96`, `rowSpacingPx = 24`, `anchorRow` from `targetFocusId` / `focusedId` matching `folder-dir-{idx}`.
   - `items`: `columns = 6`, `rowHeightPx = 364`, `rowSpacingPx = 24`, `anchorRow` from `targetFocusId` / `focusedId` (or `initialFocusItemId` before first effect!) matching `folder-item-{item.id}`.
   - `images`: `columns = 6`, `rowHeightPx = 216`, `rowSpacingPx = 24`, `anchorRow` from `targetFocusId` / `focusedId` matching `folder-image-{idx}`.
4. In `FolderFocusBridge` (`CH_UP`/`CH_DOWN` and initial/self-healing focus):
   - Expose `requestNodeFocus(nextId: string)` callback from `FolderBrowserModal`:
     - Updates `lastFocusedItemIdRef.current = nextId` and `setTargetFocusId(nextId)`.
     - If `document.getElementById(nextId)` is already mounted in the DOM: calls `setFocusedId(nextId)` immediately and scrolls into view!
     - If `document.getElementById(nextId)` is **not** mounted yet (because `nextId` is outside the previous overscan window): sets `pendingWindowFocusIdRef.current = nextId`, scrolls `scrollContainerRef.current` to the target row's offset, and inside `useLayoutEffect` (after the newly sliced cards mount and call `registerNode`!) commits `setFocusedId(nextId)` + `document.getElementById(nextId)?.focus({ preventScroll: true })`!
5. Render `directories.slice(dirWindow.startIndex, dirWindow.endIndex)`, `items.slice(itemWindow.startIndex, itemWindow.endIndex)`, and `images.slice(imageWindow.startIndex, imageWindow.endIndex)` (preserving original `idx` for IDs `folder-dir-${idx}`, `dirOrders[idx]`, `itemOrders[idx]`, `folder-image-${idx}`, `imageOrders[idx]`) with `paddingTop: \`\${win.topSpacerPx}px\`` and `paddingBottom: \`\${win.bottomSpacerPx}px\`` on each grid container when `win.isVirtualized` is `true`!

- [ ] **Step 4: Run zero-gap check, targeted Vitest files, and `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/screens/FolderBrowserModal.tsx) && npx vitest run tests/screens/FolderBrowserModal.virtualization.test.tsx tests/screens/FolderBrowserModal.test.tsx && npx tsc -b`
Expected: PASS (all existing + new `FolderBrowserModal` tests green, `0` `gap-*` matches, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/screens/FolderBrowserModal.tsx tests/screens/FolderBrowserModal.virtualization.test.tsx
git commit -m "feat(folder-browser): virtualize large 6-col grids with trap-safe CH_UP/CH_DOWN jumps"
```

---

### Task 3: `ItemDetailModal` Episode Strip Windowing, Range Jump Pills & `FF`/`REW` `±10` Skip (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/screens/ItemDetailModal.tsx`
- Create: `tests/screens/ItemDetailModal.virtualization.test.tsx`

**Interfaces:**
- Consumes: `computeVirtualHorizontalWindow`, `buildEpisodeRangeGroups`, `VIRTUAL_EPISODE_THRESHOLD`, `EPISODE_RANGE_SIZE` from `src/utils/virtualWindow.ts`

- [ ] **Step 1: Write failing long-season virtualization & navigation tests in `tests/screens/ItemDetailModal.virtualization.test.tsx`**

Create `tests/screens/ItemDetailModal.virtualization.test.tsx` testing:
1. For a `20`-episode season (`<= 30`): `episode-range-pills` does **not** render, and all `20` episode cards mount un-virtualized.
2. For a `180`-episode season (`> 30`) inside `<FocusProvider>`:
   - Zero `gap-*` classes in the rendered DOM.
   - Fewer than `30` `[id^="episode-card-"]` cards are mounted in the DOM (instead of `180`).
   - `data-testid="episode-range-pills"` renders `4` focusable pills (`episode-range-pill-0` `"1–50"`, `episode-range-pill-50` `"51–100"`, `episode-range-pill-100` `"101–150"`, `episode-range-pill-150` `"151–180"`).
   - Vertical D-pad flow: `season-tab-1` -> `ArrowDown` -> `episode-range-pill-0` -> `ArrowRight` -> `episode-range-pill-50` -> `ArrowRight` -> `episode-range-pill-100` -> `[OK]` (`Enter`) jumps window & focus directly onto `episode-card-101` (`Episode 101`, index `100`) without trap hijacking!
   - From `episode-card-101`: `TVKeys.FAST_FORWARD` jumps `+10` to `episode-card-111`; `TVKeys.REWIND` jumps `-10` back to `episode-card-101`; `ArrowDown` focuses `#episode-action-strip` (`episode-action-watch-toggle`); `ArrowUp` returns to `episode-card-101`; `ArrowUp` again focuses active `episode-range-pill-100`; `ArrowUp` again focuses `season-tab-1`.
3. Mounting `ItemDetailModal` on the `180`-episode season with `initialFocusedId="episode-card-145"` mounts the window centered on Episode `145` on frame 1 and restores focus directly onto `episode-card-145`!

- [ ] **Step 2: Run Vitest on `tests/screens/ItemDetailModal.virtualization.test.tsx` to verify RED failure**

Run: `npx vitest run tests/screens/ItemDetailModal.virtualization.test.tsx`
Expected: FAIL (`180` `[id^="episode-card-"]` nodes mounted and `episode-range-pills` missing).

- [ ] **Step 3: Implement horizontal episode windowing, `EpisodeRangePill`s, and `FF`/`REW` `±10` skip in `src/screens/ItemDetailModal.tsx`**

1. **Initial `activeEpisodeId` Seeding (`lines 770-779`):**
   - Helper `resolveDefaultActiveEpisodeId(seasonEps, initialFocusedId, nextEp, seasonNum)`:
     - If `initialFocusedId?.startsWith('episode-card-')`, extract the ID suffix and return matching `ep.id` in `seasonEps` if found!
     - Else if `nextEp && nextEp.season === seasonNum`, return `nextEp.id` if present in `seasonEps`.
     - Else return `seasonEps[0]?.id ?? null`.
   - Use this on initial `useState` (keep `visibleSeasonEpisodes[0]?.id` when `initialFocusedId` is not an episode card if existing tests expect `activeEpisode` to default to `Episode 1` — specifically: prioritize `initialFocusedId` matching `episode-card-*`, else `visibleSeasonEpisodes[0]?.id ?? null` so existing Sub-Project 2 `#episode-action-strip` default tests remain 100% unchanged!).
2. **Horizontal Windowing & Post-Mount Focus Handoff:**
   - Compute `episodeRangeGroups = useMemo(() => buildEpisodeRangeGroups(visibleSeasonEpisodes.length, EPISODE_RANGE_SIZE, VIRTUAL_EPISODE_THRESHOLD), [visibleSeasonEpisodes.length])`.
   - Compute `activeEpisodeIndex = Math.max(0, visibleSeasonEpisodes.findIndex(ep => String(ep.id) === String(activeEpisode?.id)))`.
   - Track `episodeStripRef`, `stripScrollLeft`, `stripViewportWidth`, and `pendingEpisodeFocusIdRef`.
   - Compute `epWindow = computeVirtualHorizontalWindow({ totalItems: visibleSeasonEpisodes.length, itemWidthPx: 320, itemSpacingPx: 16, viewportWidthPx: stripViewportWidth, scrollLeftPx: stripScrollLeft, anchorIndex: activeEpisodeIndex, overscanItems: 8, thresholdItems: VIRTUAL_EPISODE_THRESHOLD })`.
   - Helper `jumpToEpisodeIndex(targetIdx: number)`:
     - Clamps `idx` to `0 .. visibleSeasonEpisodes.length - 1`; lets `targetEp = visibleSeasonEpisodes[idx]` and `cardId = \`episode-card-\${targetEp.id}\``.
     - Calls `setActiveEpisodeId(targetEp.id)`.
     - Scrolls `episodeStripRef.current` horizontally so `idx * 336` is comfortably centered/visible.
     - If `document.getElementById(cardId)` is already mounted: calls `focusTargetById(cardId)` immediately!
     - Else sets `pendingEpisodeFocusIdRef.current = cardId`, and `useLayoutEffect` (after the shifted window mounts `EpisodeLandscapeCard`s and registers them in `FocusContext`) calls `focusTargetById(cardId)` and clears `pendingEpisodeFocusIdRef`!
3. **`EpisodeRangePill` Bar (`episodeRangeGroups.length > 0`, Zero `gap-*`):**
   - Render `<div data-testid="episode-range-pills" className="flex items-center overflow-x-auto pb-2 mb-1 scrollbar-none">` right above the horizontal episode strip, with focusable `EpisodeRangePill` buttons (`id="episode-range-pill-${group.startIndex}"`, `groupId="item-detail-episode-ranges"`, `mr-2 last:mr-0`, active highlight when `activeEpisodeIndex >= group.startIndex && activeEpisodeIndex <= group.endIndex`, `onActivate={() => jumpToEpisodeIndex(group.startIndex)}`).
4. **D-Pad & `FF`/`REW` Routing in `ItemDetailModal`'s `handleKeyDown`:**
   - `isEpisodeRangePill = current.startsWith('episode-range-pill-') || activeDomId.startsWith('episode-range-pill-')`.
   - `activeRangeGroup = episodeRangeGroups.find(g => activeEpisodeIndex >= g.startIndex && activeEpisodeIndex <= g.endIndex) ?? episodeRangeGroups[0]`.
   - `ArrowDown`:
     - `isSeasonRow`: if `episodeRangeGroups.length > 0`, focus `episode-range-pill-${activeRangeGroup.startIndex}`; else focus `episode-card-${visibleSeasonEpisodes[0].id}`.
     - `isEpisodeRangePill`: jump/focus `episode-card-${(activeEpisode ?? visibleSeasonEpisodes[0]).id}` (via `jumpToEpisodeIndex(activeEpisodeIndex)`).
   - `ArrowUp`:
     - `isEpisodeCard`: if `episodeRangeGroups.length > 0`, focus `episode-range-pill-${activeRangeGroup.startIndex}`; else focus `season-tab-${selectedSeason}`.
     - `isEpisodeRangePill`: focus `season-tab-${selectedSeason}`.
   - `ArrowLeft` / `ArrowRight`:
     - `isEpisodeRangePill`: step across `episodeRangeGroups` (`idx - 1` / `idx + 1`).
     - `isEpisodeCard`: step deterministically via `jumpToEpisodeIndex(currentEpIdx - 1)` / `jumpToEpisodeIndex(currentEpIdx + 1)` (`e.preventDefault(); e.stopImmediatePropagation();`)!
   - `FF` / `REW` (`TVKeys.FAST_FORWARD` / `e.key === 'MediaFastForward'` and `TVKeys.REWIND` / `e.key === 'MediaRewind'`):
     - When `isEpisodeCard || isEpisodeRangePill`: `e.preventDefault(); e.stopImmediatePropagation(); jumpToEpisodeIndex(activeEpisodeIndex ± 10);`.
   - Render `[FF/REW] ±10 Eps` hint in `detail-remote-footer` when `episodeRangeGroups.length > 0`.
   - Render `visibleSeasonEpisodes.slice(epWindow.startIndex, epWindow.endIndex)` (passing true episode `index={epWindow.startIndex + offset}` to `EpisodeLandscapeCard`!) with `style={epWindow.isVirtualized ? { paddingLeft: \`\${epWindow.leftSpacerPx}px\`, paddingRight: \`\${epWindow.rightSpacerPx}px\` } : undefined}`. Note: on the very last item of the full `visibleSeasonEpisodes` (`epIndex === visibleSeasonEpisodes.length - 1`), `mr-4` is still fine or `last:mr-0` when `rightSpacerPx === 0`.

- [ ] **Step 4: Run zero-gap check, targeted Vitest files, and `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/screens/ItemDetailModal.tsx) && npx vitest run tests/screens/ItemDetailModal.virtualization.test.tsx tests/screens/ItemDetailModal.test.tsx tests/screens/ItemDetailModal.seasons.test.tsx && npx tsc -b`
Expected: PASS (all existing + new `ItemDetailModal` tests green, `0` `gap-*` matches, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 3**

```bash
git add src/screens/ItemDetailModal.tsx tests/screens/ItemDetailModal.virtualization.test.tsx
git commit -m "feat(detail-modal): window large episode strips with range pills and FF/REW ±10 skip"
```

---

### Task 4: `CatalogGridWidget` Row Virtualization, `CH_UP`/`CH_DOWN` Jumps & Zero-`gap-*` Cleanup (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/components/widgets/CatalogGridWidget.tsx`
- Create: `tests/components/widgets/CatalogGridWidget.test.tsx`

**Interfaces:**
- Consumes: `computeVirtualRowWindow`, `VIRTUAL_GRID_ITEM_THRESHOLD` from `src/utils/virtualWindow.ts`

- [ ] **Step 1: Write failing virtualization & zero-`gap-*` tests in `tests/components/widgets/CatalogGridWidget.test.tsx`**

Create `tests/components/widgets/CatalogGridWidget.test.tsx` testing:
1. Renders a `24`-item grid with **zero `gap-*` classes** anywhere in DOM (`inline gridGap: '24px'`), mounting all `24` cards un-virtualized.
2. Renders a `180`-item (`30`-row, `6`-col) grid inside `<FocusProvider>`:
   - Zero `gap-*` classes in DOM.
   - Fewer than `90` `[id^="grid-movies-"]` cards are mounted at once (instead of `180`).
   - Pressing `CH_DOWN` (`TVKeys.CH_DOWN`) from `grid-movies-1` (`row 0`) jumps `+5` rows to `grid-movies-31` (`row 5`), and pressing `CH_DOWN` again jumps to `grid-movies-61` (`row 10`), shifting the mounted window cleanly; `CH_UP` steps `-5` rows back up.
   - Pre-setting `focusedId` to `'grid-movies-151'` (`row 25`) centers the window on row `25` and mounts `grid-movies-151` immediately!

- [ ] **Step 2: Run Vitest on `tests/components/widgets/CatalogGridWidget.test.tsx` to verify RED failure**

Run: `npx vitest run tests/components/widgets/CatalogGridWidget.test.tsx`
Expected: FAIL (`gap-6` class found and `180` cards mounted).

- [ ] **Step 3: Implement row windowing, `CH_UP`/`CH_DOWN` page jumps, and zero-`gap-*` styling in `src/components/widgets/CatalogGridWidget.tsx`**

1. Remove all `gap-*` classes from `CatalogGridWidget.tsx`; use `columns = widget.columns || 6` and inline `style={{ display: 'grid', gridTemplateColumns: \`repeat(\${columns}, minmax(0, 1fr))\`, gridGap: '24px', paddingTop: win.isVirtualized ? \`\${win.topSpacerPx}px\` : undefined, paddingBottom: win.isVirtualized ? \`\${win.bottomSpacerPx}px\` : undefined }}`.
2. Read optional `FocusContext` (`useContext(FocusContext)` so standalone renders outside `FocusProvider` also work cleanly):
   - Derive `focusedItemIndex` when `focusedId` (or `targetGridItemId` state) matches `grid-${widget.id}-${item.id}`, giving `anchorRow = focusedItemIndex >= 0 ? Math.floor(focusedItemIndex / columns) : null`.
   - Attach passive `scroll` listener to `wrapperRef.current?.closest('main')` (if present) to track `scrollTop` (subtracting `wrapperRef.current.offsetTop`) and `clientHeight`.
   - Compute `win = computeVirtualRowWindow({ totalItems: items.length, columns, rowHeightPx: 384, rowSpacingPx: 24, viewportHeightPx, scrollTopPx, anchorRow, overscanRows: 3, thresholdItems: VIRTUAL_GRID_ITEM_THRESHOLD })`.
3. Add capture-phase `CH_UP` / `CH_DOWN` (`PageUp` / `PageDown`) listener active when `focusedId` belongs to `grid-${widget.id}-*` (and no modal trap is open): jumps `±5` rows (`targetRow = clamp(currentRow ± 5, 0, totalRows - 1)`, `targetIdx = Math.min(items.length - 1, targetRow * columns + currentCol)`), updating `targetGridItemId` + scrolling `<main>` + committing `setFocusedId` in `useLayoutEffect` if not yet mounted!

- [ ] **Step 4: Run zero-gap check, full Vitest suite, `chrome69` build, and `.wgt` packaging (GREEN)**

Run:
1. `(! grep -rn "gap-" src/utils/virtualWindow.ts src/screens/FolderBrowserModal.tsx src/screens/ItemDetailModal.tsx src/components/widgets/CatalogGridWidget.tsx)`
2. `npm test -- --run`
3. `npm run build && npm run package:wgt -- --no-build`
Expected: 100% test suites passing, `0` `gap-*` matches across all 4 files, `chrome69` build green, and `kadr.wgt` signed cleanly.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/components/widgets/CatalogGridWidget.tsx tests/components/widgets/CatalogGridWidget.test.tsx
git commit -m "feat(catalog-grid): virtualize large library grids, remove gap-6, and add CH_UP/CH_DOWN jumps"
```
