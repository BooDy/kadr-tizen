import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  Play,
  Shuffle,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  Lock,
  Globe,
  Clock,
  Film,
  User,
  CheckCircle2,
  PlayCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { ApiClient } from '../api/client';
import { MediaItemDetail } from '../api/items';
import {
  fetchPlaylistDetail,
  deletePlaylist,
  removePlaylistItem,
  reorderPlaylistItems,
  shufflePlaylistItems,
  getPlaylistItemResumeMs,
  formatPlaylistDuration,
  PlaylistDetail,
  PlaylistItemView,
  PlaylistSummary,
} from '../api/playlists';
import { useFocusContext } from '../navigation/FocusContext';
import { TVKeys } from '../navigation/keys';
import { PillButton } from '../components/tv/PillButton';
import { TVButton } from '../components/tv/TVButton';
import { PlaylistCoverMosaic } from '../components/playlists/PlaylistCoverMosaic';
import { CreateEditPlaylistModal } from '../components/playlists/CreateEditPlaylistModal';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';

export interface PlaylistQueuePlayItem {
  id: number | string;
  title: string;
  resumeMs?: number;
  technical?: MediaItemDetail['technical'];
}

export interface PlaylistDetailModalProps {
  isOpen: boolean;
  playlistId: string | null;
  client: ApiClient;
  serverUrl: string;
  token?: string;
  refreshKey?: number;
  onClose: () => void;
  onPlayQueue: (queue: PlaylistQueuePlayItem[], startIndex: number) => void;
  onSelectItem?: (itemId: number) => void;
  onPlaylistChanged?: () => void;
  onPlaylistDeleted?: (playlistId: string) => void;
  onLockedLibrary?: (libraryId?: string) => void;
}

const TRAP_ID = 'playlist-detail-modal';

function formatResumeClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

interface PlaylistDetailFocusBridgeProps {
  isOpen: boolean;
  playlistId: string | null;
  confirmingDelete: boolean;
  onCancelDeleteConfirm: () => void;
  onClose: () => void;
}

function PlaylistDetailFocusBridge({
  isOpen,
  playlistId,
  confirmingDelete,
  onCancelDeleteConfirm,
  onClose,
}: PlaylistDetailFocusBridgeProps) {
  const { pushTrap, popTrap, activeTrap, setFocusedId } = useFocusContext();
  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;
  const confirmingDeleteRef = useRef(confirmingDelete);
  confirmingDeleteRef.current = confirmingDelete;
  const onCancelDeleteConfirmRef = useRef(onCancelDeleteConfirm);
  onCancelDeleteConfirmRef.current = onCancelDeleteConfirm;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !playlistId) return;
    pushTrap(TRAP_ID);
    return () => {
      popTrap(TRAP_ID);
    };
  }, [isOpen, playlistId, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen || !playlistId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTrapRef.current && activeTrapRef.current !== TRAP_ID) return;
      const target = e.target as HTMLElement | null;
      const code = e.keyCode || e.which;

      if (
        (code === TVKeys.BACKSPACE || e.key === 'Backspace') &&
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      ) {
        return;
      }

      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (confirmingDeleteRef.current) {
          onCancelDeleteConfirmRef.current();
          setFocusedId('playlist-delete-btn');
          return;
        }
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, playlistId, setFocusedId]);

  return null;
}

interface PlaylistQueueItemRowProps {
  entry: PlaylistItemView;
  index: number;
  totalCount: number;
  artworkUrl?: string;
  isEditable: boolean;
  busyAction: boolean;
  hasSelectItem: boolean;
  itemPlayOrder: number;
  itemDetailsOrder?: number;
  itemUpOrder?: number;
  itemDownOrder?: number;
  itemRemoveOrder?: number;
  onPlayFromIndex: (index: number) => void;
  onSelectItem?: (itemId: number) => void;
  onMoveItem: (index: number, direction: -1 | 1) => void;
  onRemoveItem: (mediaItemId: number) => void;
}

const PlaylistQueueItemRow = memo(function PlaylistQueueItemRow({
  entry,
  index,
  totalCount,
  artworkUrl,
  isEditable,
  busyAction,
  hasSelectItem,
  itemPlayOrder,
  itemDetailsOrder,
  itemUpOrder,
  itemDownOrder,
  itemRemoveOrder,
  onPlayFromIndex,
  onSelectItem,
  onMoveItem,
  onRemoveItem,
}: PlaylistQueueItemRowProps) {
  const card = entry.card;
  const isLive = card.media_type === 'live_channel' || entry.duration_seconds <= 0;
  const hasResume =
    !isLive &&
    typeof entry.resume_position_seconds === 'number' &&
    entry.resume_position_seconds > 0;
  const isCompleted = !hasResume && (card.playback_progress ?? 0) >= 0.9;

  return (
    <div
      data-testid={`playlist-item-row-${card.id}`}
      style={{ marginBottom: '14px', display: 'flex', alignItems: 'center' }}
      className="p-4 rounded-2xl bg-[#181920] border border-[rgba(255,255,255,0.07)]"
    >
      {/* Dense Position Index */}
      <div
        className="w-10 text-center font-mono text-lg font-bold text-[#ff9f2e] shrink-0"
        style={{ marginRight: '16px' }}
      >
        {index + 1}
      </div>

      {/* Thumbnail */}
      <div
        className="w-16 h-24 rounded-xl overflow-hidden bg-[#0d0e15] border border-[rgba(255,255,255,0.08)] shrink-0"
        style={{ marginRight: '20px' }}
      >
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={card.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#6e6865]">
            <Film className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Item Info */}
      <div style={{ flex: 1, minWidth: 0, marginRight: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <h3
            className="text-xl font-bold text-white truncate"
            style={{ marginRight: '12px' }}
          >
            {card.title}
          </h3>

          {isLive ? (
            <span
              className="px-2 py-0.5 rounded bg-[#D43F15] text-white font-mono text-xs font-bold uppercase"
              style={{ marginRight: '8px' }}
            >
              LIVE
            </span>
          ) : (
            <span
              className="px-2 py-0.5 rounded bg-[#0d0e15] text-[#a8a29e] font-mono text-xs"
              style={{ marginRight: '8px' }}
            >
              {formatPlaylistDuration(entry.duration_seconds)}
            </span>
          )}

          {hasResume && (
            <span
              data-testid={`playlist-item-resume-${card.id}`}
              className="px-2.5 py-0.5 rounded bg-[#281216] text-[#ffb871] border border-[#ff7a18]/30 font-mono text-xs font-bold inline-flex items-center"
              style={{ marginRight: '8px' }}
            >
              <PlayCircle className="w-3.5 h-3.5" style={{ marginRight: '4px' }} />
              Resume {formatResumeClock(entry.resume_position_seconds!)}
            </span>
          )}

          {isCompleted && (
            <span
              data-testid={`playlist-item-watched-${card.id}`}
              className="px-2.5 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 font-mono text-xs font-bold inline-flex items-center"
            >
              <CheckCircle2 className="w-3.5 h-3.5" style={{ marginRight: '4px' }} />
              Watched
            </span>
          )}
        </div>

        <div
          className="text-sm text-[#a8a29e]"
          style={{ marginTop: '4px', display: 'flex', alignItems: 'center' }}
        >
          {card.subtitle && (
            <span className="truncate" style={{ marginRight: '12px' }}>
              {card.subtitle}
            </span>
          )}
          {card.release_year && (
            <span className="font-mono" style={{ marginRight: '12px' }}>
              {card.release_year}
            </span>
          )}
          <span className="font-mono uppercase text-xs text-[#6e6865]">
            {card.media_type}
          </span>
        </div>
      </div>

      {/* Row Actions */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <PillButton
          id={`playlist-item-play-${card.id}`}
          groupId={TRAP_ID}
          order={itemPlayOrder}
          variant="primary"
          size="sm"
          ariaLabel={`Play ${card.title} from here`}
          icon={<Play className="w-4 h-4 fill-current" />}
          marginRight={hasSelectItem || isEditable ? '10px' : '0px'}
          onSelect={() => onPlayFromIndex(index)}
        >
          Play from here
        </PillButton>

        {hasSelectItem && onSelectItem && (
          <PillButton
            id={`playlist-item-details-${card.id}`}
            groupId={TRAP_ID}
            order={itemDetailsOrder}
            variant="secondary"
            size="sm"
            ariaLabel={`Details for ${card.title}`}
            icon={<Info className="w-4 h-4" />}
            marginRight={isEditable ? '10px' : '0px'}
            onSelect={() => onSelectItem(card.id)}
          >
            Details
          </PillButton>
        )}

        {isEditable && (
          <>
            <TVButton
              id={`playlist-item-up-${card.id}`}
              groupId={TRAP_ID}
              order={itemUpOrder}
              variant="secondary"
              aria-label={`Move ${card.title} up`}
              disabled={index === 0 || busyAction}
              onClick={() => onMoveItem(index, -1)}
              onEnter={() => onMoveItem(index, -1)}
              style={{
                padding: '10px 14px',
                marginRight: '8px',
                borderRadius: '10px',
              }}
            >
              <ArrowUp className="w-4 h-4" />
            </TVButton>

            <TVButton
              id={`playlist-item-down-${card.id}`}
              groupId={TRAP_ID}
              order={itemDownOrder}
              variant="secondary"
              aria-label={`Move ${card.title} down`}
              disabled={index === totalCount - 1 || busyAction}
              onClick={() => onMoveItem(index, 1)}
              onEnter={() => onMoveItem(index, 1)}
              style={{
                padding: '10px 14px',
                marginRight: '8px',
                borderRadius: '10px',
              }}
            >
              <ArrowDown className="w-4 h-4" />
            </TVButton>

            <TVButton
              id={`playlist-item-remove-${card.id}`}
              groupId={TRAP_ID}
              order={itemRemoveOrder}
              variant="danger"
              aria-label={`Remove ${card.title}`}
              disabled={busyAction}
              onClick={() => onRemoveItem(card.id)}
              onEnter={() => onRemoveItem(card.id)}
              style={{
                padding: '10px 14px',
                marginRight: '0px',
                borderRadius: '10px',
              }}
            >
              <Trash2 className="w-4 h-4" />
            </TVButton>
          </>
        )}
      </div>
    </div>
  );
});

export function PlaylistDetailModal({
  isOpen,
  playlistId,
  client,
  serverUrl,
  token,
  refreshKey,
  onClose,
  onPlayQueue,
  onSelectItem,
  onPlaylistChanged,
  onPlaylistDeleted,
  onLockedLibrary,
}: PlaylistDetailModalProps) {
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);

  const cancelDeleteConfirm = useCallback(() => {
    setConfirmingDelete(false);
  }, []);

  const unlockTokens = useMemo(
    () => (client?.getUnlockTokens ? client.getUnlockTokens() : []),
    [client, refreshKey]
  );

  useEffect(() => {
    if (!isOpen || !playlistId) {
      setDetail(null);
      setConfirmingDelete(false);
      setIsEditOpen(false);
      setError(null);
      setActionError(null);
      return;
    }

    let cancelled = false;
    setLoading((prev) => (detail?.summary.id === playlistId ? prev : true));
    setError(null);

    fetchPlaylistDetail(client, playlistId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load playlist';
        setError(msg);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, playlistId, client, refreshKey]);

  const startQueueFromItems = useCallback(
    (itemsList: PlaylistItemView[], startIndex: number) => {
      if (!itemsList || itemsList.length === 0) return;
      const clampedStart = Math.max(0, Math.min(startIndex, itemsList.length - 1));
      const queue: PlaylistQueuePlayItem[] = itemsList.map((entry) => ({
        id: entry.card.id,
        title: entry.card.title,
        resumeMs: getPlaylistItemResumeMs(entry),
      }));
      onPlayQueue(queue, clampedStart);
    },
    [onPlayQueue]
  );

  const itemsRef = useRef<PlaylistItemView[]>([]);
  itemsRef.current = detail?.items ?? [];

  const handlePlayFromIndex = useCallback(
    (startIndex: number) => {
      startQueueFromItems(itemsRef.current, startIndex);
    },
    [startQueueFromItems]
  );

  const handlePlayAll = () => {
    if (!detail || detail.items.length === 0) return;
    startQueueFromItems(detail.items, 0);
  };

  const handleShuffle = () => {
    if (!detail || detail.items.length === 0) return;
    const shuffled = shufflePlaylistItems(detail.items);
    startQueueFromItems(shuffled, 0);
  };

  const handleConfirmDelete = async () => {
    if (!detail || busyAction) return;
    setBusyAction(true);
    setActionError(null);
    try {
      const deletedId = detail.summary.id;
      await deletePlaylist(client, deletedId);
      setBusyAction(false);
      onPlaylistDeleted?.(deletedId);
      onClose();
    } catch (err: unknown) {
      setBusyAction(false);
      const msg = err instanceof Error ? err.message : 'Failed to delete playlist';
      setActionError(msg);
    }
  };

  const detailRef = useRef(detail);
  detailRef.current = detail;
  const busyActionRef = useRef(busyAction);
  busyActionRef.current = busyAction;

  const handleMoveItem = useCallback(
    async (index: number, direction: -1 | 1) => {
      const currentDetail = detailRef.current;
      if (!currentDetail || busyActionRef.current) return;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= currentDetail.items.length) return;

      const previousItems = currentDetail.items;
      const nextItems = [...previousItems];
      const temp = nextItems[index];
      nextItems[index] = nextItems[targetIndex];
      nextItems[targetIndex] = temp;

      const reindexed = nextItems.map((it, idx) => ({
        ...it,
        position: idx,
      }));
      const permutationIds = reindexed.map((it) => Number(it.card.id));

      setDetail({
        ...currentDetail,
        items: reindexed,
      });
      setBusyAction(true);
      setActionError(null);

      try {
        const updatedSummary = await reorderPlaylistItems(
          client,
          currentDetail.summary.id,
          permutationIds
        );
        setDetail((curr) =>
          curr
            ? {
                summary: updatedSummary || curr.summary,
                items: curr.items,
              }
            : curr
        );
        setBusyAction(false);
        onPlaylistChanged?.();
      } catch (err: unknown) {
        setDetail((curr) => (curr ? { ...curr, items: previousItems } : curr));
        setBusyAction(false);
        const msg = err instanceof Error ? err.message : 'Failed to reorder playlist items';
        setActionError(msg);
      }
    },
    [client, onPlaylistChanged]
  );

  const handleRemoveItem = useCallback(
    async (mediaItemId: number) => {
      const currentDetail = detailRef.current;
      if (!currentDetail || busyActionRef.current) return;
      setBusyAction(true);
      setActionError(null);
      try {
        const updatedSummary = await removePlaylistItem(
          client,
          currentDetail.summary.id,
          mediaItemId
        );
        setDetail((curr) => {
          if (!curr) return curr;
          const filtered = curr.items
            .filter((it) => Number(it.card.id) !== Number(mediaItemId))
            .map((it, idx) => ({ ...it, position: idx }));
          return {
            summary: updatedSummary || {
              ...curr.summary,
              visible_item_count: filtered.length,
            },
            items: filtered,
          };
        });
        setBusyAction(false);
        onPlaylistChanged?.();
      } catch (err: unknown) {
        setBusyAction(false);
        const msg = err instanceof Error ? err.message : 'Failed to remove item';
        setActionError(msg);
        if (msg.includes('403') || msg.includes('LIBRARY_LOCKED')) {
          onLockedLibrary?.();
        }
      }
    },
    [client, onPlaylistChanged, onLockedLibrary]
  );

  const handleMetadataUpdated = (updatedSummary: PlaylistSummary) => {
    setDetail((curr) =>
      curr
        ? {
            ...curr,
            summary: updatedSummary,
          }
        : curr
    );
    onPlaylistChanged?.();
  };

  if (!isOpen || !playlistId) return null;

  const summary = detail?.summary;
  const items = detail?.items ?? [];
  const isEditable = Boolean(summary?.is_editable);

  let nextOrder = 1;
  const playAllOrder = nextOrder++;
  const shuffleOrder = nextOrder++;
  const editOrder = isEditable ? nextOrder++ : undefined;
  const deleteOrder = isEditable ? nextOrder++ : undefined;
  const closeOrder = nextOrder++;
  const confirmDeleteOrder = confirmingDelete ? nextOrder++ : undefined;
  const cancelDeleteOrder = confirmingDelete ? nextOrder++ : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={summary?.name || 'Playlist Details'}
      className="fixed inset-0 z-[55] bg-[#121318] text-[#e3e1e9] flex flex-col overflow-y-auto overflow-x-hidden select-none"
    >
      <PlaylistDetailFocusBridge
        isOpen={isOpen}
        playlistId={playlistId}
        confirmingDelete={confirmingDelete}
        onCancelDeleteConfirm={cancelDeleteConfirm}
        onClose={onClose}
      />
      {loading && !detail ? (
        <div
          data-testid="playlist-detail-loading"
          className="flex-1 flex items-center justify-center text-[#a8a29e] text-2xl"
        >
          <Loader2
            className="w-8 h-8 animate-spin text-[#ff7a18]"
            style={{ marginRight: '12px' }}
          />
          <span>Loading playlist...</span>
        </div>
      ) : error && !detail ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <h2 className="text-3xl font-bold text-white" style={{ marginBottom: '12px' }}>
            Unable to Load Playlist
          </h2>
          <p className="text-lg text-[#ffb871]" style={{ marginBottom: '24px' }}>
            {error}
          </p>
          <PillButton
            id="playlist-close-btn"
            groupId={TRAP_ID}
            order={1}
            variant="secondary"
            icon={<X className="w-5 h-5" />}
            marginRight="0px"
            onSelect={onClose}
          >
            Back
          </PillButton>
        </div>
      ) : summary ? (
        <>
          {/* Hero Header */}
          <div className="relative w-full bg-gradient-to-b from-[#281216] via-[#171820] to-[#121318] px-14 pt-10 pb-8 border-b border-[rgba(255,255,255,0.08)] shrink-0">
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <PlaylistCoverMosaic
                coverPosterUrls={summary.cover_poster_urls}
                serverUrl={serverUrl}
                token={token}
                unlockTokens={unlockTokens}
                lockedItemCount={summary.locked_item_count}
                isPublic={summary.is_public}
                title={summary.name}
                className="w-56 h-56 rounded-3xl shadow-2xl border border-[rgba(255,122,24,0.22)] shrink-0"
              />

              <div style={{ marginLeft: '36px', flex: 1, minWidth: 0 }}>
                {/* Metadata badges */}
                <div
                  className="font-mono text-xs font-bold uppercase"
                  style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}
                >
                  <span
                    className="px-2.5 py-1 rounded bg-[#281216] text-[#ff9f2e] border border-[#ff7a18]/30 inline-flex items-center"
                    style={{ marginRight: '10px', marginBottom: '4px' }}
                  >
                    {summary.is_public ? (
                      <>
                        <Globe className="w-3.5 h-3.5 text-[#10b981]" style={{ marginRight: '6px' }} />
                        Public Playlist
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-[#ffb871]" style={{ marginRight: '6px' }} />
                        Private Playlist
                      </>
                    )}
                  </span>

                  {summary.owner_username && (
                    <span
                      className="px-2.5 py-1 rounded bg-[#292a2f] text-[#e3e1e9] inline-flex items-center"
                      style={{ marginRight: '10px', marginBottom: '4px' }}
                    >
                      <User className="w-3.5 h-3.5 text-[#ffb871]" style={{ marginRight: '6px' }} />
                      {summary.owner_username}
                    </span>
                  )}

                  {summary.locked_item_count > 0 && (
                    <span
                      data-testid="detail-locked-count-badge"
                      className="px-2.5 py-1 rounded bg-[#3B1111] text-[#ffb871] border border-[#ff7a18]/40 inline-flex items-center"
                      style={{ marginRight: '10px', marginBottom: '4px' }}
                    >
                      <Lock className="w-3.5 h-3.5" style={{ marginRight: '6px' }} />
                      +{summary.locked_item_count} locked
                    </span>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-5xl font-extrabold text-white tracking-tight truncate">
                  {summary.name}
                </h1>

                {/* Counts & Duration */}
                <div
                  className="text-lg text-[#a8a29e] font-medium"
                  style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '20px' }}>
                    <Film className="w-5 h-5 text-[#ff9f2e]" style={{ marginRight: '8px' }} />
                    {summary.visible_item_count}{' '}
                    {summary.visible_item_count === 1 ? 'item' : 'items'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <Clock className="w-5 h-5 text-[#ffb871]" style={{ marginRight: '8px' }} />
                    {formatPlaylistDuration(summary.total_duration_seconds)}
                  </span>
                </div>

                {summary.description && (
                  <p
                    className="text-lg text-[#e0c0b0] line-clamp-2 max-w-4xl"
                    style={{ marginTop: '10px' }}
                  >
                    {summary.description}
                  </p>
                )}

                {/* Action Strip */}
                <div
                  data-testid="playlist-detail-actions"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginTop: '24px',
                  }}
                >
                  <TVButton
                    id="playlist-play-all-btn"
                    groupId={TRAP_ID}
                    order={playAllOrder}
                    variant="primary"
                    autoFocus
                    disabled={items.length === 0}
                    onClick={handlePlayAll}
                    onEnter={handlePlayAll}
                    style={{
                      padding: '16px 26px',
                      marginRight: '16px',
                      marginBottom: '8px',
                      borderRadius: '12px',
                    }}
                  >
                    <Play
                      className="w-6 h-6 fill-current shrink-0"
                      style={{ marginRight: '10px' }}
                    />
                    <span>Play All</span>
                  </TVButton>

                  <TVButton
                    id="playlist-shuffle-btn"
                    groupId={TRAP_ID}
                    order={shuffleOrder}
                    variant="secondary"
                    disabled={items.length === 0}
                    onClick={handleShuffle}
                    onEnter={handleShuffle}
                    style={{
                      padding: '16px 22px',
                      marginRight: '16px',
                      marginBottom: '8px',
                      borderRadius: '12px',
                    }}
                  >
                    <Shuffle
                      className="w-5 h-5 text-[#ffb871] shrink-0"
                      style={{ marginRight: '10px' }}
                    />
                    <span>Shuffle</span>
                  </TVButton>

                  {isEditable && (
                    <>
                      <TVButton
                        id="playlist-edit-btn"
                        groupId={TRAP_ID}
                        order={editOrder}
                        variant="secondary"
                        onClick={() => setIsEditOpen(true)}
                        onEnter={() => setIsEditOpen(true)}
                        style={{
                          padding: '16px 22px',
                          marginRight: '16px',
                          marginBottom: '8px',
                          borderRadius: '12px',
                        }}
                      >
                        <Pencil
                          className="w-5 h-5 text-[#ffb871] shrink-0"
                          style={{ marginRight: '10px' }}
                        />
                        <span>Edit</span>
                      </TVButton>

                      <TVButton
                        id="playlist-delete-btn"
                        groupId={TRAP_ID}
                        order={deleteOrder}
                        variant="danger"
                        onClick={() => setConfirmingDelete(true)}
                        onEnter={() => setConfirmingDelete(true)}
                        style={{
                          padding: '16px 22px',
                          marginRight: '16px',
                          marginBottom: '8px',
                          borderRadius: '12px',
                        }}
                      >
                        <Trash2 className="w-5 h-5 shrink-0" style={{ marginRight: '10px' }} />
                        <span>Delete Playlist</span>
                      </TVButton>
                    </>
                  )}

                  <TVButton
                    id="playlist-close-btn"
                    groupId={TRAP_ID}
                    order={closeOrder}
                    variant="secondary"
                    onClick={onClose}
                    onEnter={onClose}
                    style={{
                      padding: '16px 22px',
                      marginRight: '0px',
                      marginBottom: '8px',
                      borderRadius: '12px',
                    }}
                  >
                    <X
                      className="w-5 h-5 text-[#ffb871] shrink-0"
                      style={{ marginRight: '10px' }}
                    />
                    <span>Back</span>
                  </TVButton>
                </div>

                {/* Inline Delete Confirmation */}
                {confirmingDelete && (
                  <div
                    data-testid="playlist-delete-confirm-bar"
                    className="p-4 rounded-2xl bg-[#3B1111] border border-[#D43F15]/50"
                    style={{
                      marginTop: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span className="text-lg font-semibold text-white" style={{ marginRight: '16px' }}>
                      Permanently delete &ldquo;{summary.name}&rdquo;?
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <PillButton
                        id="playlist-confirm-delete-btn"
                        groupId={TRAP_ID}
                        order={confirmDeleteOrder}
                        variant="primary"
                        size="sm"
                        icon={<Trash2 className="w-4 h-4" />}
                        marginRight="12px"
                        onSelect={handleConfirmDelete}
                      >
                        Confirm Delete
                      </PillButton>
                      <PillButton
                        id="playlist-cancel-delete-btn"
                        groupId={TRAP_ID}
                        order={cancelDeleteOrder}
                        variant="secondary"
                        size="sm"
                        marginRight="0px"
                        onSelect={() => setConfirmingDelete(false)}
                      >
                        Cancel
                      </PillButton>
                    </div>
                  </div>
                )}

                {actionError && (
                  <div
                    role="alert"
                    className="px-4 py-3 rounded-xl bg-[#D43F15]/20 border border-[#D43F15]/40 text-[#ffb871] text-base"
                    style={{ marginTop: '14px' }}
                  >
                    {actionError}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Queue Items List */}
          <div className="flex-1 px-14 py-8">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}
            >
              <h2 className="text-2xl font-bold text-white">Queue</h2>
              {summary.locked_item_count > 0 && (
                <span className="text-sm font-mono text-[#ffb871]">
                  {summary.locked_item_count} hidden item(s) in locked private libraries preserved
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div
                data-testid="playlist-empty-items"
                className="p-12 rounded-3xl bg-[#181920] border border-[rgba(255,255,255,0.06)] text-center"
              >
                <p className="text-xl font-semibold text-[#e3e1e9]">
                  This playlist has no visible items.
                </p>
                {summary.locked_item_count > 0 && (
                  <p className="text-base text-[#ffb871]" style={{ marginTop: '8px' }}>
                    Unlock private libraries to view {summary.locked_item_count} hidden item(s).
                  </p>
                )}
              </div>
            ) : (
              <div data-testid="playlist-items-list">
                {items.map((entry, idx) => {
                  const card = entry.card;
                  const artworkUrl = getAuthenticatedImageUrl(
                    serverUrl,
                    card.poster_url || card.backdrop_url || `/api/v1/artwork/${card.id}/poster`,
                    token,
                    unlockTokens
                  );

                  const itemPlayOrder = nextOrder++;
                  const itemDetailsOrder = onSelectItem ? nextOrder++ : undefined;
                  const itemUpOrder = isEditable ? nextOrder++ : undefined;
                  const itemDownOrder = isEditable ? nextOrder++ : undefined;
                  const itemRemoveOrder = isEditable ? nextOrder++ : undefined;

                  return (
                    <PlaylistQueueItemRow
                      key={`${card.id}-${idx}`}
                      entry={entry}
                      index={idx}
                      totalCount={items.length}
                      artworkUrl={artworkUrl}
                      isEditable={isEditable}
                      busyAction={busyAction}
                      hasSelectItem={Boolean(onSelectItem)}
                      itemPlayOrder={itemPlayOrder}
                      itemDetailsOrder={itemDetailsOrder}
                      itemUpOrder={itemUpOrder}
                      itemDownOrder={itemDownOrder}
                      itemRemoveOrder={itemRemoveOrder}
                      onPlayFromIndex={handlePlayFromIndex}
                      onSelectItem={onSelectItem}
                      onMoveItem={handleMoveItem}
                      onRemoveItem={handleRemoveItem}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {isEditOpen && (
            <CreateEditPlaylistModal
              isOpen={isEditOpen}
              mode="edit"
              client={client}
              playlistId={summary.id}
              initialName={summary.name}
              initialDescription={summary.description || ''}
              initialIsPublic={summary.is_public}
              onClose={() => setIsEditOpen(false)}
              onUpdated={handleMetadataUpdated}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
