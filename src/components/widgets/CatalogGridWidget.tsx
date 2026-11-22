import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FocusContext } from '../../navigation/FocusContext';
import { TVKeys } from '../../navigation/keys';
import { isTextInputElement } from '../../navigation/useFocusable';
import { GridWidgetNode } from '../../types/ast';
import {
  computeVirtualRowWindow,
  DEFAULT_GRID_VIEWPORT_HEIGHT_PX,
  VIRTUAL_GRID_ITEM_THRESHOLD,
} from '../../utils/virtualWindow';
import { TVCard } from '../tv/TVCard';

const GRID_ROW_HEIGHT_PX = 384;
const GRID_ROW_SPACING_PX = 24;
const GRID_OVERSCAN_ROWS = 3;
const PAGE_JUMP_ROWS = 5;

function isModalOverlayOpen(activeTrap: string | null): boolean {
  if (activeTrap) return true;
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector(
      '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-modal-overlay="true"], .fixed.z-50'
    )
  );
}

export interface CatalogGridProps {
  widget: GridWidgetNode;
  serverUrl: string;
  onSelectItem: (itemId: number) => void;
  autoFocusFirstItem?: boolean;
}

export function CatalogGridWidget({
  widget,
  serverUrl,
  onSelectItem,
  autoFocusFirstItem = false,
}: CatalogGridProps) {
  const items = widget.items || [];
  const columns = widget.columns || 6;

  const focusCtx = useContext(FocusContext);
  const focusedId = focusCtx?.focusedId ?? null;
  const activeTrap = focusCtx?.activeTrap ?? null;
  const setFocusedId = focusCtx?.setFocusedId;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);
  const preJumpFocusedIdRef = useRef<string | null>(null);
  const programmaticScrollRef = useRef(false);
  const lastProgrammaticScrollTopRef = useRef<number | null>(null);

  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < items.length; i++) {
      map.set(`grid-${widget.id}-${items[i].id}`, i);
    }
    return map;
  }, [items, widget.id]);

  const liveActiveTrap = focusCtx?.getActiveTrap?.() ?? activeTrap;
  const modalOpen = isModalOverlayOpen(liveActiveTrap);
  const trapReturnFocusId = modalOpen ? (focusCtx?.getTrapReturnFocusId?.() ?? null) : null;

  const [targetGridItemId, setTargetGridItemId] = useState<string | null>(null);
  const [lastFocusedGridItemId, setLastFocusedGridItemId] = useState<string | null>(() => {
    if (focusedId && itemIndexMap.has(focusedId)) return focusedId;
    if (modalOpen && trapReturnFocusId && itemIndexMap.has(trapReturnFocusId)) {
      return trapReturnFocusId;
    }
    return null;
  });
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [pendingCommitTick, setPendingCommitTick] = useState(0);
  const [scrollMetrics, setScrollMetrics] = useState<{
    scrollTopPx: number;
    viewportHeightPx: number;
  }>({
    scrollTopPx: 0,
    viewportHeightPx: 0,
  });

  if (focusedId !== null && itemIndexMap.has(focusedId)) {
    if (lastFocusedGridItemId !== focusedId) {
      setLastFocusedGridItemId(focusedId);
    }
  } else if (lastFocusedGridItemId !== null && !itemIndexMap.has(lastFocusedGridItemId)) {
    setLastFocusedGridItemId(null);
  } else if (!modalOpen && focusedId !== null && !itemIndexMap.has(focusedId)) {
    if (lastFocusedGridItemId !== null) {
      setLastFocusedGridItemId(null);
    }
  } else if (
    modalOpen &&
    lastFocusedGridItemId === null &&
    trapReturnFocusId &&
    itemIndexMap.has(trapReturnFocusId)
  ) {
    setLastFocusedGridItemId(trapReturnFocusId);
  }

  const focusCtxRef = useRef(focusCtx);
  focusCtxRef.current = focusCtx;
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;
  const setFocusedIdRef = useRef(setFocusedId);
  setFocusedIdRef.current = setFocusedId;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const widgetIdRef = useRef(widget.id);
  widgetIdRef.current = widget.id;
  const itemIndexMapRef = useRef(itemIndexMap);
  itemIndexMapRef.current = itemIndexMap;
  const isUserScrollingRef = useRef(isUserScrolling);
  isUserScrollingRef.current = isUserScrolling;
  const scrollMetricsRef = useRef(scrollMetrics);
  scrollMetricsRef.current = scrollMetrics;

  const modalFallbackId = modalOpen
    ? lastFocusedGridItemId && itemIndexMap.has(lastFocusedGridItemId)
      ? lastFocusedGridItemId
      : trapReturnFocusId && itemIndexMap.has(trapReturnFocusId)
        ? trapReturnFocusId
        : null
    : null;
  const effectiveTargetId = isUserScrolling
    ? null
    : (targetGridItemId ??
      (focusedId && itemIndexMap.has(focusedId) ? focusedId : modalFallbackId));
  const focusedItemIndex =
    effectiveTargetId !== null ? (itemIndexMap.get(effectiveTargetId) ?? -1) : -1;
  const anchorRow = focusedItemIndex >= 0 ? Math.floor(focusedItemIndex / columns) : null;

  const needsVirtualization = items.length > VIRTUAL_GRID_ITEM_THRESHOLD;

  const applyProgrammaticScrollTop = (mainEl: HTMLElement, nextScrollTop: number) => {
    programmaticScrollRef.current = true;
    lastProgrammaticScrollTopRef.current = nextScrollTop;
    mainEl.scrollTop = nextScrollTop;
    lastProgrammaticScrollTopRef.current = mainEl.scrollTop;
    programmaticScrollRef.current = false;
  };

  useLayoutEffect(() => {
    if (!needsVirtualization || items.length === 0) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const mainEl = wrapper.closest('main') as HTMLElement | null;
    if (!mainEl) return;

    const syncScrollMetrics = () => {
      const nextTop = Math.max(0, mainEl.scrollTop - (wrapper.offsetTop || 0));
      const nextHeight = mainEl.clientHeight || 0;
      setScrollMetrics((prev) =>
        prev.scrollTopPx === nextTop && prev.viewportHeightPx === nextHeight
          ? prev
          : { scrollTopPx: nextTop, viewportHeightPx: nextHeight }
      );
    };

    const handleMainScroll = () => {
      const currentMainTop = mainEl.scrollTop;
      const expectedTop = lastProgrammaticScrollTopRef.current;
      const isProgrammatic =
        programmaticScrollRef.current ||
        (expectedTop !== null && Math.abs(currentMainTop - expectedTop) <= 4);

      if (isProgrammatic) {
        if (!programmaticScrollRef.current) {
          lastProgrammaticScrollTopRef.current = null;
        }
      } else {
        lastProgrammaticScrollTopRef.current = null;
        setIsUserScrolling((prev) => (prev ? prev : true));
      }

      syncScrollMetrics();
    };

    const handleMainWheel = () => {
      lastProgrammaticScrollTopRef.current = null;
    };

    syncScrollMetrics();
    mainEl.addEventListener('scroll', handleMainScroll, { passive: true });
    mainEl.addEventListener('wheel', handleMainWheel, { passive: true });
    window.addEventListener('resize', syncScrollMetrics);
    return () => {
      mainEl.removeEventListener('scroll', handleMainScroll);
      mainEl.removeEventListener('wheel', handleMainWheel);
      window.removeEventListener('resize', syncScrollMetrics);
    };
  }, [needsVirtualization, items.length, widget.id]);

  // Keep programmatic scroll tracker aligned with useFocusable scrollIntoView during D-pad moves
  useEffect(() => {
    if (!needsVirtualization || isUserScrollingRef.current) return;
    if (!focusedId || !itemIndexMap.has(focusedId)) return;
    const mainEl = wrapperRef.current?.closest('main') as HTMLElement | null;
    if (mainEl) {
      lastProgrammaticScrollTopRef.current = mainEl.scrollTop;
    }
  }, [needsVirtualization, focusedId, itemIndexMap]);

  const win = useMemo(
    () =>
      computeVirtualRowWindow({
        totalItems: items.length,
        columns,
        rowHeightPx: GRID_ROW_HEIGHT_PX,
        rowSpacingPx: GRID_ROW_SPACING_PX,
        viewportHeightPx: scrollMetrics.viewportHeightPx,
        scrollTopPx: scrollMetrics.scrollTopPx,
        anchorRow,
        overscanRows: GRID_OVERSCAN_ROWS,
        thresholdItems: VIRTUAL_GRID_ITEM_THRESHOLD,
      }),
    [items.length, columns, scrollMetrics.viewportHeightPx, scrollMetrics.scrollTopPx, anchorRow]
  );

  // Commit deferred focus in layout phase after shifted virtual window cards mount
  useLayoutEffect(() => {
    const pendingId = pendingFocusIdRef.current;
    if (!pendingId || items.length === 0) return;
    const el = typeof document !== 'undefined' ? document.getElementById(pendingId) : null;
    if (!el) return;
    pendingFocusIdRef.current = null;
    setFocusedIdRef.current?.(pendingId);
    if (typeof el.focus === 'function') {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
  }, [targetGridItemId, pendingCommitTick, items]);

  useEffect(() => {
    if (activeTrap) {
      pendingFocusIdRef.current = null;
      preJumpFocusedIdRef.current = null;
      if (targetGridItemId !== null) {
        setTargetGridItemId(null);
      }
      return;
    }
    if (targetGridItemId !== null && !itemIndexMap.has(targetGridItemId)) {
      pendingFocusIdRef.current = null;
      preJumpFocusedIdRef.current = null;
      setTargetGridItemId(null);
      return;
    }
    if (
      !pendingFocusIdRef.current &&
      targetGridItemId !== null &&
      focusedId !== null &&
      (focusedId === targetGridItemId || focusedId !== preJumpFocusedIdRef.current)
    ) {
      preJumpFocusedIdRef.current = null;
      setTargetGridItemId(null);
    }
  }, [activeTrap, focusedId, targetGridItemId, itemIndexMap]);

  // Capture-phase CH_UP / CH_DOWN (+-5 rows) fast jump when focus is inside this grid
  useEffect(() => {
    if (items.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (
        isTextInputElement(targetEl) ||
        isTextInputElement(activeEl) ||
        targetEl?.isContentEditable ||
        (activeEl as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }

      if (
        isModalOverlayOpen(focusCtxRef.current?.getActiveTrap?.() ?? activeTrapRef.current)
      ) {
        return;
      }

      const code = e.keyCode || e.which;
      const isArrowKey =
        code === TVKeys.UP ||
        code === TVKeys.DOWN ||
        code === TVKeys.LEFT ||
        code === TVKeys.RIGHT ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight';
      const isPageUp =
        code === TVKeys.CH_UP ||
        code === TVKeys.PAGE_UP ||
        e.key === 'ChannelUp' ||
        e.key === 'PageUp';
      const isPageDown =
        code === TVKeys.CH_DOWN ||
        code === TVKeys.PAGE_DOWN ||
        e.key === 'ChannelDown' ||
        e.key === 'PageDown';

      if (!isArrowKey && !isPageUp && !isPageDown) {
        return;
      }

      const wasUserScrolling = isUserScrollingRef.current;
      if (wasUserScrolling) {
        setIsUserScrolling(false);
      }

      const liveFocusedId = focusCtxRef.current?.getFocusedId?.() ?? focusedIdRef.current;
      const curItems = itemsRef.current;
      const curCols = columnsRef.current;
      const totalRows = Math.ceil(curItems.length / curCols);

      if (isArrowKey) {
        if (wasUserScrolling && !liveFocusedId && totalRows > 0) {
          const rowStride = GRID_ROW_HEIGHT_PX + GRID_ROW_SPACING_PX;
          const firstVisibleRow = Math.max(
            0,
            Math.min(totalRows - 1, Math.floor(scrollMetricsRef.current.scrollTopPx / rowStride))
          );
          let fallbackIdx = Math.min(curItems.length - 1, firstVisibleRow * curCols);
          for (let idx = fallbackIdx; idx < curItems.length; idx++) {
            const candidateId = `grid-${widgetIdRef.current}-${curItems[idx].id}`;
            if (typeof document !== 'undefined' && document.getElementById(candidateId)) {
              fallbackIdx = idx;
              break;
            }
          }
          const targetItem = curItems[fallbackIdx];
          if (targetItem) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const nextId = `grid-${widgetIdRef.current}-${targetItem.id}`;
            setLastFocusedGridItemId(nextId);
            setFocusedIdRef.current?.(nextId);
            const el = typeof document !== 'undefined' ? document.getElementById(nextId) : null;
            if (el && typeof el.focus === 'function') {
              try {
                el.focus({ preventScroll: true });
              } catch {
                el.focus();
              }
            }
          }
        }
        return;
      }

      const curId = pendingFocusIdRef.current ?? liveFocusedId;
      let currentRow: number;
      let currentCol: number;
      if (curId) {
        const curIdx = itemIndexMapRef.current.get(curId);
        if (curIdx === undefined) return;
        currentRow = Math.floor(curIdx / curCols);
        currentCol = curIdx % curCols;
      } else {
        if (!wasUserScrolling || totalRows <= 0) return;
        const rowStride = GRID_ROW_HEIGHT_PX + GRID_ROW_SPACING_PX;
        currentRow = Math.max(
          0,
          Math.min(totalRows - 1, Math.floor(scrollMetricsRef.current.scrollTopPx / rowStride))
        );
        currentCol = 0;
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (totalRows <= 0) return;

      const targetRow = Math.max(
        0,
        Math.min(totalRows - 1, currentRow + (isPageDown ? PAGE_JUMP_ROWS : -PAGE_JUMP_ROWS))
      );
      const targetIdx = Math.min(curItems.length - 1, targetRow * curCols + currentCol);
      const targetItem = curItems[targetIdx];
      if (!targetItem) return;

      const nextId = `grid-${widgetIdRef.current}-${targetItem.id}`;

      const wrapper = wrapperRef.current;
      const mainEl = wrapper?.closest('main') as HTMLElement | null;
      if (mainEl && wrapper) {
        const rowStride = GRID_ROW_HEIGHT_PX + GRID_ROW_SPACING_PX;
        const viewportH = mainEl.clientHeight || DEFAULT_GRID_VIEWPORT_HEIGHT_PX;
        const targetRowTop = (wrapper.offsetTop || 0) + targetRow * rowStride;
        const nextScrollTop = Math.max(
          0,
          targetRowTop - Math.max(0, Math.floor((viewportH - GRID_ROW_HEIGHT_PX) / 2))
        );
        applyProgrammaticScrollTop(mainEl, nextScrollTop);
        setScrollMetrics({
          scrollTopPx: Math.max(0, nextScrollTop - (wrapper.offsetTop || 0)),
          viewportHeightPx: mainEl.clientHeight || 0,
        });
      }

      const mountedEl = typeof document !== 'undefined' ? document.getElementById(nextId) : null;
      if (mountedEl) {
        pendingFocusIdRef.current = null;
        preJumpFocusedIdRef.current = null;
        setFocusedIdRef.current?.(nextId);
        if (typeof mountedEl.focus === 'function') {
          try {
            mountedEl.focus({ preventScroll: true });
          } catch {
            mountedEl.focus();
          }
        }
        return;
      }

      preJumpFocusedIdRef.current = liveFocusedId;
      pendingFocusIdRef.current = nextId;
      setTargetGridItemId(nextId);
      setPendingCommitTick((tick) => tick + 1);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [items.length]);

  if (items.length === 0) return null;

  const cleanServer = serverUrl.replace(/\/+$/, '');
  const visibleItems = win.isVirtualized ? items.slice(win.startIndex, win.endIndex) : items;

  const handleWrapperClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const cardEl = (e.target as HTMLElement | null)?.closest?.('[id]') as HTMLElement | null;
    if (!cardEl || !itemIndexMapRef.current.has(cardEl.id)) return;
    if (isUserScrollingRef.current) {
      setIsUserScrolling(false);
    }
    if (!isModalOverlayOpen(focusCtxRef.current?.getActiveTrap?.() ?? activeTrapRef.current)) {
      setLastFocusedGridItemId(cardEl.id);
      setFocusedIdRef.current?.(cardEl.id);
    }
  };

  const handleWrapperFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const cardEl = (e.target as HTMLElement | null)?.closest?.('[id]') as HTMLElement | null;
    if (!cardEl || !itemIndexMapRef.current.has(cardEl.id)) return;
    if (isModalOverlayOpen(focusCtxRef.current?.getActiveTrap?.() ?? activeTrapRef.current)) {
      return;
    }
    const liveFocused = focusCtxRef.current?.getFocusedId?.() ?? focusedIdRef.current;
    if (isUserScrollingRef.current || liveFocused !== cardEl.id) {
      setIsUserScrolling(false);
      setLastFocusedGridItemId(cardEl.id);
      setFocusedIdRef.current?.(cardEl.id);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="mb-10"
      onClickCapture={handleWrapperClickCapture}
      onFocusCapture={handleWrapperFocusCapture}
    >
      <div className="flex justify-between items-baseline mb-4 px-2">
        <h3 className="text-2xl font-bold text-[#F5E5E5]">{widget.title}</h3>
        {widget.total_count !== undefined && (
          <span className="text-[#5C3C3C] text-sm font-semibold">
            {items.length} of {widget.total_count} items
          </span>
        )}
      </div>
      <div
        className="grid py-2 px-2"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridGap: '24px',
          paddingTop: win.isVirtualized ? `${win.topSpacerPx}px` : undefined,
          paddingBottom: win.isVirtualized ? `${win.bottomSpacerPx}px` : undefined,
        }}
      >
        {visibleItems.map((item, sliceOffset) => {
          const idx = win.startIndex + sliceOffset;
          const imgUrl = item.poster_url
            ? item.poster_url.startsWith('http')
              ? item.poster_url
              : `${cleanServer}${item.poster_url.startsWith('/') ? '' : '/'}${item.poster_url}`
            : undefined;

          const subtitle =
            item.season && item.episode
              ? `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`
              : item.subtitle || (item.release_year ? String(item.release_year) : undefined);

          const progressPercent = item.playback_progress
            ? Math.round(item.playback_progress * 100)
            : undefined;

          return (
            <TVCard
              key={item.id}
              id={`grid-${widget.id}-${item.id}`}
              groupId={`grid-${widget.id}`}
              order={idx + 1}
              title={item.title}
              subtitle={subtitle}
              imageUrl={imgUrl}
              badge={item.badge}
              progressPercent={progressPercent}
              onSelect={() => onSelectItem(item.id)}
              autoFocus={autoFocusFirstItem && idx === 0}
            />
          );
        })}
      </div>
    </div>
  );
}
