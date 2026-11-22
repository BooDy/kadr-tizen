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
      '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-modal-overlay="true"]'
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

  const [targetGridItemId, setTargetGridItemId] = useState<string | null>(null);
  const [pendingCommitTick, setPendingCommitTick] = useState(0);
  const [scrollMetrics, setScrollMetrics] = useState<{
    scrollTopPx: number;
    viewportHeightPx: number;
  }>({
    scrollTopPx: 0,
    viewportHeightPx: 0,
  });

  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < items.length; i++) {
      map.set(`grid-${widget.id}-${items[i].id}`, i);
    }
    return map;
  }, [items, widget.id]);

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

  const effectiveTargetId = targetGridItemId ?? focusedId;
  const focusedItemIndex =
    effectiveTargetId !== null ? (itemIndexMap.get(effectiveTargetId) ?? -1) : -1;
  const anchorRow = focusedItemIndex >= 0 ? Math.floor(focusedItemIndex / columns) : null;

  const needsVirtualization = items.length > VIRTUAL_GRID_ITEM_THRESHOLD;

  useLayoutEffect(() => {
    if (!needsVirtualization || items.length === 0) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const mainEl = wrapper.closest('main') as HTMLElement | null;
    if (!mainEl) return;

    const syncScroll = () => {
      const nextTop = Math.max(0, mainEl.scrollTop - (wrapper.offsetTop || 0));
      const nextHeight = mainEl.clientHeight || 0;
      setScrollMetrics((prev) =>
        prev.scrollTopPx === nextTop && prev.viewportHeightPx === nextHeight
          ? prev
          : { scrollTopPx: nextTop, viewportHeightPx: nextHeight }
      );
    };

    syncScroll();
    mainEl.addEventListener('scroll', syncScroll, { passive: true });
    window.addEventListener('resize', syncScroll);
    return () => {
      mainEl.removeEventListener('scroll', syncScroll);
      window.removeEventListener('resize', syncScroll);
    };
  }, [needsVirtualization, items.length, widget.id]);

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

      if (isModalOverlayOpen(activeTrapRef.current)) {
        return;
      }

      const code = e.keyCode || e.which;
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

      if (!isPageUp && !isPageDown) {
        return;
      }

      const liveFocusedId = focusCtxRef.current?.getFocusedId?.() ?? focusedIdRef.current;
      const curId = pendingFocusIdRef.current ?? liveFocusedId;
      if (!curId) return;

      const curIdx = itemIndexMapRef.current.get(curId);
      if (curIdx === undefined) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const curItems = itemsRef.current;
      const curCols = columnsRef.current;
      const totalRows = Math.ceil(curItems.length / curCols);
      if (totalRows <= 0) return;

      const currentRow = Math.floor(curIdx / curCols);
      const currentCol = curIdx % curCols;
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
        mainEl.scrollTop = nextScrollTop;
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

  return (
    <div ref={wrapperRef} className="mb-10">
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
