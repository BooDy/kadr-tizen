export const VIRTUAL_GRID_ITEM_THRESHOLD = 48;
export const VIRTUAL_EPISODE_THRESHOLD = 30;
export const EPISODE_RANGE_SIZE = 50;
export const DEFAULT_GRID_VIEWPORT_HEIGHT_PX = 760;
export const DEFAULT_STRIP_VIEWPORT_WIDTH_PX = 1760;

export interface VirtualRowWindowParams {
  totalItems: number;
  columns: number;
  rowHeightPx: number;
  rowSpacingPx: number;
  viewportHeightPx?: number;
  scrollTopPx?: number;
  anchorRow?: number | null;
  overscanRows?: number;
  thresholdItems?: number;
}

export interface VirtualRowWindow {
  isVirtualized: boolean;
  totalRows: number;
  startRow: number;
  endRow: number;
  startIndex: number;
  endIndex: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  totalHeightPx: number;
}

export interface VirtualHorizontalWindowParams {
  totalItems: number;
  itemWidthPx: number;
  itemSpacingPx: number;
  viewportWidthPx?: number;
  scrollLeftPx?: number;
  anchorIndex?: number | null;
  overscanItems?: number;
  thresholdItems?: number;
}

export interface VirtualHorizontalWindow {
  isVirtualized: boolean;
  startIndex: number;
  endIndex: number;
  leftSpacerPx: number;
  rightSpacerPx: number;
  totalWidthPx: number;
}

export interface EpisodeRangeGroup {
  startIndex: number;
  endIndex: number;
  label: string;
}

function toNonNegativeInt(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function toNonNegativeNumber(value: number | undefined, fallback = 0): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, value);
}

function normalizeAnchor(anchor: number | null | undefined, totalCount: number): number | null {
  if (anchor === null || anchor === undefined || !Number.isFinite(anchor)) {
    return null;
  }
  const index = Math.trunc(anchor);
  return index >= 0 && index < totalCount ? index : null;
}

function computeFocusedRange(
  totalCount: number,
  stride: number,
  viewportSize: number,
  scrollOffset: number,
  anchor: number | null,
  overscan: number,
): { start: number; end: number } {
  const safeStride = stride > 0 ? stride : 1;
  const visibleCount = Math.max(1, Math.ceil(viewportSize / safeStride));
  const maxIndex = totalCount - 1;
  const scrollFirst = Math.max(0, Math.min(maxIndex, Math.floor(scrollOffset / safeStride)));
  const scrollLast = Math.max(
    scrollFirst,
    Math.min(maxIndex, Math.floor((scrollOffset + Math.max(0, viewportSize - 1)) / safeStride)),
  );

  if (anchor !== null) {
    if (anchor >= scrollFirst - overscan && anchor <= scrollLast + overscan) {
      return {
        start: Math.max(0, Math.min(scrollFirst, anchor) - overscan),
        end: Math.min(maxIndex, Math.max(scrollLast, anchor) + overscan),
      };
    }
    const halfSpan = Math.ceil(visibleCount / 2) + overscan;
    return {
      start: Math.max(0, anchor - halfSpan),
      end: Math.min(maxIndex, anchor + halfSpan),
    };
  }

  return {
    start: Math.max(0, scrollFirst - overscan),
    end: Math.min(maxIndex, scrollLast + overscan),
  };
}

/**
 * Computes a focus-anchored vertical row window and spacer heights for large grid layouts.
 */
export function computeVirtualRowWindow(params: VirtualRowWindowParams): VirtualRowWindow {
  const totalItems = toNonNegativeInt(params.totalItems);
  const columns =
    Number.isFinite(params.columns) && params.columns >= 1 ? Math.floor(params.columns) : 1;
  const rowHeightPx = toNonNegativeNumber(params.rowHeightPx);
  const rowSpacingPx = toNonNegativeNumber(params.rowSpacingPx);
  const threshold = toNonNegativeInt(params.thresholdItems ?? VIRTUAL_GRID_ITEM_THRESHOLD);
  const totalRows = totalItems > 0 ? Math.ceil(totalItems / columns) : 0;
  const totalHeightPx =
    totalRows > 0 ? totalRows * rowHeightPx + Math.max(0, totalRows - 1) * rowSpacingPx : 0;

  if (totalItems === 0 || totalItems <= threshold) {
    return {
      isVirtualized: false,
      totalRows,
      startRow: 0,
      endRow: totalRows - 1,
      startIndex: 0,
      endIndex: totalItems,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      totalHeightPx,
    };
  }

  const effectiveViewportH =
    params.viewportHeightPx !== undefined &&
    Number.isFinite(params.viewportHeightPx) &&
    params.viewportHeightPx > 0
      ? params.viewportHeightPx
      : DEFAULT_GRID_VIEWPORT_HEIGHT_PX;
  const scrollTopPx = toNonNegativeNumber(params.scrollTopPx);
  const overscan = toNonNegativeInt(params.overscanRows ?? 3);
  const anchorRow = normalizeAnchor(params.anchorRow, totalRows);
  const rowStride = rowHeightPx + rowSpacingPx;

  const { start: startRow, end: endRow } = computeFocusedRange(
    totalRows,
    rowStride,
    effectiveViewportH,
    scrollTopPx,
    anchorRow,
    overscan,
  );

  return {
    isVirtualized: true,
    totalRows,
    startRow,
    endRow,
    startIndex: startRow * columns,
    endIndex: Math.min(totalItems, (endRow + 1) * columns),
    topSpacerPx: startRow * rowStride,
    bottomSpacerPx: Math.max(0, (totalRows - 1 - endRow) * rowStride),
    totalHeightPx,
  };
}

/**
 * Computes a focus-anchored horizontal window and spacer widths for large episode strips.
 */
export function computeVirtualHorizontalWindow(
  params: VirtualHorizontalWindowParams,
): VirtualHorizontalWindow {
  const totalItems = toNonNegativeInt(params.totalItems);
  const itemWidthPx = toNonNegativeNumber(params.itemWidthPx);
  const itemSpacingPx = toNonNegativeNumber(params.itemSpacingPx);
  const threshold = toNonNegativeInt(params.thresholdItems ?? VIRTUAL_EPISODE_THRESHOLD);
  const totalWidthPx =
    totalItems > 0 ? totalItems * itemWidthPx + Math.max(0, totalItems - 1) * itemSpacingPx : 0;

  if (totalItems === 0 || totalItems <= threshold) {
    return {
      isVirtualized: false,
      startIndex: 0,
      endIndex: totalItems,
      leftSpacerPx: 0,
      rightSpacerPx: 0,
      totalWidthPx,
    };
  }

  const effectiveViewportW =
    params.viewportWidthPx !== undefined &&
    Number.isFinite(params.viewportWidthPx) &&
    params.viewportWidthPx > 0
      ? params.viewportWidthPx
      : DEFAULT_STRIP_VIEWPORT_WIDTH_PX;
  const scrollLeftPx = toNonNegativeNumber(params.scrollLeftPx);
  const overscan = toNonNegativeInt(params.overscanItems ?? 8);
  const anchorIndex = normalizeAnchor(params.anchorIndex, totalItems);
  const itemStride = itemWidthPx + itemSpacingPx;

  const { start: startIndex, end: lastInclusiveIndex } = computeFocusedRange(
    totalItems,
    itemStride,
    effectiveViewportW,
    scrollLeftPx,
    anchorIndex,
    overscan,
  );
  const endIndex = lastInclusiveIndex + 1;

  return {
    isVirtualized: true,
    startIndex,
    endIndex,
    leftSpacerPx: startIndex * itemStride,
    rightSpacerPx: Math.max(0, (totalItems - endIndex) * itemStride),
    totalWidthPx,
  };
}

/**
 * Splits a large episode count into human-readable jump range pills when above threshold.
 */
export function buildEpisodeRangeGroups(
  totalEpisodes: number,
  rangeSize = EPISODE_RANGE_SIZE,
  threshold = VIRTUAL_EPISODE_THRESHOLD,
): EpisodeRangeGroup[] {
  const safeTotal = toNonNegativeInt(totalEpisodes);
  const safeThreshold = toNonNegativeInt(threshold, VIRTUAL_EPISODE_THRESHOLD);
  const safeRangeSize =
    Number.isFinite(rangeSize) && rangeSize >= 1 ? Math.floor(rangeSize) : EPISODE_RANGE_SIZE;

  if (safeTotal <= safeThreshold) {
    return [];
  }

  const effectiveStep =
    safeTotal <= safeRangeSize ? Math.max(1, Math.floor(safeRangeSize / 2)) : safeRangeSize;

  const groups: EpisodeRangeGroup[] = [];
  for (let startIndex = 0; startIndex < safeTotal; startIndex += effectiveStep) {
    const endIndex = Math.min(safeTotal - 1, startIndex + effectiveStep - 1);
    groups.push({
      startIndex,
      endIndex,
      label: `${startIndex + 1}–${endIndex + 1}`,
    });
  }
  return groups;
}
