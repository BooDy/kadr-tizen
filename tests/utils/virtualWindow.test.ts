import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRID_VIEWPORT_HEIGHT_PX,
  DEFAULT_STRIP_VIEWPORT_WIDTH_PX,
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

  it('handles edge cases cleanly (0 items, 0 columns, negative scroll, out-of-bounds anchors, partial final row)', () => {
    expect(DEFAULT_GRID_VIEWPORT_HEIGHT_PX).toBe(760);
    expect(DEFAULT_STRIP_VIEWPORT_WIDTH_PX).toBe(1760);

    // totalItems = 0
    const emptyRow = computeVirtualRowWindow({
      totalItems: 0,
      columns: 6,
      rowHeightPx: 364,
      rowSpacingPx: 24,
    });
    expect(emptyRow).toEqual({
      isVirtualized: false,
      totalRows: 0,
      startRow: 0,
      endRow: -1,
      startIndex: 0,
      endIndex: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      totalHeightPx: 0,
    });

    const emptyHorizontal = computeVirtualHorizontalWindow({
      totalItems: 0,
      itemWidthPx: 320,
      itemSpacingPx: 16,
    });
    expect(emptyHorizontal).toEqual({
      isVirtualized: false,
      startIndex: 0,
      endIndex: 0,
      leftSpacerPx: 0,
      rightSpacerPx: 0,
      totalWidthPx: 0,
    });

    // columns = 0, negative scrollTopPx, out-of-bounds anchorRow
    const safeCols = computeVirtualRowWindow({
      totalItems: 100,
      columns: 0,
      rowHeightPx: 364,
      rowSpacingPx: 24,
      scrollTopPx: -500,
      anchorRow: 9999,
    });
    expect(safeCols.isVirtualized).toBe(true);
    expect(safeCols.totalRows).toBe(100);
    expect(safeCols.startRow).toBe(0);
    expect(safeCols.startIndex).toBe(0);

    const negAnchor = computeVirtualRowWindow({
      totalItems: 100,
      columns: 5,
      rowHeightPx: 364,
      rowSpacingPx: 24,
      scrollTopPx: 4000,
      anchorRow: -10,
    });
    expect(negAnchor.isVirtualized).toBe(true);
    expect(negAnchor.startRow).toBeGreaterThan(0);
    expect(negAnchor.endRow).toBeLessThan(negAnchor.totalRows);
    const negRenderedRows = negAnchor.endRow - negAnchor.startRow + 1;
    const negRenderedHeight = negRenderedRows * 364 + Math.max(0, negRenderedRows - 1) * 24;
    expect(negAnchor.topSpacerPx + negRenderedHeight + negAnchor.bottomSpacerPx).toBe(
      negAnchor.totalHeightPx,
    );

    // Partial final row clamping for endIndex
    const partialEnd = computeVirtualRowWindow({
      totalItems: 303, // 51 rows, last row has 3 items (indices 300..302)
      columns: 6,
      rowHeightPx: 364,
      rowSpacingPx: 24,
      viewportHeightPx: 760,
      scrollTopPx: 0,
      anchorRow: 50,
      overscanRows: 3,
    });
    expect(partialEnd.endRow).toBe(50);
    expect(partialEnd.endIndex).toBe(303);
    expect(partialEnd.bottomSpacerPx).toBe(0);
    const partialRows = partialEnd.endRow - partialEnd.startRow + 1;
    const partialHeight = partialRows * 364 + Math.max(0, partialRows - 1) * 24;
    expect(partialEnd.topSpacerPx + partialHeight + partialEnd.bottomSpacerPx).toBe(
      partialEnd.totalHeightPx,
    );

    // Out-of-bounds horizontal anchorIndex & negative scrollLeftPx
    const oobHoriz = computeVirtualHorizontalWindow({
      totalItems: 100,
      itemWidthPx: 320,
      itemSpacingPx: 16,
      scrollLeftPx: -100,
      anchorIndex: -5,
    });
    expect(oobHoriz.isVirtualized).toBe(true);
    expect(oobHoriz.startIndex).toBe(0);
    expect(oobHoriz.leftSpacerPx).toBe(0);

    const endHoriz = computeVirtualHorizontalWindow({
      totalItems: 100,
      itemWidthPx: 320,
      itemSpacingPx: 16,
      scrollLeftPx: 0,
      anchorIndex: 99,
      overscanItems: 8,
    });
    expect(endHoriz.endIndex).toBe(100);
    expect(endHoriz.rightSpacerPx).toBe(0);

    // Episode range boundary checks
    expect(buildEpisodeRangeGroups(0)).toEqual([]);
    expect(buildEpisodeRangeGroups(31, EPISODE_RANGE_SIZE)).toEqual([
      { startIndex: 0, endIndex: 24, label: '1–25' },
      { startIndex: 25, endIndex: 30, label: '26–31' },
    ]);
  });

  it('coerces -0 anchors to +0 and renders exact scrolled viewport when anchor is null', () => {
    const negZeroRow = computeVirtualRowWindow({
      totalItems: 180,
      columns: 6,
      rowHeightPx: 384,
      rowSpacingPx: 24,
      viewportHeightPx: 760,
      scrollTopPx: 0,
      anchorRow: -0.5,
      overscanRows: 3,
    });
    expect(Object.is(negZeroRow.startRow, 0)).toBe(true);
    expect(Object.is(negZeroRow.startIndex, 0)).toBe(true);
    expect(Object.is(negZeroRow.topSpacerPx, 0)).toBe(true);

    const negZeroHoriz = computeVirtualHorizontalWindow({
      totalItems: 180,
      itemWidthPx: 320,
      itemSpacingPx: 16,
      viewportWidthPx: 1760,
      scrollLeftPx: 0,
      anchorIndex: -0,
      overscanItems: 8,
    });
    expect(Object.is(negZeroHoriz.startIndex, 0)).toBe(true);
    expect(Object.is(negZeroHoriz.leftSpacerPx, 0)).toBe(true);

    const scrolledRow = computeVirtualRowWindow({
      totalItems: 180,
      columns: 6,
      rowHeightPx: 384,
      rowSpacingPx: 24,
      viewportHeightPx: 760,
      scrollTopPx: 15 * 408,
      anchorRow: null,
      overscanRows: 3,
    });
    expect(scrolledRow.startRow).toBe(12);
    expect(scrolledRow.endRow).toBe(19);
    expect(scrolledRow.startIndex).toBe(72);
    expect(scrolledRow.endIndex).toBe(120);

    const scrolledHoriz = computeVirtualHorizontalWindow({
      totalItems: 180,
      itemWidthPx: 320,
      itemSpacingPx: 16,
      viewportWidthPx: 1760,
      scrollLeftPx: 80 * 336,
      anchorIndex: null,
      overscanItems: 8,
    });
    expect(scrolledHoriz.startIndex).toBeLessThanOrEqual(80);
    expect(scrolledHoriz.endIndex).toBeGreaterThan(80);
  });
});
