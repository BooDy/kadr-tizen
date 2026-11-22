import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  type JSX,
  type CSSProperties,
} from 'react';
import {
  Search,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Tv,
  Film,
  Compass,
} from 'lucide-react';
import { ApiClient } from '../api/client';
import {
  fetchSearchResults,
  getSavedSearchState,
  setSavedSearchState,
} from '../api/search';
import { SearchFilterType, SearchResultItem } from '../types/kadr';
import { useFocusContext, useFocusStore } from '../navigation/FocusContext';
import { useFocusable } from '../navigation/useFocusable';
import { TVKeys } from '../navigation/keys';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';
import { toResumePercentageSentinel } from '../utils/playbackProgress';

export interface SearchViewProps {
  client: ApiClient;
  serverUrl: string;
  token?: string;
  refreshKey?: number;
  initialFocusId?: string | null;
  onInitialFocusConsumed?: () => void;
  onSelectItem: (itemId: number | string) => void;
  onPlayItem: (
    itemId: number | string,
    resumeMs?: number,
    title?: string
  ) => void;
  onNavigateToSidebar?: () => void;
}

const SEARCH_DEBOUNCE_MS = 220;
const GRID_COLS = 4;
const KEYBOARD_COLS = 6;

const KEYBOARD_KEYS: readonly string[] = [
  'a', 'b', 'c', 'd', 'e', 'f',
  'g', 'h', 'i', 'j', 'k', 'l',
  'm', 'n', 'o', 'p', 'q', 'r',
  's', 't', 'u', 'v', 'w', 'x',
  'y', 'z', '0', '1', '2', '3',
  '4', '5', '6', '7', '8', '9',
];

const ACTION_BUTTONS: ReadonlyArray<{
  id: 'search-action-space' | 'search-action-backspace' | 'search-action-clear';
  label: string;
  ariaLabel: string;
  widthClass: string;
}> = [
  { id: 'search-action-space', label: 'Space', ariaLabel: 'Space', widthClass: 'flex-1 mr-2.5' },
  {
    id: 'search-action-backspace',
    label: '⌫',
    ariaLabel: 'Backspace',
    widthClass: 'w-24 shrink-0 mr-2.5',
  },
  { id: 'search-action-clear', label: 'Clear', ariaLabel: 'Clear', widthClass: 'w-24 shrink-0' },
];

export const SEARCH_FILTERS: ReadonlyArray<{
  value: SearchFilterType;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'TV Shows' },
  { value: 'episode', label: 'Episodes' },
  { value: 'anime', label: 'Anime' },
  { value: 'music', label: 'Music' },
  { value: 'audiobook', label: 'Audiobooks' },
  { value: 'live_channel', label: 'Live' },
];

const ACTION_NODE_IDS = new Set<string>(ACTION_BUTTONS.map((a) => a.id));
const FILTER_NODE_IDS = new Set<string>(
  SEARCH_FILTERS.map((f) => `search-filter-${f.value}`)
);
const LEFTMOST_NODE_IDS = new Set<string>([
  'search-query-input',
  'search-action-space',
  'search-key-a',
  'search-key-g',
  'search-key-m',
  'search-key-s',
  'search-key-y',
  'search-key-4',
]);

export function isSearchContentNodeId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    id === 'search-query-input' ||
    ACTION_NODE_IDS.has(id) ||
    /^search-key-[a-z0-9]$/.test(id) ||
    FILTER_NODE_IDS.has(id) ||
    (id.startsWith('search-card-') && id.length > 'search-card-'.length) ||
    id === 'search-reset-filter-btn' ||
    id === 'search-retry-btn'
  );
}

export function isSearchLeftmostNodeId(id: string | null | undefined): boolean {
  return Boolean(id && LEFTMOST_NODE_IDS.has(id));
}

export function getFirstSearchFocusableId(): string {
  if (typeof document !== 'undefined' && document.getElementById('search-key-a')) {
    return 'search-key-a';
  }
  return 'search-query-input';
}

function isLeftPaneNodeId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    id === 'search-query-input' ||
    ACTION_NODE_IDS.has(id) ||
    /^search-key-[a-z0-9]$/.test(id)
  );
}

function isAnyModalActive(activeTrap?: string | null): boolean {
  if (activeTrap) return true;
  if (typeof document !== 'undefined') {
    return Boolean(
      document.querySelector(
        '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-modal-overlay="true"]'
      )
    );
  }
  return false;
}

function focusDomNode(targetId: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(targetId);
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function formatResultTypeBadge(item: SearchResultItem): string {
  if (item.item_type === 'episode') {
    if (
      item.season !== null &&
      item.season !== undefined &&
      item.episode !== null &&
      item.episode !== undefined
    ) {
      return `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`;
    }
    return 'EPISODE';
  }
  switch (item.item_type) {
    case 'movie':
      return 'MOVIE';
    case 'show':
      return 'SHOW';
    case 'anime':
      return 'ANIME';
    case 'music':
      return 'MUSIC';
    case 'audiobook':
      return 'BOOK';
    case 'live_channel':
      return 'LIVE';
    default:
      return (item.item_type || 'VIDEO').toUpperCase();
  }
}

function getResultStatusBadge(item: SearchResultItem): string | null {
  if ((item.playback_progress ?? 0) >= 0.9) {
    return 'WATCHED';
  }
  if (item.badge) {
    return item.badge;
  }
  return null;
}

function formatResultSubtitle(item: SearchResultItem): string {
  if (item.item_type === 'episode' && item.series_title) {
    return item.series_title;
  }
  return [item.release_year, item.library_name]
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
    .join(' \u2022 ');
}

type ArrowDirection = 'left' | 'right' | 'up' | 'down';

type RouteOutcome =
  | { type: 'focus'; targetId: string }
  | { type: 'sidebar' }
  | { type: 'clamp' };

function resolveSearchArrowNavigation(params: {
  currentId: string;
  direction: ArrowDirection;
  results: SearchResultItem[];
  activeFilter: SearchFilterType;
  lastKeyboardFocusId: string;
  rightPaneEntryId: string;
  hasResetFilterBtn: boolean;
  hasRetryBtn: boolean;
}): RouteOutcome | null {
  const {
    currentId,
    direction,
    results,
    activeFilter,
    lastKeyboardFocusId,
    rightPaneEntryId,
    hasResetFilterBtn,
    hasRetryBtn,
  } = params;

  const fallbackKeyboardId = isLeftPaneNodeId(lastKeyboardFocusId)
    ? lastKeyboardFocusId
    : 'search-key-a';

  if (currentId === 'search-query-input') {
    if (direction === 'down') return { type: 'focus', targetId: 'search-action-space' };
    if (direction === 'left') return { type: 'sidebar' };
    if (direction === 'right') return { type: 'focus', targetId: rightPaneEntryId };
    return { type: 'clamp' };
  }

  const actionIdx = ACTION_BUTTONS.findIndex((btn) => btn.id === currentId);
  if (actionIdx !== -1) {
    if (direction === 'left') {
      return actionIdx > 0
        ? { type: 'focus', targetId: ACTION_BUTTONS[actionIdx - 1].id }
        : { type: 'sidebar' };
    }
    if (direction === 'right') {
      return actionIdx < ACTION_BUTTONS.length - 1
        ? { type: 'focus', targetId: ACTION_BUTTONS[actionIdx + 1].id }
        : { type: 'focus', targetId: rightPaneEntryId };
    }
    if (direction === 'up') {
      return { type: 'focus', targetId: 'search-query-input' };
    }
    const targetCol = actionIdx === 0 ? 0 : actionIdx === 1 ? 2 : 4;
    return { type: 'focus', targetId: `search-key-${KEYBOARD_KEYS[targetCol]}` };
  }

  if (currentId.startsWith('search-key-')) {
    const keyChar = currentId.slice('search-key-'.length);
    const keyIdx = KEYBOARD_KEYS.indexOf(keyChar);
    if (keyIdx !== -1) {
      const row = Math.floor(keyIdx / KEYBOARD_COLS);
      const col = keyIdx % KEYBOARD_COLS;

      if (direction === 'left') {
        if (col > 0) {
          return {
            type: 'focus',
            targetId: `search-key-${KEYBOARD_KEYS[row * KEYBOARD_COLS + (col - 1)]}`,
          };
        }
        return { type: 'sidebar' };
      }
      if (direction === 'right') {
        if (col < KEYBOARD_COLS - 1) {
          return {
            type: 'focus',
            targetId: `search-key-${KEYBOARD_KEYS[row * KEYBOARD_COLS + (col + 1)]}`,
          };
        }
        return { type: 'focus', targetId: rightPaneEntryId };
      }
      if (direction === 'up') {
        if (row > 0) {
          return {
            type: 'focus',
            targetId: `search-key-${KEYBOARD_KEYS[(row - 1) * KEYBOARD_COLS + col]}`,
          };
        }
        const targetAction =
          col < 2
            ? 'search-action-space'
            : col < 4
            ? 'search-action-backspace'
            : 'search-action-clear';
        return { type: 'focus', targetId: targetAction };
      }
      if (row < 5) {
        return {
          type: 'focus',
          targetId: `search-key-${KEYBOARD_KEYS[(row + 1) * KEYBOARD_COLS + col]}`,
        };
      }
      return { type: 'clamp' };
    }
  }

  if (currentId.startsWith('search-filter-')) {
    const filterValue = currentId.slice('search-filter-'.length);
    const filterIdx = SEARCH_FILTERS.findIndex((f) => f.value === filterValue);
    if (filterIdx !== -1) {
      if (direction === 'left') {
        return filterIdx > 0
          ? {
              type: 'focus',
              targetId: `search-filter-${SEARCH_FILTERS[filterIdx - 1].value}`,
            }
          : { type: 'focus', targetId: fallbackKeyboardId };
      }
      if (direction === 'right') {
        return filterIdx < SEARCH_FILTERS.length - 1
          ? {
              type: 'focus',
              targetId: `search-filter-${SEARCH_FILTERS[filterIdx + 1].value}`,
            }
          : { type: 'clamp' };
      }
      if (direction === 'down') {
        if (results.length > 0) {
          return { type: 'focus', targetId: `search-card-${results[0].id}` };
        }
        if (hasResetFilterBtn) {
          return { type: 'focus', targetId: 'search-reset-filter-btn' };
        }
        if (hasRetryBtn) {
          return { type: 'focus', targetId: 'search-retry-btn' };
        }
      }
      return { type: 'clamp' };
    }
  }

  if (currentId.startsWith('search-card-')) {
    const cardIdx = results.findIndex((item) => `search-card-${item.id}` === currentId);
    if (cardIdx !== -1) {
      const col = cardIdx % GRID_COLS;
      if (direction === 'left') {
        return col > 0
          ? { type: 'focus', targetId: `search-card-${results[cardIdx - 1].id}` }
          : { type: 'focus', targetId: fallbackKeyboardId };
      }
      if (direction === 'right') {
        return col < GRID_COLS - 1 && cardIdx + 1 < results.length
          ? { type: 'focus', targetId: `search-card-${results[cardIdx + 1].id}` }
          : { type: 'clamp' };
      }
      if (direction === 'up') {
        return cardIdx >= GRID_COLS
          ? { type: 'focus', targetId: `search-card-${results[cardIdx - GRID_COLS].id}` }
          : { type: 'focus', targetId: `search-filter-${activeFilter}` };
      }
      if (cardIdx + GRID_COLS < results.length) {
        return {
          type: 'focus',
          targetId: `search-card-${results[cardIdx + GRID_COLS].id}`,
        };
      }
      const currentRow = Math.floor(cardIdx / GRID_COLS);
      const lastRow = Math.floor((results.length - 1) / GRID_COLS);
      if (currentRow < lastRow) {
        return {
          type: 'focus',
          targetId: `search-card-${results[results.length - 1].id}`,
        };
      }
      return { type: 'clamp' };
    }
  }

  if (currentId === 'search-reset-filter-btn' || currentId === 'search-retry-btn') {
    if (direction === 'left') {
      return { type: 'focus', targetId: fallbackKeyboardId };
    }
    if (direction === 'up') {
      return { type: 'focus', targetId: `search-filter-${activeFilter}` };
    }
    return { type: 'clamp' };
  }

  return null;
}

interface SearchFocusBridgeProps {
  loading: boolean;
  firstResultId: number | null;
  activeFilter: SearchFilterType;
  initialFocusId?: string | null;
  hasInitialQuery: boolean;
  onInitialFocusConsumed?: () => void;
}

function SearchFocusBridge({
  loading,
  firstResultId,
  activeFilter,
  initialFocusId,
  hasInitialQuery,
  onInitialFocusConsumed,
}: SearchFocusBridgeProps) {
  const { focusedId, setFocusedId, activeTrap } = useFocusContext();
  const lastValidSearchFocusRef = useRef<string | null>(null);
  const pendingInitialFocusIdRef = useRef<string | null>(
    initialFocusId &&
      isSearchContentNodeId(initialFocusId) &&
      (!initialFocusId.startsWith('search-card-') || hasInitialQuery)
      ? initialFocusId
      : null
  );
  const wasModalActiveRef = useRef<boolean>(false);
  const onInitialFocusConsumedRef = useRef(onInitialFocusConsumed);
  onInitialFocusConsumedRef.current = onInitialFocusConsumed;

  useEffect(() => {
    const modalActive = isAnyModalActive(activeTrap);
    if (modalActive) {
      wasModalActiveRef.current = true;
      return;
    }
    const modalJustClosed = wasModalActiveRef.current;
    wasModalActiveRef.current = false;

    const pendingInitialId = pendingInitialFocusIdRef.current;
    if (pendingInitialId) {
      // Allow restoring pendingInitialId when closing a modal that remounted with BrowseScreen
      // caused FocusContext.popTrap to fall back to the first sidebar item ('nav-screen-home').
      if (
        focusedId &&
        focusedId.startsWith('nav-') &&
        !(modalJustClosed && focusedId === 'nav-screen-home')
      ) {
        lastValidSearchFocusRef.current = null;
        pendingInitialFocusIdRef.current = null;
        onInitialFocusConsumedRef.current?.();
        return;
      }

      if (typeof document !== 'undefined' && document.getElementById(pendingInitialId)) {
        pendingInitialFocusIdRef.current = null;
        onInitialFocusConsumedRef.current?.();
        lastValidSearchFocusRef.current = pendingInitialId;
        setFocusedId(pendingInitialId);
        focusDomNode(pendingInitialId);
        return;
      }

      if (pendingInitialId.startsWith('search-card-') && loading) {
        const interimId = `search-filter-${activeFilter}`;
        const hasValidCurrent = Boolean(
          focusedId &&
            isSearchContentNodeId(focusedId) &&
            typeof document !== 'undefined' &&
            document.getElementById(focusedId)
        );
        if (!hasValidCurrent) {
          lastValidSearchFocusRef.current = interimId;
          setFocusedId(interimId);
          focusDomNode(interimId);
        }
        return;
      }

      pendingInitialFocusIdRef.current = null;
      onInitialFocusConsumedRef.current?.();
      const fallbackId = pendingInitialId.startsWith('search-card-')
        ? firstResultId !== null
          ? `search-card-${firstResultId}`
          : `search-filter-${activeFilter}`
        : getFirstSearchFocusableId();
      lastValidSearchFocusRef.current = fallbackId;
      setFocusedId(fallbackId);
      focusDomNode(fallbackId);
      return;
    }

    if (focusedId && focusedId.startsWith('nav-')) {
      lastValidSearchFocusRef.current = null;
      return;
    }

    if (
      focusedId &&
      isSearchContentNodeId(focusedId) &&
      typeof document !== 'undefined' &&
      document.getElementById(focusedId)
    ) {
      lastValidSearchFocusRef.current = focusedId;
      return;
    }

    const lostId =
      focusedId && isSearchContentNodeId(focusedId)
        ? focusedId
        : lastValidSearchFocusRef.current;

    if (
      lostId &&
      (lostId.startsWith('search-card-') ||
        lostId === 'search-reset-filter-btn' ||
        lostId === 'search-retry-btn')
    ) {
      if (loading) return;
      const anchorId =
        firstResultId !== null
          ? `search-card-${firstResultId}`
          : `search-filter-${activeFilter}`;
      lastValidSearchFocusRef.current = anchorId;
      setFocusedId(anchorId);
      focusDomNode(anchorId);
      return;
    }

    const initialId = getFirstSearchFocusableId();
    lastValidSearchFocusRef.current = initialId;
    setFocusedId(initialId);
  }, [loading, firstResultId, activeFilter, activeTrap, focusedId, setFocusedId]);

  return null;
}

interface SearchActionButtonProps {
  id: 'search-action-space' | 'search-action-backspace' | 'search-action-clear';
  label: string;
  ariaLabel: string;
  order: number;
  className: string;
  onAction: () => void;
}

const SearchActionButton = memo(function SearchActionButton({
  id,
  label,
  ariaLabel,
  order,
  className,
  onAction,
}: SearchActionButtonProps) {
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId: 'search-content',
    order,
    onEnter: onAction,
  });

  return (
    <button
      ref={ref}
      id={id}
      data-testid={id}
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      onClick={onAction}
      className={`h-12 rounded-xl font-semibold text-base tracking-wide flex items-center justify-center cursor-pointer outline-none select-none transition-transform duration-75 ${className} ${
        isFocused
          ? 'bg-[#ff7a18] text-white border-2 border-[#FFB800] tv-focus-ring'
          : 'bg-[#1a1b21] text-[#e3e1e9] border border-[rgba(255,255,255,0.1)] hover:bg-[#292a2f]'
      }`}
    >
      {label}
    </button>
  );
});

interface SearchKeyButtonProps {
  char: string;
  order: number;
  className: string;
  onPressChar: (ch: string) => void;
}

const SearchKeyButton = memo(function SearchKeyButton({
  char,
  order,
  className,
  onPressChar,
}: SearchKeyButtonProps) {
  const id = `search-key-${char}`;
  const handleSelect = useCallback(() => onPressChar(char), [onPressChar, char]);
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId: 'search-content',
    order,
    onEnter: handleSelect,
  });

  return (
    <button
      ref={ref}
      id={id}
      data-testid={id}
      type="button"
      tabIndex={-1}
      aria-label={`Key ${char.toUpperCase()}`}
      onClick={handleSelect}
      className={`flex-1 h-12 rounded-xl font-bold text-xl uppercase flex items-center justify-center cursor-pointer outline-none select-none transition-transform duration-75 ${className} ${
        isFocused
          ? 'bg-[#ff7a18] text-white border-2 border-[#FFB800] tv-focus-ring'
          : 'bg-[#14151c] text-[#F5E5E5] border border-[rgba(255,255,255,0.08)] hover:bg-[#292a2f]'
      }`}
    >
      {char.toUpperCase()}
    </button>
  );
});

interface SearchFilterButtonProps {
  value: SearchFilterType;
  label: string;
  order: number;
  isActive: boolean;
  marginClass: string;
  onSelectFilter: (filter: SearchFilterType) => void;
}

const SearchFilterButton = memo(function SearchFilterButton({
  value,
  label,
  order,
  isActive,
  marginClass,
  onSelectFilter,
}: SearchFilterButtonProps) {
  const id = `search-filter-${value}`;
  const handleSelect = useCallback(() => onSelectFilter(value), [onSelectFilter, value]);
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId: 'search-content',
    order,
    onEnter: handleSelect,
  });

  return (
    <button
      ref={ref}
      id={id}
      data-testid={id}
      type="button"
      tabIndex={-1}
      aria-pressed={isActive}
      onClick={handleSelect}
      className={`px-4 py-2 rounded-full text-sm font-bold tracking-wide whitespace-nowrap cursor-pointer outline-none select-none transition-transform duration-75 ${marginClass} ${
        isFocused
          ? 'bg-[#ff7a18] text-white border-2 border-[#FFB800] tv-focus-ring'
          : isActive
          ? 'bg-[#ff7a18]/20 text-[#ffb871] border border-[#ff7a18]/60'
          : 'bg-[#1a1b21] text-[#e3e1e9] border border-[rgba(255,255,255,0.08)] hover:bg-[#292a2f]'
      }`}
    >
      {label}
    </button>
  );
});

interface SearchStateActionButtonProps {
  id: 'search-reset-filter-btn' | 'search-retry-btn';
  label: string;
  onSelect: () => void;
}

const SearchStateActionButton = memo(function SearchStateActionButton({
  id,
  label,
  onSelect,
}: SearchStateActionButtonProps) {
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId: 'search-content',
    order: 100,
    onEnter: onSelect,
  });

  return (
    <button
      ref={ref}
      id={id}
      data-testid={id}
      type="button"
      tabIndex={-1}
      onClick={onSelect}
      className={`px-6 py-3 rounded-xl font-bold text-base inline-flex items-center cursor-pointer outline-none select-none transition-transform duration-75 ${
        isFocused
          ? 'bg-[#ff7a18] text-white border-2 border-[#FFB800] tv-focus-ring'
          : 'bg-[#292a2f] text-[#F5E5E5] border border-[rgba(255,122,24,0.3)] hover:bg-[#38393f]'
      }`}
    >
      <RotateCcw className="w-4 h-4 shrink-0" style={{ marginRight: '8px' }} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
});

interface SearchResultCardProps {
  item: SearchResultItem;
  order: number;
  colIndex: number;
  serverUrl: string;
  token?: string;
  unlockTokens: string[];
  onSelectItem: (itemId: number | string) => void;
}

const SearchResultCard = memo(function SearchResultCard({
  item,
  order,
  colIndex,
  serverUrl,
  token,
  unlockTokens,
  onSelectItem,
}: SearchResultCardProps) {
  const cardId = `search-card-${item.id}`;
  const handleSelect = useCallback(() => onSelectItem(item.id), [onSelectItem, item.id]);
  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id: cardId,
    groupId: 'search-content',
    order,
    onEnter: handleSelect,
  });

  const posterUrl = useMemo(
    () => getAuthenticatedImageUrl(serverUrl, item.poster_url, token, unlockTokens),
    [serverUrl, item.poster_url, token, unlockTokens]
  );

  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const imgFailed = Boolean(posterUrl && failedPosterUrl === posterUrl);

  const typeBadge = formatResultTypeBadge(item);
  const statusBadge = getResultStatusBadge(item);
  const subtitle = formatResultSubtitle(item);
  const progress = item.playback_progress ?? 0;

  return (
    <div
      ref={ref}
      id={cardId}
      data-testid={cardId}
      data-search-col={String(colIndex)}
      tabIndex={-1}
      role="button"
      aria-label={item.title}
      onClick={handleSelect}
      className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer outline-none transition-transform duration-75 ${
        isFocused
          ? 'bg-[#292a2f] scale-[1.02] z-20 tv-focus-ring border-2 border-[#ff7a18]'
          : 'bg-[#14151c] border border-[rgba(255,255,255,0.08)] hover:bg-[#1c1d26]'
      }`}
    >
      <div
        className="w-full relative overflow-hidden bg-[#1a1b21] shrink-0"
        style={{ height: '288px' }}
      >
        {posterUrl && !imgFailed ? (
          <img
            src={posterUrl}
            alt={item.title}
            loading="lazy"
            decoding="async"
            onError={() => setFailedPosterUrl(posterUrl)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#281216] via-[#1a1b21] to-[#0d0e15] text-5xl font-black text-[#ff9f2e]/60">
            {item.title.slice(0, 1).toUpperCase() || '?'}
          </div>
        )}

        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-[#0d0e15]/90 border border-[rgba(255,255,255,0.16)] font-mono text-[11px] font-bold text-[#e3e1e9] z-10">
          {typeBadge}
        </span>

        {statusBadge && (
          <span
            className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded font-mono text-[11px] font-bold z-10 ${
              statusBadge === 'WATCHED'
                ? 'bg-[#10b981]/90 text-[#090a0f]'
                : 'bg-[#D43F15] text-white'
            }`}
          >
            {statusBadge}
          </span>
        )}

        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/75 z-10">
            <div
              className="h-full bg-[#ff7a18]"
              style={{
                width: `${Math.min(100, Math.max(0, Math.round(progress * 100)))}%`,
              }}
            />
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 justify-between">
        <h3
          dir="auto"
          className={`text-lg font-bold truncate ${
            isFocused ? 'text-white' : 'text-[#F5E5E5]'
          }`}
        >
          {item.title}
        </h3>
        {subtitle && (
          <p
            dir="auto"
            className="text-sm text-[#a8a29e] truncate"
            style={{ marginTop: '4px' }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
});

const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gridGap: '24px',
};

export function SearchView({
  client,
  serverUrl,
  token,
  refreshKey,
  initialFocusId,
  onInitialFocusConsumed,
  onSelectItem,
  onPlayItem,
  onNavigateToSidebar,
}: SearchViewProps): JSX.Element {
  const { focusedId, setFocusedId } = useFocusContext();
  const focusStore = useFocusStore();

  const initialSaved = useMemo(() => getSavedSearchState(), []);
  const [query, setQuery] = useState<string>(initialSaved.query);
  const [activeFilter, setActiveFilter] = useState<SearchFilterType>(initialSaved.filter);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(() => Boolean(initialSaved.query.trim()));
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const [isEditingInput, setIsEditingInput] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingEditFocusRef = useRef<boolean>(false);
  const lastKeyboardFocusIdRef = useRef<string>('search-key-a');
  const lastStartedQueryRef = useRef<string>(initialSaved.query);

  const resultsRef = useRef(results);
  resultsRef.current = results;
  const activeFilterRef = useRef(activeFilter);
  activeFilterRef.current = activeFilter;
  const queryRef = useRef(query);
  queryRef.current = query;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const errorRef = useRef(error);
  errorRef.current = error;
  const onPlayItemRef = useRef(onPlayItem);
  onPlayItemRef.current = onPlayItem;
  const onNavigateToSidebarRef = useRef(onNavigateToSidebar);
  onNavigateToSidebarRef.current = onNavigateToSidebar;

  const unlockTokens = useMemo(
    () => (client?.getUnlockTokens ? client.getUnlockTokens() : []),
    [client, refreshKey]
  );

  // Persist query & filter across unmount/remount within session
  useEffect(() => {
    setSavedSearchState({ query, filter: activeFilter });
  }, [query, activeFilter]);

  // Debounced search on query changes, immediate (0ms) on filter/refresh/retry/restore
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      lastStartedQueryRef.current = '';
      setResults([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const isQueryChange = lastStartedQueryRef.current !== query;

    const runSearch = () => {
      lastStartedQueryRef.current = query;
      setLoading(true);
      setError(null);

      fetchSearchResults(client, {
        q: trimmed,
        itemType: activeFilter,
        signal: controller.signal,
      })
        .then((res) => {
          if (cancelled || controller.signal.aborted) return;
          setResults(Array.isArray(res.items) ? res.items : []);
          setTotal(typeof res.total === 'number' ? res.total : 0);
          setLoading(false);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          const msg = err instanceof Error ? err.message : 'Failed to search library';
          setError(msg || 'Failed to search library');
          setLoading(false);
        });
    };

    if (isQueryChange) {
      const timerId = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(timerId);
        controller.abort();
      };
    }

    runSearch();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, query, activeFilter, refreshKey, retryNonce]);

  const enterInputEditMode = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    if (focusStore.getFocusedId() !== 'search-query-input') {
      pendingEditFocusRef.current = true;
      setFocusedId('search-query-input');
    }
    setIsEditingInput(true);
    input.focus();
    try {
      const len = input.value.length;
      input.setSelectionRange?.(len, len);
    } catch {
      // Ignored for environments/inputs without selection range support
    }
  }, [focusStore, setFocusedId]);

  const exitInputEditMode = useCallback(
    (nextFocusId: string) => {
      pendingEditFocusRef.current = false;
      inputRef.current?.blur();
      setIsEditingInput(false);
      if (isLeftPaneNodeId(nextFocusId)) {
        lastKeyboardFocusIdRef.current = nextFocusId;
      }
      setFocusedId(nextFocusId);
      focusDomNode(nextFocusId);
    },
    [setFocusedId]
  );

  const inputBarFocus = useFocusable<HTMLDivElement>({
    id: 'search-query-input',
    groupId: 'search-content',
    order: 1,
    onEnter: enterInputEditMode,
  });

  // Preserve direct <input> focus when mouse-clicked from another focused node
  useEffect(() => {
    if (inputBarFocus.isFocused && pendingEditFocusRef.current) {
      pendingEditFocusRef.current = false;
      inputRef.current?.focus();
    }
  }, [inputBarFocus.isFocused]);

  // Keep lastKeyboardFocusIdRef updated whenever focus changes onto any Left Pane node
  useEffect(() => {
    if (isLeftPaneNodeId(focusedId) && focusedId) {
      lastKeyboardFocusIdRef.current = focusedId;
    }
  }, [focusedId]);

  // Capture-phase D-pad matrix, native IME handling, and physical Play shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnyModalActive(focusStore.getActiveTrap())) {
        return;
      }

      const code = e.keyCode || e.which;
      const inputEl = inputRef.current;
      const editingNow = Boolean(
        inputEl && typeof document !== 'undefined' && document.activeElement === inputEl
      );

      if (editingNow) {
        if (code === TVKeys.BACKSPACE || e.key === 'Backspace') {
          return;
        }
        if (
          code === TVKeys.LEFT ||
          code === TVKeys.RIGHT ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight'
        ) {
          return;
        }
        if (code === TVKeys.ENTER || e.key === 'Enter') {
          if (e.isComposing || code === 229) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          exitInputEditMode('search-query-input');
          return;
        }
        if (
          code === TVKeys.IME_DONE ||
          code === TVKeys.IME_CANCEL ||
          code === TVKeys.BACK_TIZEN ||
          code === TVKeys.BACK_WEB ||
          e.key === 'Escape'
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          exitInputEditMode('search-query-input');
          return;
        }
        if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          exitInputEditMode('search-action-space');
          return;
        }
        if (code === TVKeys.UP || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          exitInputEditMode('search-query-input');
          return;
        }
        return;
      }

      const currentId = focusStore.getFocusedId();
      if (!isSearchContentNodeId(currentId) || !currentId) {
        return;
      }

      if (
        currentId === 'search-query-input' &&
        (code === TVKeys.ENTER || e.key === 'Enter')
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        enterInputEditMode();
        return;
      }

      if (
        (code === TVKeys.PLAY ||
          code === TVKeys.PLAY_PAUSE ||
          e.key === 'MediaPlay' ||
          e.key === 'MediaPlayPause') &&
        currentId.startsWith('search-card-')
      ) {
        const matched = resultsRef.current.find(
          (item) => `search-card-${item.id}` === currentId
        );
        if (matched) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const resumeSentinel =
            matched.item_type === 'live_channel'
              ? 0
              : toResumePercentageSentinel(matched.playback_progress ?? undefined);
          onPlayItemRef.current(matched.id, resumeSentinel, matched.title);
        }
        return;
      }

      let direction: ArrowDirection | null = null;
      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') direction = 'left';
      else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') direction = 'right';
      else if (code === TVKeys.UP || e.key === 'ArrowUp') direction = 'up';
      else if (code === TVKeys.DOWN || e.key === 'ArrowDown') direction = 'down';

      if (!direction) return;

      const activeResults = resultsRef.current;
      const currentFilter = activeFilterRef.current;
      const isIdleOrLoading =
        !queryRef.current.trim() || loadingRef.current;
      const hasResults =
        !isIdleOrLoading && !errorRef.current && activeResults.length > 0;
      const rightPaneEntryId = hasResults
        ? `search-card-${activeResults[0].id}`
        : `search-filter-${currentFilter}`;
      const hasResetFilterBtn =
        !loadingRef.current &&
        !errorRef.current &&
        Boolean(queryRef.current.trim()) &&
        activeResults.length === 0 &&
        currentFilter !== 'all';
      const hasRetryBtn =
        !loadingRef.current &&
        Boolean(errorRef.current) &&
        Boolean(queryRef.current.trim());

      const outcome = resolveSearchArrowNavigation({
        currentId,
        direction,
        results: hasResults ? activeResults : [],
        activeFilter: currentFilter,
        lastKeyboardFocusId: lastKeyboardFocusIdRef.current,
        rightPaneEntryId,
        hasResetFilterBtn,
        hasRetryBtn,
      });

      if (!outcome) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (outcome.type === 'sidebar') {
        onNavigateToSidebarRef.current?.();
        return;
      }
      if (outcome.type === 'focus') {
        if (isLeftPaneNodeId(outcome.targetId)) {
          lastKeyboardFocusIdRef.current = outcome.targetId;
        }
        setFocusedId(outcome.targetId);
        focusDomNode(outcome.targetId);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [focusStore, setFocusedId, enterInputEditMode, exitInputEditMode]);

  const handlePressChar = useCallback((ch: string) => {
    setQuery((prev) => `${prev}${ch}`);
  }, []);

  const handleSpace = useCallback(() => {
    setQuery((prev) => (prev.length > 0 && !prev.endsWith(' ') ? `${prev} ` : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setQuery((prev) => Array.from(prev).slice(0, -1).join(''));
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
  }, []);

  const handleSelectFilter = useCallback((nextFilter: SearchFilterType) => {
    if (nextFilter !== activeFilterRef.current && queryRef.current.trim()) {
      setLoading(true);
      setError(null);
    }
    setActiveFilter(nextFilter);
  }, []);

  const handleResetFilter = useCallback(() => {
    if (activeFilterRef.current !== 'all' && queryRef.current.trim()) {
      setLoading(true);
      setError(null);
    }
    setActiveFilter('all');
  }, []);

  const handleRetry = useCallback(() => {
    if (queryRef.current.trim()) {
      setLoading(true);
      setError(null);
    }
    setRetryNonce((n) => n + 1);
  }, []);

  const keyboardRows = useMemo(() => {
    const rows: string[][] = [];
    for (let r = 0; r < 6; r++) {
      rows.push(KEYBOARD_KEYS.slice(r * KEYBOARD_COLS, (r + 1) * KEYBOARD_COLS));
    }
    return rows;
  }, []);

  const trimmedQuery = query.trim();
  const firstResultId = results.length > 0 ? results[0].id : null;

  return (
    <div data-testid="search-view" className="w-full pb-16 flex items-start select-none">
      <SearchFocusBridge
        loading={loading}
        firstResultId={firstResultId}
        activeFilter={activeFilter}
        initialFocusId={initialFocusId}
        hasInitialQuery={Boolean(initialSaved.query.trim())}
        onInitialFocusConsumed={onInitialFocusConsumed}
      />

      {/* Left Pane: IME Input Bar + Utility Actions + 6x6 Alphanumeric Keyboard */}
      <aside className="w-[420px] shrink-0 mr-10">
        <div className="flex items-center mb-5">
          <div
            className="w-12 h-12 rounded-2xl bg-[#281216] border border-[#ff7a18]/30 flex items-center justify-center shrink-0 mr-4"
            aria-hidden="true"
          >
            <Search className="w-6 h-6 text-[#ff7a18]" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#F5E5E5]">Search</h1>
            <p className="text-sm text-[#a8a29e]">Titles, episodes, directors &amp; genres</p>
          </div>
        </div>

        {/* Focusable Native Input Wrapper (Enter activates Tizen system IME) */}
        <label htmlFor="search-native-input" className="sr-only">
          Search query
        </label>
        <div
          ref={inputBarFocus.ref}
          id="search-query-input"
          data-testid="search-query-input"
          role="button"
          tabIndex={-1}
          aria-label="Search query input"
          onClick={enterInputEditMode}
          className={`w-full rounded-2xl px-4 py-3.5 mb-3 flex items-center cursor-pointer outline-none transition-transform duration-75 ${
            isEditingInput
              ? 'bg-[#292a2f] border-2 border-[#FFB800] tv-focus-ring'
              : inputBarFocus.isFocused
              ? 'bg-[#292a2f] border-2 border-[#ff7a18] tv-focus-ring'
              : 'bg-[#14151c] border border-[rgba(255,255,255,0.12)]'
          }`}
        >
          <Search
            className="w-5 h-5 text-[#ff9f2e] shrink-0 mr-3"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id="search-native-input"
            data-testid="search-native-input"
            type="text"
            dir="auto"
            tabIndex={-1}
            value={query}
            placeholder="Type or use keypad..."
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (focusStore.getFocusedId() !== 'search-query-input') {
                pendingEditFocusRef.current = true;
                setFocusedId('search-query-input');
              }
              setIsEditingInput(true);
            }}
            onBlur={() => setIsEditingInput(false)}
            className="w-full bg-transparent text-xl font-semibold text-white placeholder-[#6e6865] outline-none"
          />
          <span className="ml-2 px-2 py-0.5 rounded bg-[#1a1b21] border border-[rgba(255,255,255,0.08)] font-mono text-[10px] uppercase text-[#a8a29e] shrink-0">
            {isEditingInput ? 'IME' : 'OK'}
          </span>
        </div>

        {/* Utility Row: Space, Backspace, Clear */}
        <div className="flex items-center mb-3">
          {ACTION_BUTTONS.map((btn, idx) => (
            <SearchActionButton
              key={btn.id}
              id={btn.id}
              label={btn.label}
              ariaLabel={btn.ariaLabel}
              order={2 + idx}
              className={btn.widthClass}
              onAction={
                btn.id === 'search-action-space'
                  ? handleSpace
                  : btn.id === 'search-action-backspace'
                  ? handleBackspace
                  : handleClear
              }
            />
          ))}
        </div>

        {/* 6x6 Alphanumeric Grid (A-Z + 0-9) */}
        <div>
          {keyboardRows.map((rowChars, rowIdx) => (
            <div
              key={rowIdx}
              className={`flex items-center ${rowIdx < keyboardRows.length - 1 ? 'mb-2' : ''}`}
            >
              {rowChars.map((ch, colIdx) => {
                const flatIndex = rowIdx * KEYBOARD_COLS + colIdx;
                return (
                  <SearchKeyButton
                    key={ch}
                    char={ch}
                    order={10 + flatIndex}
                    className={colIdx < KEYBOARD_COLS - 1 ? 'mr-2' : 'mr-0'}
                    onPressChar={handlePressChar}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Right Pane: Filter Strip + Results Grid / Discovery / Loading / Error */}
      <section className="flex-1 min-w-0 flex flex-col">
        <div
          role="toolbar"
          aria-label="Media type filters"
          className="flex flex-wrap items-center mb-4"
        >
          {SEARCH_FILTERS.map((filter, idx) => (
            <SearchFilterButton
              key={filter.value}
              value={filter.value}
              label={filter.label}
              order={50 + idx}
              isActive={activeFilter === filter.value}
              marginClass={idx < SEARCH_FILTERS.length - 1 ? 'mr-3 mb-2' : 'mb-2'}
              onSelectFilter={handleSelectFilter}
            />
          ))}
        </div>

        {trimmedQuery && !loading && !error && (
          <div
            aria-live="polite"
            className="flex items-center justify-between mb-5 text-sm text-[#a8a29e]"
          >
            <span>
              {total} {total === 1 ? 'result' : 'results'} for &ldquo;{trimmedQuery}&rdquo;
            </span>
            {results.length > 0 && (
              <span className="font-mono text-xs text-[#ffb871]">
                [OK] Details &bull; [PLAY] Quick Play
              </span>
            )}
          </div>
        )}

        {!trimmedQuery ? (
          <div
            data-testid="search-idle-state"
            className="rounded-3xl bg-[#14151c] border border-[rgba(255,255,255,0.08)] p-10 flex flex-col items-start"
          >
            <div className="flex items-center mb-4">
              <div
                className="w-12 h-12 rounded-2xl bg-[#281216] border border-[#ff7a18]/30 flex items-center justify-center mr-4"
                aria-hidden="true"
              >
                <Compass className="w-6 h-6 text-[#ff9f2e]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#F5E5E5]">
                  Search Across Your Library
                </h2>
                <p className="text-base text-[#a8a29e]">
                  Titles, TV Episodes, Directors &amp; Genres
                </p>
              </div>
            </div>
            <p className="text-base text-[#a8a29e] mb-6 max-w-2xl">
              Use the D-pad keypad on the left for one-thumb typing, or select the search bar
              and press <strong className="text-white">[OK]</strong> to open your TV&apos;s
              native keyboard for Arabic and international titles.
            </p>
            <div className="flex flex-wrap items-center">
              <div className="px-4 py-2.5 rounded-xl bg-[#1a1b21] border border-[rgba(255,255,255,0.08)] flex items-center mr-3 mb-2 text-sm text-[#e3e1e9]">
                <Film className="w-4 h-4 text-[#ff9f2e] mr-2" aria-hidden="true" />
                <span>Movies &amp; Directors</span>
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-[#1a1b21] border border-[rgba(255,255,255,0.08)] flex items-center mr-3 mb-2 text-sm text-[#e3e1e9]">
                <Tv className="w-4 h-4 text-[#ffb871] mr-2" aria-hidden="true" />
                <span>Shows &amp; Episodes</span>
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-[#1a1b21] border border-[rgba(255,255,255,0.08)] flex items-center mb-2 text-sm text-[#e3e1e9]">
                <Sparkles className="w-4 h-4 text-[#10b981] mr-2" aria-hidden="true" />
                <span>Anime, Music, Books &amp; Live</span>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div
            data-testid="search-loading"
            className="w-full py-24 flex items-center justify-center text-[#a8a29e] text-2xl"
          >
            <Loader2
              className="w-8 h-8 animate-spin text-[#ff7a18] mr-3"
              aria-hidden="true"
            />
            <span>Searching...</span>
          </div>
        ) : error ? (
          <div
            data-testid="search-error-state"
            className="rounded-3xl bg-[#14151c] border border-[#D43F15]/40 p-10 flex flex-col items-center text-center"
          >
            <AlertTriangle
              className="w-12 h-12 text-[#D43F15] mb-4"
              aria-hidden="true"
            />
            <h2 className="text-2xl font-bold text-[#F5E5E5] mb-2">
              Search Failed
            </h2>
            <p className="text-base text-[#a8a29e] mb-6">{error}</p>
            <SearchStateActionButton
              id="search-retry-btn"
              label="Retry Search"
              onSelect={handleRetry}
            />
          </div>
        ) : results.length === 0 ? (
          <div
            data-testid="search-empty-state"
            className="rounded-3xl bg-[#14151c] border border-[rgba(255,255,255,0.08)] p-10 flex flex-col items-center text-center"
          >
            <Search
              className="w-12 h-12 text-[#a8a29e] mb-4"
              aria-hidden="true"
            />
            <h2 className="text-2xl font-bold text-[#F5E5E5] mb-2">
              No matches found for &ldquo;{trimmedQuery}&rdquo;
            </h2>
            <p className="text-base text-[#a8a29e] mb-6">
              {activeFilter !== 'all'
                ? 'Try clearing the active category filter or refining your search query.'
                : 'Check your spelling or try searching by title, director, or genre.'}
            </p>
            {activeFilter !== 'all' && (
              <SearchStateActionButton
                id="search-reset-filter-btn"
                label="Show All Categories"
                onSelect={handleResetFilter}
              />
            )}
          </div>
        ) : (
          <div
            data-testid="search-results-grid"
            className="grid"
            style={GRID_STYLE}
          >
            {results.map((item, idx) => (
              <SearchResultCard
                key={item.id}
                item={item}
                order={100 + idx}
                colIndex={idx % GRID_COLS}
                serverUrl={serverUrl}
                token={token}
                unlockTokens={unlockTokens}
                onSelectItem={onSelectItem}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
