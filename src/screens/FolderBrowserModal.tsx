import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { ApiClient } from '../api/client';
import { fetchLibraryFolders } from '../api/folders';
import { FolderImage, LibraryFolderResponse } from '../types/kadr';
import { useFocusContext } from '../navigation/FocusContext';
import { useFocusable } from '../navigation/useFocusable';
import { TVButton } from '../components/tv/TVButton';
import { PillButton } from '../components/tv/PillButton';
import { TVKeys } from '../navigation/keys';
import { Folder, Play, Loader2, Lock, ImageIcon, ArrowLeft, X, ListPlus, Film } from 'lucide-react';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';
import { toResumePercentageSentinel } from '../utils/playbackProgress';
import {
  computeVirtualRowWindow,
  DEFAULT_GRID_VIEWPORT_HEIGHT_PX,
  VIRTUAL_GRID_ITEM_THRESHOLD,
  VirtualRowWindow,
} from '../utils/virtualWindow';
import {
  AddToPlaylistModal,
  AddToPlaylistTarget,
} from '../components/playlists/AddToPlaylistModal';
import type { PlaylistQueuePlayItem } from './PlaylistDetailModal';

export interface FolderBrowserModalProps {
  client: ApiClient;
  serverUrl: string;
  token?: string;
  libraryId: string;
  initialPath?: string;
  initialFocusItemId?: number | string;
  onClose: () => void;
  onSelectItem: (itemId: number | string) => void;
  onSelectImage: (images: FolderImage[], initialIndex: number) => void;
  onStartSlideshow: (images: FolderImage[]) => void;
  onPlayQueue?: (queue: PlaylistQueuePlayItem[], startIndex: number) => void;
  onLockedLibrary?: (libraryId: string) => void;
  onAddToPlaylist?: (target: AddToPlaylistTarget) => void;
  onPlaylistChanged?: () => void;
  onPathChange?: (path: string) => void;
  isOpen?: boolean;
  refreshKey?: number;
}

const GRID_COLS = 6;
const PAGE_JUMP_ROWS = 5;
const GRID_ROW_SPACING_PX = 24;
const SECTION_ROW_METRICS = {
  dir: { rowHeightPx: 96, rowSpacingPx: GRID_ROW_SPACING_PX },
  item: { rowHeightPx: 364, rowSpacingPx: GRID_ROW_SPACING_PX },
  image: { rowHeightPx: 216, rowSpacingPx: GRID_ROW_SPACING_PX },
} as const;
type GridSectionKey = keyof typeof SECTION_ROW_METRICS;

function buildGridStyle(win: VirtualRowWindow): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gridGap: '24px',
    ...(win.isVirtualized
      ? {
          paddingTop: `${win.topSpacerPx}px`,
          paddingBottom: `${win.bottomSpacerPx}px`,
        }
      : {}),
  };
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  if (i === 0) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatImageUrl(serverUrl: string, path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanServer = serverUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanServer}${cleanPath}`;
}

function chunkIntoRows(ids: string[], cols: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < ids.length; i += cols) {
    rows.push(ids.slice(i, i + cols));
  }
  return rows;
}

function scrollElementIntoViewIfClipped(el: HTMLElement | null) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  const container = el.closest('[data-folder-scroll-container="true"]') as HTMLElement | null;
  if (container) {
    const cRect = container.getBoundingClientRect();
    if (cRect.height > 0) {
      if (rect.top >= cRect.top && rect.bottom <= cRect.bottom) {
        return;
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
  }

  const vh = typeof window !== 'undefined' ? window.innerHeight || 1080 : 1080;
  if (rect.top >= 0 && rect.bottom <= vh) return;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

interface FolderDirItemProps {
  id: string;
  order?: number;
  name: string;
  path: string;
  itemCount: number;
  onNavigate: (path: string, nodeId: string) => void;
}

const FolderDirItem = memo(function FolderDirItem({
  id,
  order,
  name,
  path,
  itemCount,
  onNavigate,
}: FolderDirItemProps) {
  const handleActivate = useCallback(() => {
    onNavigate(path, id);
  }, [onNavigate, path, id]);

  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId: 'folder-browser-modal',
    order,
    onEnter: handleActivate,
  });

  useEffect(() => {
    if (isFocused) {
      scrollElementIntoViewIfClipped(ref.current);
    }
  }, [isFocused, ref]);

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      tabIndex={-1}
      data-focused={isFocused ? 'true' : 'false'}
      onClick={handleActivate}
      className={`flex items-center justify-start p-5 rounded-2xl text-left min-w-0 outline-none select-none cursor-pointer transition-transform duration-75 ${
        isFocused
          ? 'tv-focus-ring bg-[#2c1610] border-2 border-[#FF6B00] ring-2 ring-[#FFB800] text-white scale-[1.03] z-20'
          : 'bg-[#1c0909] border-2 border-[rgba(245,229,229,0.10)] text-[#F5E5E5] scale-100'
      }`}
    >
      <Folder
        className="w-10 h-10 text-[#FF6B00] shrink-0"
        style={{ marginRight: '16px' }}
      />
      <div className="flex flex-col truncate min-w-0">
        <span
          className={`font-bold text-xl truncate ${
            isFocused ? 'text-white' : 'text-[#F5E5E5]'
          }`}
        >
          {name}
        </span>
        <span className={`text-base ${isFocused ? 'text-[#FFB800]' : 'text-[#8a6a6a]'}`}>
          {itemCount} items
        </span>
      </div>
    </button>
  );
});

interface FolderMediaCardProps {
  id: string;
  order?: number;
  itemId: number | string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  progressPercent?: number;
  onSelectItemId: (itemId: number | string, nodeId: string) => void;
}

const FolderMediaCard = memo(function FolderMediaCard({
  id,
  order,
  itemId,
  title,
  subtitle,
  imageUrl,
  badge,
  progressPercent,
  onSelectItemId,
}: FolderMediaCardProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  const handleActivate = useCallback(() => {
    onSelectItemId(itemId, id);
  }, [onSelectItemId, itemId, id]);

  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id,
    groupId: 'folder-browser-modal',
    order,
    onEnter: handleActivate,
  });

  useEffect(() => {
    if (isFocused) {
      scrollElementIntoViewIfClipped(ref.current);
    }
  }, [isFocused, ref]);

  return (
    <div
      ref={ref}
      id={id}
      tabIndex={-1}
      role="button"
      aria-label={title}
      data-focused={isFocused ? 'true' : 'false'}
      onClick={handleActivate}
      className={`relative flex flex-col rounded-xl overflow-hidden outline-none select-none cursor-pointer transition-transform duration-75 ${
        isFocused
          ? 'tv-focus-ring bg-[#2c1610] border-2 border-[#FF6B00] ring-2 ring-[#FFB800] scale-[1.03] z-20'
          : 'bg-[#1c0909] border-2 border-[rgba(245,229,229,0.10)] scale-100 opacity-95'
      }`}
    >
      <div className="w-full h-72 bg-[#120404] relative overflow-hidden flex items-center justify-center">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 text-center text-[#8a6a6a]">
            <Film className="w-12 h-12 text-[#5C3C3C]" />
          </div>
        )}

        {badge && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#0d0e15]/95 text-xs font-bold text-[#FFB800] border border-[rgba(255,184,0,0.35)]">
            {badge}
          </span>
        )}

        {progressPercent !== undefined && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#0d0e15]">
            <div
              className="h-full bg-[#FF6B00]"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        )}
      </div>

      <div className={`p-3 ${isFocused ? 'bg-[#3d1c10]' : 'bg-[#1c0909]'}`}>
        <div
          className={`text-base font-bold truncate ${
            isFocused ? 'text-white' : 'text-[#F5E5E5]'
          }`}
          title={title}
        >
          {title}
        </div>
        {subtitle && (
          <div
            className={`text-sm truncate mt-0.5 ${
              isFocused ? 'text-[#FFB800]' : 'text-[#8a6a6a]'
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
});

interface FolderPhotoCardProps {
  id: string;
  order?: number;
  image: FolderImage;
  index: number;
  imageUrl?: string;
  onSelectPhoto: (index: number, nodeId: string) => void;
}

const FolderPhotoCard = memo(function FolderPhotoCard({
  id,
  order,
  image,
  index,
  imageUrl,
  onSelectPhoto,
}: FolderPhotoCardProps) {
  const [hasError, setHasError] = useState(false);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setHasError(false);
  }, [imageUrl]);

  const handleActivate = useCallback(() => {
    onSelectPhoto(index, id);
  }, [onSelectPhoto, index, id]);

  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id,
    groupId: 'folder-browser-modal',
    order,
    onEnter: handleActivate,
  });

  useEffect(() => {
    if (isFocused) {
      scrollElementIntoViewIfClipped(ref.current);
    }
  }, [isFocused, ref]);

  return (
    <div
      ref={ref}
      id={id}
      tabIndex={-1}
      role="button"
      data-focused={isFocused ? 'true' : 'false'}
      onClick={handleActivate}
      className={`relative flex flex-col rounded-xl overflow-hidden cursor-pointer outline-none select-none transition-transform duration-75 ${
        isFocused
          ? 'tv-focus-ring bg-[#2c1610] border-2 border-[#FF6B00] ring-2 ring-[#FFB800] scale-[1.03] z-20'
          : 'bg-[#1c0909] border-2 border-[rgba(245,229,229,0.10)] scale-100 opacity-90'
      }`}
    >
      <div className="w-full h-36 bg-[#120404] relative overflow-hidden flex items-center justify-center">
        {hasError || !imageUrl ? (
          <ImageIcon className="w-10 h-10 text-[#5C3C3C]" data-testid="image-fallback-icon" />
        ) : (
          <img
            src={imageUrl}
            alt={image.name}
            loading="lazy"
            decoding="async"
            onError={() => setHasError(true)}
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className={`p-3 ${isFocused ? 'bg-[#3d1c10]' : 'bg-[#1c0909]'}`}>
        <div
          className={`text-sm font-semibold truncate ${
            isFocused ? 'text-white' : 'text-[#F5E5E5]'
          }`}
          title={image.name}
        >
          {image.name}
        </div>
        <div className={`text-xs mt-1 ${isFocused ? 'text-[#FFB800]' : 'text-[#8a6a6a]'}`}>
          {formatBytes(image.size_bytes)}
        </div>
      </div>
    </div>
  );
});

interface FolderFocusBridgeProps {
  isOpen: boolean;
  loading: boolean;
  isLocked: boolean;
  error: string | null;
  folderData: LibraryFolderResponse | null;
  libraryId: string;
  currentPath: string;
  initialFocusItemId?: number | string;
  hasInternalModal: boolean;
  validNodeIds: Set<string>;
  contentRows: string[][];
  dialogRef: React.RefObject<HTMLDivElement | null>;
  exitedChildPathRef: React.MutableRefObject<string | null>;
  autoFocusedFolderKeyRef: React.MutableRefObject<string | null>;
  lastFocusedItemIdRef: React.MutableRefObject<string | null>;
  pendingWindowFocusIdRef: React.MutableRefObject<string | null>;
  setFocusedIdRef: React.MutableRefObject<((id: string | null) => void) | null>;
  goBackRef: React.MutableRefObject<() => void>;
  requestNodeFocus: (nextId: string) => void;
  syncTargetFocusId: (nextId: string) => void;
}

const FolderFocusBridge = memo(function FolderFocusBridge({
  isOpen,
  loading,
  isLocked,
  error,
  folderData,
  libraryId,
  currentPath,
  initialFocusItemId,
  hasInternalModal,
  validNodeIds,
  contentRows,
  dialogRef,
  exitedChildPathRef,
  autoFocusedFolderKeyRef,
  lastFocusedItemIdRef,
  pendingWindowFocusIdRef,
  setFocusedIdRef,
  goBackRef,
  requestNodeFocus,
  syncTargetFocusId,
}: FolderFocusBridgeProps) {
  const { focusedId, setFocusedId, pushTrap, popTrap, activeTrap } = useFocusContext();
  setFocusedIdRef.current = setFocusedId;

  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;

  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;

  const contentRowsRef = useRef(contentRows);
  contentRowsRef.current = contentRows;

  // Trap lifecycle: push only our trap on open, pop ONLY 'folder-browser-modal' on close
  useEffect(() => {
    if (!isOpen) {
      autoFocusedFolderKeyRef.current = null;
      exitedChildPathRef.current = null;
      return;
    }
    pushTrap('folder-browser-modal');
    return () => {
      popTrap('folder-browser-modal');
    };
  }, [isOpen, pushTrap, popTrap, autoFocusedFolderKeyRef, exitedChildPathRef]);

  const hasOtherStackedModal = useCallback((): boolean => {
    if (hasInternalModal) return true;
    if (activeTrapRef.current && activeTrapRef.current !== 'folder-browser-modal') {
      return true;
    }
    if (typeof document !== 'undefined') {
      const modals = document.querySelectorAll(
        '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-modal-overlay="true"]'
      );
      for (let i = 0; i < modals.length; i++) {
        const m = modals[i];
        if (dialogRef.current && (m === dialogRef.current || dialogRef.current.contains(m))) {
          continue;
        }
        return true;
      }
    }
    return false;
  }, [hasInternalModal, dialogRef]);

  // Self-heal trap if FolderBrowserModal is open with no child modal above it and activeTrap was cleared
  useEffect(() => {
    if (!isOpen) return;
    if (!activeTrap && !hasOtherStackedModal()) {
      pushTrap('folder-browser-modal');
    }
  }, [isOpen, activeTrap, hasOtherStackedModal, pushTrap]);

  // Blur any stray background native DOM focus while FolderBrowserModal is the active modal
  useEffect(() => {
    if (!isOpen) return;
    if (activeTrap && activeTrap !== 'folder-browser-modal') return;
    if (hasOtherStackedModal()) return;
    if (typeof document !== 'undefined') {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        activeEl !== document.body &&
        dialogRef.current &&
        !dialogRef.current.contains(activeEl) &&
        typeof activeEl.blur === 'function'
      ) {
        activeEl.blur();
      }
    }
  }, [isOpen, activeTrap, focusedId, hasOtherStackedModal, dialogRef]);

  const computePreferredFocusId = useCallback((): string => {
    if (isLocked) {
      return 'folder-unlock-library-btn';
    }

    if (!error && folderData) {
      if (exitedChildPathRef.current && folderData.directories?.length) {
        const returnedIdx = folderData.directories.findIndex(
          (d) => d.path === exitedChildPathRef.current
        );
        exitedChildPathRef.current = null;
        if (returnedIdx !== -1) {
          return `folder-dir-${returnedIdx}`;
        }
      }
      exitedChildPathRef.current = null;

      if (lastFocusedItemIdRef.current && validNodeIds.has(lastFocusedItemIdRef.current)) {
        return lastFocusedItemIdRef.current;
      }

      if (initialFocusItemId !== undefined) {
        const candidateId = `folder-item-${initialFocusItemId}`;
        if (validNodeIds.has(candidateId)) {
          return candidateId;
        }
      }

      if (folderData.directories && folderData.directories.length > 0) {
        return 'folder-dir-0';
      }
      if (folderData.items && folderData.items.length > 0) {
        return `folder-item-${folderData.items[0].id}`;
      }
      if (folderData.images && folderData.images.length > 0) {
        return 'folder-image-0';
      }
    }

    return 'folder-browser-close-btn';
  }, [
    isLocked,
    error,
    folderData,
    initialFocusItemId,
    validNodeIds,
    exitedChildPathRef,
    lastFocusedItemIdRef,
  ]);

  // Deterministic initial, post-navigation, AND self-healing focus placement
  useEffect(() => {
    if (!isOpen || loading) return;
    if (activeTrap && activeTrap !== 'folder-browser-modal') return;
    if (hasOtherStackedModal()) return;
    if (pendingWindowFocusIdRef.current) return;

    const statusTag = isLocked ? 'locked' : error ? 'error' : 'loaded';
    const folderKey = `${libraryId}:${currentPath}:${statusTag}`;

    if (autoFocusedFolderKeyRef.current !== folderKey) {
      autoFocusedFolderKeyRef.current = folderKey;
      const targetId = computePreferredFocusId();
      requestNodeFocus(targetId);
      return;
    }

    if (focusedId && validNodeIds.has(focusedId)) {
      lastFocusedItemIdRef.current = focusedId;
      syncTargetFocusId(focusedId);
      return;
    }

    // Self-heal: if FolderBrowserModal is the active modal and focusedId is null or outside this modal,
    // immediately restore focus to lastFocusedItemIdRef or the first item.
    const healId =
      lastFocusedItemIdRef.current && validNodeIds.has(lastFocusedItemIdRef.current)
        ? lastFocusedItemIdRef.current
        : computePreferredFocusId();
    requestNodeFocus(healId);
  }, [
    isOpen,
    loading,
    isLocked,
    error,
    folderData,
    libraryId,
    currentPath,
    activeTrap,
    focusedId,
    validNodeIds,
    hasOtherStackedModal,
    computePreferredFocusId,
    autoFocusedFolderKeyRef,
    lastFocusedItemIdRef,
    pendingWindowFocusIdRef,
    requestNodeFocus,
    syncTargetFocusId,
  ]);

  // Capture keydown: Back navigation + Fast Page-Up / Page-Down (~5 rows/items)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTrapRef.current && activeTrapRef.current !== 'folder-browser-modal') {
        return;
      }
      if (hasOtherStackedModal()) {
        return;
      }

      const code = e.keyCode || e.which;

      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        goBackRef.current();
        return;
      }

      const isPageUp =
        code === TVKeys.CH_UP ||
        code === TVKeys.REWIND ||
        code === 33 ||
        e.key === 'PageUp' ||
        e.key === 'ChannelUp' ||
        e.key === 'MediaRewind';

      const isPageDown =
        code === TVKeys.CH_DOWN ||
        code === TVKeys.FAST_FORWARD ||
        code === 34 ||
        e.key === 'PageDown' ||
        e.key === 'ChannelDown' ||
        e.key === 'MediaFastForward';

      if (!isPageUp && !isPageDown) {
        return;
      }

      const rows = contentRowsRef.current;
      if (!rows || rows.length === 0) {
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      const curId = pendingWindowFocusIdRef.current ?? focusedIdRef.current;
      let foundRow = -1;
      let foundCol = 0;

      if (curId) {
        for (let r = 0; r < rows.length; r++) {
          const c = rows[r].indexOf(curId);
          if (c !== -1) {
            foundRow = r;
            foundCol = c;
            break;
          }
        }
      }

      let nextId: string;
      if (foundRow === -1) {
        // Currently on header action row -> enter content list on PageDown, or stay/enter top on PageUp
        nextId = isPageDown
          ? rows[Math.min(rows.length - 1, PAGE_JUMP_ROWS - 1)][0]
          : rows[0][0];
      } else if (rows.length === 1) {
        // Single row of items: jump ~5 items left/right within the row
        const singleRow = rows[0];
        const targetCol = isPageDown
          ? Math.min(singleRow.length - 1, foundCol + PAGE_JUMP_ROWS)
          : Math.max(0, foundCol - PAGE_JUMP_ROWS);
        nextId = singleRow[targetCol];
      } else {
        const targetRow = isPageDown
          ? Math.min(rows.length - 1, foundRow + PAGE_JUMP_ROWS)
          : Math.max(0, foundRow - PAGE_JUMP_ROWS);
        const rowItems = rows[targetRow];
        const targetCol = Math.min(foundCol, rowItems.length - 1);
        nextId = rowItems[targetCol];
      }

      if (nextId) {
        requestNodeFocus(nextId);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, hasOtherStackedModal, goBackRef, pendingWindowFocusIdRef, requestNodeFocus]);

  return null;
});

export function FolderBrowserModal({
  client,
  serverUrl,
  token,
  libraryId,
  initialPath = '',
  initialFocusItemId,
  onClose,
  onSelectItem,
  onSelectImage,
  onStartSlideshow,
  onPlayQueue,
  onLockedLibrary,
  onAddToPlaylist,
  onPlaylistChanged,
  onPathChange,
  isOpen = true,
  refreshKey,
}: FolderBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const [folderData, setFolderData] = useState<LibraryFolderResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [internalAddTarget, setInternalAddTarget] = useState<AddToPlaylistTarget | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const dirGridRef = useRef<HTMLDivElement | null>(null);
  const itemGridRef = useRef<HTMLDivElement | null>(null);
  const imageGridRef = useRef<HTMLDivElement | null>(null);
  const setFocusedIdRef = useRef<((id: string | null) => void) | null>(null);
  const onLockedLibraryRef = useRef(onLockedLibrary);
  onLockedLibraryRef.current = onLockedLibrary;
  const onSelectItemRef = useRef(onSelectItem);
  onSelectItemRef.current = onSelectItem;
  const onSelectImageRef = useRef(onSelectImage);
  onSelectImageRef.current = onSelectImage;
  const onPathChangeRef = useRef(onPathChange);
  onPathChangeRef.current = onPathChange;
  const folderDataRef = useRef(folderData);
  folderDataRef.current = folderData;

  const exitedChildPathRef = useRef<string | null>(null);
  const autoFocusedFolderKeyRef = useRef<string | null>(null);
  const pendingWindowFocusIdRef = useRef<string | null>(null);
  const lastFocusedItemIdRef = useRef<string | null>(
    initialFocusItemId !== undefined ? `folder-item-${initialFocusItemId}` : null
  );
  const [targetFocusId, setTargetFocusId] = useState<string | null>(() =>
    initialFocusItemId !== undefined ? `folder-item-${initialFocusItemId}` : null
  );
  const [scrollState, setScrollState] = useState<{ scrollTop: number; viewportHeight: number }>({
    scrollTop: 0,
    viewportHeight: 0,
  });
  const [pendingCommitTick, setPendingCommitTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchLibraryFolders(client, libraryId, currentPath)
      .then((data) => {
        if (isMounted) {
          // Allow post-load focus effect to run while keeping lastFocusedItemIdRef intact across refreshKey updates
          autoFocusedFolderKeyRef.current = null;
          setFolderData(data);
          setLoading(false);
          setIsLocked(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          autoFocusedFolderKeyRef.current = null;
          const errMsg = err?.message || String(err);
          const status = err?.status;
          const locked =
            status === 403 || errMsg.includes('403') || errMsg.includes('LIBRARY_LOCKED');
          setError(errMsg);
          setLoading(false);
          if (locked) {
            setIsLocked(true);
            onLockedLibraryRef.current?.(libraryId);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, libraryId, currentPath, isOpen, refreshKey]);

  const prevLibraryIdRef = useRef(libraryId);
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    const isNewLibrary = libraryId !== prevLibraryIdRef.current;
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevLibraryIdRef.current = libraryId;
    prevIsOpenRef.current = isOpen;
    if (!isOpen) {
      pendingWindowFocusIdRef.current = null;
      return;
    }
    const targetPath = initialPath || '';
    if (isNewLibrary || justOpened || targetPath !== currentPathRef.current) {
      exitedChildPathRef.current = null;
      autoFocusedFolderKeyRef.current = null;
      const nextInitialFocus =
        initialFocusItemId !== undefined ? `folder-item-${initialFocusItemId}` : null;
      lastFocusedItemIdRef.current = nextInitialFocus;
      setTargetFocusId(nextInitialFocus);
      setCurrentPath(targetPath);
    } else if (initialFocusItemId !== undefined) {
      const nextInitialFocus = `folder-item-${initialFocusItemId}`;
      lastFocusedItemIdRef.current = nextInitialFocus;
      setTargetFocusId(nextInitialFocus);
    }
  }, [isOpen, libraryId, initialPath, initialFocusItemId]);

  useEffect(() => {
    if (!isOpen) return;
    pendingWindowFocusIdRef.current = null;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollState((prev) =>
      prev.scrollTop === 0 ? prev : { scrollTop: 0, viewportHeight: prev.viewportHeight }
    );
  }, [isOpen, libraryId, currentPath]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const measureViewport = () => {
      const nextHeight = container.clientHeight || 0;
      setScrollState((prev) =>
        prev.viewportHeight === nextHeight ? prev : { ...prev, viewportHeight: nextHeight }
      );
    };
    measureViewport();
    window.addEventListener('resize', measureViewport);
    return () => window.removeEventListener('resize', measureViewport);
  }, [isOpen]);

  const isAtRoot = currentPath === '';

  const navigateToPath = useCallback(
    (nextPath: string, sourceNodeId?: string) => {
      if (sourceNodeId) {
        lastFocusedItemIdRef.current = sourceNodeId;
      }
      exitedChildPathRef.current = null;
      if (nextPath !== currentPath) {
        lastFocusedItemIdRef.current = null;
        autoFocusedFolderKeyRef.current = null;
        pendingWindowFocusIdRef.current = null;
        setTargetFocusId(null);
        setLoading(true);
      }
      setCurrentPath(nextPath);
      onPathChangeRef.current?.(nextPath);
    },
    [currentPath]
  );

  /** Go up one folder; close the browser only when already at the library root. */
  const goBack = useCallback(() => {
    if (!isAtRoot) {
      exitedChildPathRef.current = currentPath;
      lastFocusedItemIdRef.current = null;
      autoFocusedFolderKeyRef.current = null;
      pendingWindowFocusIdRef.current = null;
      setTargetFocusId(null);
      const fData = folderDataRef.current;
      const parent =
        fData?.parent_path !== undefined
          ? fData.parent_path
          : currentPath.includes('/')
          ? currentPath.substring(0, currentPath.lastIndexOf('/'))
          : '';
      if (parent !== currentPath) {
        setLoading(true);
      }
      setCurrentPath(parent);
      onPathChangeRef.current?.(parent);
    } else {
      onClose();
    }
  }, [isAtRoot, currentPath, onClose]);

  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  const handleSelectItemCard = useCallback((itemId: number | string, nodeId: string) => {
    lastFocusedItemIdRef.current = nodeId;
    setFocusedIdRef.current?.(nodeId);
    onSelectItemRef.current(itemId);
  }, []);

  const handleSelectPhotoCard = useCallback((idx: number, nodeId: string) => {
    lastFocusedItemIdRef.current = nodeId;
    setFocusedIdRef.current?.(nodeId);
    const images = folderDataRef.current?.images || [];
    onSelectImageRef.current(images, idx);
  }, []);

  const title = folderData?.library_name || libraryId;
  const showPlayAllBtn =
    !loading &&
    !isLocked &&
    !error &&
    (folderData?.items?.length ?? 0) > 0 &&
    Boolean(onPlayQueue);
  const showAddFolderBtn =
    !loading && !isLocked && !error && !libraryId.startsWith('plugin://');

  const { validNodeIds, contentRows, nodeSectionRowMap } = useMemo(() => {
    const ids = new Set<string>();
    const posMap = new Map<string, { section: GridSectionKey; row: number }>();
    ids.add('folder-browser-close-btn');
    (folderData?.breadcrumbs || []).forEach((_, idx) => {
      ids.add(`folder-breadcrumb-${idx}`);
    });
    if (showPlayAllBtn) {
      ids.add('play-folder-all-btn');
    }
    if (showAddFolderBtn) {
      ids.add('folder-add-to-playlist-btn');
    }
    if (!loading && isLocked) {
      ids.add('folder-unlock-library-btn');
    }

    const rows: string[][] = [];
    if (!loading && !isLocked && folderData) {
      const dirIds = (folderData.directories || []).map((_, idx) => {
        const id = `folder-dir-${idx}`;
        ids.add(id);
        posMap.set(id, { section: 'dir', row: Math.floor(idx / GRID_COLS) });
        return id;
      });
      const itemIds = (folderData.items || []).map((item, idx) => {
        const id = `folder-item-${item.id}`;
        ids.add(id);
        posMap.set(id, { section: 'item', row: Math.floor(idx / GRID_COLS) });
        return id;
      });
      if (folderData.images && folderData.images.length > 0) {
        ids.add('start-slideshow-btn');
      }
      const imageIds = (folderData.images || []).map((_, idx) => {
        const id = `folder-image-${idx}`;
        ids.add(id);
        posMap.set(id, { section: 'image', row: Math.floor(idx / GRID_COLS) });
        return id;
      });

      rows.push(...chunkIntoRows(dirIds, GRID_COLS));
      rows.push(...chunkIntoRows(itemIds, GRID_COLS));
      rows.push(...chunkIntoRows(imageIds, GRID_COLS));
    }

    return { validNodeIds: ids, contentRows: rows, nodeSectionRowMap: posMap };
  }, [folderData, loading, isLocked, showPlayAllBtn, showAddFolderBtn]);

  const nodeSectionRowMapRef = useRef(nodeSectionRowMap);
  nodeSectionRowMapRef.current = nodeSectionRowMap;

  const dirList = (!loading && !isLocked && folderData?.directories) || [];
  const itemList = (!loading && !isLocked && folderData?.items) || [];
  const imageList = (!loading && !isLocked && folderData?.images) || [];
  const targetPos = targetFocusId ? nodeSectionRowMap.get(targetFocusId) : undefined;

  const computeSectionWindow = (
    totalItems: number,
    section: GridSectionKey,
    gridEl: HTMLDivElement | null
  ): VirtualRowWindow => {
    const { rowHeightPx, rowSpacingPx } = SECTION_ROW_METRICS[section];
    const offsetTop = gridEl?.offsetTop ?? 0;
    return computeVirtualRowWindow({
      totalItems,
      columns: GRID_COLS,
      rowHeightPx,
      rowSpacingPx,
      viewportHeightPx: scrollState.viewportHeight,
      scrollTopPx: Math.max(0, scrollState.scrollTop - offsetTop),
      anchorRow: targetPos?.section === section ? targetPos.row : null,
      thresholdItems: VIRTUAL_GRID_ITEM_THRESHOLD,
    });
  };

  const dirWindow = computeSectionWindow(dirList.length, 'dir', dirGridRef.current);
  const itemWindow = computeSectionWindow(itemList.length, 'item', itemGridRef.current);
  const imageWindow = computeSectionWindow(imageList.length, 'image', imageGridRef.current);

  const hasVirtualizedSection =
    dirWindow.isVirtualized || itemWindow.isVirtualized || imageWindow.isVirtualized;
  const hasVirtualizedSectionRef = useRef(hasVirtualizedSection);
  hasVirtualizedSectionRef.current = hasVirtualizedSection;

  const syncTargetFocusId = useCallback((nextId: string) => {
    if (!hasVirtualizedSectionRef.current) return;
    setTargetFocusId((prev) => (prev === nextId ? prev : nextId));
  }, []);

  const scrollTargetRowIntoView = useCallback((nextId: string) => {
    const container = scrollContainerRef.current;
    const pos = nodeSectionRowMapRef.current.get(nextId);
    if (!container || !pos) return;
    const gridRefs: Record<GridSectionKey, HTMLDivElement | null> = {
      dir: dirGridRef.current,
      item: itemGridRef.current,
      image: imageGridRef.current,
    };
    const { rowHeightPx, rowSpacingPx } = SECTION_ROW_METRICS[pos.section];
    const rowStride = rowHeightPx + rowSpacingPx;
    const gridOffsetTop = gridRefs[pos.section]?.offsetTop ?? 0;
    const viewportH = container.clientHeight || DEFAULT_GRID_VIEWPORT_HEIGHT_PX;
    const targetRowTop = gridOffsetTop + pos.row * rowStride;
    const nextScrollTop = Math.max(
      0,
      targetRowTop - Math.max(0, Math.floor((viewportH - rowHeightPx) / 2))
    );
    container.scrollTop = nextScrollTop;
    setScrollState((prev) =>
      prev.scrollTop === nextScrollTop && prev.viewportHeight === container.clientHeight
        ? prev
        : { scrollTop: nextScrollTop, viewportHeight: container.clientHeight }
    );
  }, []);

  const requestNodeFocus = useCallback(
    (nextId: string) => {
      lastFocusedItemIdRef.current = nextId;
      const mountedEl = typeof document !== 'undefined' ? document.getElementById(nextId) : null;
      if (mountedEl) {
        pendingWindowFocusIdRef.current = null;
        if (hasVirtualizedSectionRef.current) {
          setTargetFocusId((prev) => (prev === nextId ? prev : nextId));
        }
        setFocusedIdRef.current?.(nextId);
        scrollElementIntoViewIfClipped(mountedEl);
        return;
      }

      if (!hasVirtualizedSectionRef.current || !nodeSectionRowMapRef.current.has(nextId)) {
        pendingWindowFocusIdRef.current = null;
        setFocusedIdRef.current?.(nextId);
        return;
      }

      // Target card is outside the mounted overscan slice: shift the window first,
      // then commit FocusContext selection in useLayoutEffect once its ref registers.
      pendingWindowFocusIdRef.current = nextId;
      scrollTargetRowIntoView(nextId);
      setTargetFocusId((prev) => (prev === nextId ? prev : nextId));
      setPendingCommitTick((tick) => tick + 1);
    },
    [scrollTargetRowIntoView]
  );

  useLayoutEffect(() => {
    const pendingId = pendingWindowFocusIdRef.current;
    if (!pendingId || !isOpen || loading) return;
    const el = typeof document !== 'undefined' ? document.getElementById(pendingId) : null;
    if (!el) return;
    pendingWindowFocusIdRef.current = null;
    setFocusedIdRef.current?.(pendingId);
    if (typeof el.focus === 'function') {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
    scrollElementIntoViewIfClipped(el);
  }, [isOpen, loading, targetFocusId, pendingCommitTick, folderData]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!hasVirtualizedSectionRef.current) return;
    const el = e.currentTarget;
    const nextTop = el.scrollTop;
    const nextHeight = el.clientHeight;
    setScrollState((prev) =>
      prev.scrollTop === nextTop && prev.viewportHeight === nextHeight
        ? prev
        : { scrollTop: nextTop, viewportHeight: nextHeight }
    );
  }, []);

  if (!isOpen) return null;

  const isEmpty =
    !loading &&
    !isLocked &&
    (!folderData?.directories || folderData.directories.length === 0) &&
    (!folderData?.items || folderData.items.length === 0) &&
    (!folderData?.images || folderData.images.length === 0);

  const unlockTokens = client?.getUnlockTokens ? client.getUnlockTokens() : [];

  let nextOrder = 1;
  const closeBtnOrder = nextOrder++;
  const breadcrumbOrders = (folderData?.breadcrumbs || []).map(() => nextOrder++);
  const playAllBtnOrder = showPlayAllBtn ? nextOrder++ : undefined;
  const addFolderBtnOrder = showAddFolderBtn ? nextOrder++ : undefined;
  const unlockBtnOrder = !loading && isLocked ? nextOrder++ : undefined;
  const dirOrders = (folderData?.directories || []).map(() => nextOrder++);
  const itemOrders = (folderData?.items || []).map(() => nextOrder++);
  const slideshowBtnOrder =
    folderData?.images && folderData.images.length > 0 ? nextOrder++ : undefined;
  const imageOrders = (folderData?.images || []).map(() => nextOrder++);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-modal-overlay="true"
      className="fixed inset-0 z-50 bg-[#120404] text-[#F5E5E5] flex flex-col p-12 overflow-hidden select-none"
    >
      {/* Header: action row (Back + breadcrumb trail) on top, folder title below */}
      <div
        className="shrink-0"
        style={{ paddingBottom: '20px', borderBottom: '1px solid rgba(245,229,229,0.08)' }}
      >
        <div
          data-testid="folder-browser-action-row"
          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <PillButton
            id="folder-browser-close-btn"
            groupId="folder-browser-modal"
            order={closeBtnOrder}
            variant="secondary"
            ariaLabel={isAtRoot ? 'Close' : 'Back'}
            icon={isAtRoot ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
            marginRight="24px"
            onSelect={goBack}
          >
            {isAtRoot ? 'Close' : 'Back'}
          </PillButton>

          {folderData?.breadcrumbs && folderData.breadcrumbs.length > 0 ? (
            folderData.breadcrumbs.map((crumb, idx) => {
              const isLast = idx === folderData.breadcrumbs.length - 1;
              return (
                <div
                  key={crumb.path || `root-${idx}`}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  {idx > 0 && (
                    <span
                      style={{
                        marginRight: '12px',
                        fontSize: '24px',
                        fontWeight: 700,
                        color: '#6e6865',
                      }}
                    >
                      &gt;
                    </span>
                  )}
                  <PillButton
                    id={`folder-breadcrumb-${idx}`}
                    groupId="folder-browser-modal"
                    order={breadcrumbOrders[idx]}
                    variant={isLast ? 'current' : 'secondary'}
                    size="sm"
                    marginRight="12px"
                    onSelect={() => navigateToPath(crumb.path, `folder-breadcrumb-${idx}`)}
                  >
                    {crumb.name}
                  </PillButton>
                </div>
              );
            })
          ) : (
            <span style={{ color: '#a8a29e', fontWeight: 500, fontSize: '20px' }}>{title}</span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            marginTop: '20px',
          }}
        >
          <h2
            className="text-4xl font-black tracking-tight text-[#F5E5E5]"
            style={{ marginRight: '16px' }}
          >
            {title}
          </h2>

          {(showPlayAllBtn || showAddFolderBtn) && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {showPlayAllBtn && (
                <PillButton
                  id="play-folder-all-btn"
                  groupId="folder-browser-modal"
                  order={playAllBtnOrder}
                  variant="primary"
                  size="sm"
                  icon={<Play className="w-4 h-4 fill-current" />}
                  marginRight="12px"
                  onSelect={() => {
                    lastFocusedItemIdRef.current = 'play-folder-all-btn';
                    setFocusedIdRef.current?.('play-folder-all-btn');
                    const items = folderData?.items || [];
                    if (items.length === 0) return;
                    const queue: PlaylistQueuePlayItem[] = items.map((item) => ({
                      id: item.id,
                      title: item.title,
                      subtitle: item.subtitle,
                      posterUrl: item.poster_url,
                      mediaType: item.media_type,
                      resumeMs:
                        item.media_type === 'live_channel'
                          ? 0
                          : toResumePercentageSentinel(item.playback_progress),
                    }));
                    onPlayQueue?.(queue, 0);
                  }}
                >
                  Play All
                </PillButton>
              )}

              {showAddFolderBtn && (
                <PillButton
                  id="folder-add-to-playlist-btn"
                  groupId="folder-browser-modal"
                  order={addFolderBtnOrder}
                  variant="secondary"
                  size="sm"
                  icon={<ListPlus className="w-4 h-4" />}
                  marginRight="0px"
                  onSelect={() => {
                    lastFocusedItemIdRef.current = 'folder-add-to-playlist-btn';
                    setFocusedIdRef.current?.('folder-add-to-playlist-btn');
                    const crumbs = folderData?.breadcrumbs || [];
                    const currentCrumbName =
                      crumbs.length > 0 ? crumbs[crumbs.length - 1].name : title;
                    const target: AddToPlaylistTarget = {
                      kind: 'folder',
                      libraryId,
                      path: currentPath,
                      folderName: currentCrumbName || title,
                    };
                    if (onAddToPlaylist) {
                      onAddToPlaylist(target);
                    } else {
                      setInternalAddTarget(target);
                    }
                  }}
                >
                  Add Folder to Playlist
                </PillButton>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        data-folder-scroll-container="true"
        className="flex-1 overflow-y-auto mt-6 pr-4 scrollbar-thin relative"
      >
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 text-[#5C3C3C]">
            <Loader2
              className="w-8 h-8 animate-spin text-[#FF6B00]"
              style={{ marginBottom: '12px' }}
            />
            <span className="text-lg">Loading folder contents...</span>
          </div>
        )}

        {!loading && isLocked && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div
              className="w-16 h-16 rounded-full bg-[#D43F15]/10 flex items-center justify-center text-[#D43F15]"
              style={{ marginBottom: '16px' }}
            />
            <div className="text-2xl font-bold text-[#F5E5E5]" style={{ marginBottom: '12px' }}>
              This library is locked
            </div>
            <p className="text-[#5C3C3C] max-w-md" style={{ marginBottom: '16px' }}>
              A PIN or unlock token is required to browse contents of this library.
            </p>
            <TVButton
              id="folder-unlock-library-btn"
              groupId="folder-browser-modal"
              order={unlockBtnOrder}
              variant="primary"
              className="mt-2 px-8 py-3 text-lg font-semibold"
              onClick={() => {
                lastFocusedItemIdRef.current = 'folder-unlock-library-btn';
                setFocusedIdRef.current?.('folder-unlock-library-btn');
                onLockedLibrary?.(libraryId);
              }}
              onEnter={() => {
                lastFocusedItemIdRef.current = 'folder-unlock-library-btn';
                setFocusedIdRef.current?.('folder-unlock-library-btn');
                onLockedLibrary?.(libraryId);
              }}
            >
              <Lock className="w-5 h-5 mr-2 inline-block" /> Unlock Library
            </TVButton>
          </div>
        )}

        {!loading && !isLocked && error && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-xl font-bold text-[#D43F15]" style={{ marginBottom: '12px' }}>
              Failed to load folder
            </div>
            <p className="text-[#5C3C3C]">{error}</p>
          </div>
        )}

        {!loading && !isLocked && isEmpty && (
          <div className="flex flex-col items-center justify-center h-64 text-[#5C3C3C] text-xl font-medium">
            This folder is empty
          </div>
        )}

        {!loading && !isLocked && folderData && (
          <>
            {/* Subdirectories Section */}
            {dirList.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 className="text-2xl font-bold text-[#F5E5E5]" style={{ marginBottom: '16px' }}>
                  Folders
                </h3>
                <div
                  ref={dirGridRef}
                  className="grid grid-cols-6"
                  style={buildGridStyle(dirWindow)}
                >
                  {dirList.slice(dirWindow.startIndex, dirWindow.endIndex).map((dir, sliceIdx) => {
                    const idx = dirWindow.startIndex + sliceIdx;
                    return (
                      <FolderDirItem
                        key={dir.path || idx}
                        id={`folder-dir-${idx}`}
                        order={dirOrders[idx]}
                        name={dir.name}
                        path={dir.path}
                        itemCount={dir.item_count}
                        onNavigate={navigateToPath}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Media Items Section */}
            {itemList.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 className="text-2xl font-bold text-[#F5E5E5]" style={{ marginBottom: '16px' }}>
                  Media Items
                </h3>
                <div
                  ref={itemGridRef}
                  className="grid grid-cols-6"
                  style={buildGridStyle(itemWindow)}
                >
                  {itemList
                    .slice(itemWindow.startIndex, itemWindow.endIndex)
                    .map((item, sliceIdx) => {
                      const idx = itemWindow.startIndex + sliceIdx;
                      return (
                        <FolderMediaCard
                          key={item.id}
                          id={`folder-item-${item.id}`}
                          order={itemOrders[idx]}
                          itemId={item.id}
                          title={item.title}
                          subtitle={
                            item.subtitle ||
                            (item.release_year ? String(item.release_year) : undefined)
                          }
                          imageUrl={formatImageUrl(serverUrl, item.poster_url)}
                          badge={item.badge}
                          progressPercent={
                            item.playback_progress !== undefined
                              ? Math.round(item.playback_progress * 100)
                              : undefined
                          }
                          onSelectItemId={handleSelectItemCard}
                        />
                      );
                    })}
                </div>
              </div>
            )}

            {/* Photos & Images Section */}
            {imageList.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: '16px' }}
                >
                  <h3 className="text-2xl font-bold text-[#F5E5E5]">
                    Photos ({imageList.length})
                  </h3>
                  <PillButton
                    id="start-slideshow-btn"
                    groupId="folder-browser-modal"
                    order={slideshowBtnOrder}
                    variant="primary"
                    icon={<Play className="w-5 h-5 fill-current" />}
                    marginRight="0px"
                    onSelect={() => {
                      lastFocusedItemIdRef.current = 'start-slideshow-btn';
                      setFocusedIdRef.current?.('start-slideshow-btn');
                      onStartSlideshow(imageList);
                    }}
                  >
                    Start Slideshow
                  </PillButton>
                </div>
                <div
                  ref={imageGridRef}
                  className="grid grid-cols-6"
                  style={buildGridStyle(imageWindow)}
                >
                  {imageList
                    .slice(imageWindow.startIndex, imageWindow.endIndex)
                    .map((img, sliceIdx) => {
                      const idx = imageWindow.startIndex + sliceIdx;
                      return (
                        <FolderPhotoCard
                          key={img.path || idx}
                          id={`folder-image-${idx}`}
                          order={imageOrders[idx]}
                          image={img}
                          index={idx}
                          imageUrl={getAuthenticatedImageUrl(
                            serverUrl,
                            img.url || img.path,
                            token,
                            unlockTokens
                          )}
                          onSelectPhoto={handleSelectPhotoCard}
                        />
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!onAddToPlaylist && internalAddTarget && (
        <AddToPlaylistModal
          isOpen={Boolean(internalAddTarget)}
          client={client}
          serverUrl={serverUrl}
          token={token}
          target={internalAddTarget}
          onClose={() => setInternalAddTarget(null)}
          onSuccess={() => {
            setInternalAddTarget(null);
            onPlaylistChanged?.();
          }}
          onLockedLibrary={(libId) => {
            onLockedLibrary?.(libId || libraryId);
          }}
        />
      )}

      <FolderFocusBridge
        isOpen={isOpen}
        loading={loading}
        isLocked={isLocked}
        error={error}
        folderData={folderData}
        libraryId={libraryId}
        currentPath={currentPath}
        initialFocusItemId={initialFocusItemId}
        hasInternalModal={Boolean(!onAddToPlaylist && internalAddTarget)}
        validNodeIds={validNodeIds}
        contentRows={contentRows}
        dialogRef={dialogRef}
        exitedChildPathRef={exitedChildPathRef}
        autoFocusedFolderKeyRef={autoFocusedFolderKeyRef}
        lastFocusedItemIdRef={lastFocusedItemIdRef}
        pendingWindowFocusIdRef={pendingWindowFocusIdRef}
        setFocusedIdRef={setFocusedIdRef}
        goBackRef={goBackRef}
        requestNodeFocus={requestNodeFocus}
        syncTargetFocusId={syncTargetFocusId}
      />
    </div>
  );
}
