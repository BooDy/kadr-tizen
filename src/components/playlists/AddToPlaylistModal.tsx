import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
  type MutableRefObject,
} from 'react';
import {
  Plus,
  CheckCircle2,
  Globe,
  Lock,
  FolderTree,
  Tv,
  X,
  Loader2,
  ListPlus,
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import {
  fetchPlaylists,
  addPlaylistItems,
  createPlaylist,
  PlaylistSummary,
  AddPlaylistItemsRequest,
} from '../../api/playlists';
import { useFocusContext } from '../../navigation/FocusContext';
import { useFocusable, isTextInputElement } from '../../navigation/useFocusable';
import { TVKeys } from '../../navigation/keys';
import { PillButton } from '../tv/PillButton';
import { PlaylistCoverMosaic } from './PlaylistCoverMosaic';

export type AddToPlaylistTarget =
  | {
      kind: 'item';
      itemId: number;
      title: string;
    }
  | {
      kind: 'show';
      showId: number;
      title: string;
      seasons?: number[];
      defaultSeason?: number;
    }
  | {
      kind: 'folder';
      libraryId: string;
      path: string;
      folderName: string;
    };

export interface AddToPlaylistModalProps {
  isOpen: boolean;
  client: ApiClient;
  serverUrl: string;
  token?: string;
  target: AddToPlaylistTarget | null;
  onClose: () => void;
  onSuccess?: (result: {
    playlistId: string;
    playlistName: string;
    addedCount?: number;
    skippedDuplicateCount?: number;
  }) => void;
  onLockedLibrary?: (libraryId?: string) => void;
}

const TRAP_ID = 'add-to-playlist-modal';

interface AddToPlaylistFocusBridgeProps {
  isOpen: boolean;
  hasTarget: boolean;
  loading: boolean;
  pendingInitialFocusId: string | null;
  onClearPendingFocus: () => void;
  onClose: () => void;
  setFocusedIdRef: MutableRefObject<((id: string | null) => void) | null>;
}

function AddToPlaylistFocusBridge({
  isOpen,
  hasTarget,
  loading,
  pendingInitialFocusId,
  onClearPendingFocus,
  onClose,
  setFocusedIdRef,
}: AddToPlaylistFocusBridgeProps) {
  const { pushTrap, popTrap, activeTrap, setFocusedId } = useFocusContext();
  setFocusedIdRef.current = setFocusedId;

  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !hasTarget) return;
    pushTrap(TRAP_ID);
    return () => {
      popTrap(TRAP_ID);
    };
  }, [isOpen, hasTarget, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen || !hasTarget || loading || !pendingInitialFocusId) return;
    if (activeTrap && activeTrap !== TRAP_ID) return;
    const idToFocus = pendingInitialFocusId;
    onClearPendingFocus();
    setFocusedId(idToFocus);
  }, [
    isOpen,
    hasTarget,
    loading,
    pendingInitialFocusId,
    activeTrap,
    onClearPendingFocus,
    setFocusedId,
  ]);

  useEffect(() => {
    if (!isOpen || !hasTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTrapRef.current && activeTrapRef.current !== TRAP_ID) return;
      const el = e.target as HTMLElement | null;
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const isEditingInput = isTextInputElement(activeEl);
      const code = e.keyCode || e.which;

      if (
        (code === TVKeys.BACKSPACE || e.key === 'Backspace') &&
        (isEditingInput || isTextInputElement(el))
      ) {
        return;
      }

      if (isEditingInput && (code === TVKeys.IME_DONE || code === TVKeys.IME_CANCEL)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        activeEl.blur();
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
        if (isEditingInput) {
          activeEl.blur();
          return;
        }
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, hasTarget]);

  return null;
}

interface PlaylistOptionRowProps {
  playlist: PlaylistSummary;
  order: number;
  serverUrl: string;
  token?: string;
  unlockTokens: string[];
  showMembership: boolean;
  disabled: boolean;
  onSelect: (playlist: PlaylistSummary) => void;
}

const PlaylistOptionRow = memo(function PlaylistOptionRow({
  playlist,
  order,
  serverUrl,
  token,
  unlockTokens,
  showMembership,
  disabled,
  onSelect,
}: PlaylistOptionRowProps) {
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id: `add-to-playlist-option-${playlist.id}`,
    groupId: TRAP_ID,
    order,
    onEnter: () => {
      if (!disabled) onSelect(playlist);
    },
  });

  const isMember = showMembership && Boolean(playlist.contains_queried_item);

  return (
    <button
      ref={ref}
      id={`add-to-playlist-option-${playlist.id}`}
      data-testid={`add-to-playlist-option-${playlist.id}`}
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect(playlist);
      }}
      style={{ marginBottom: '12px' }}
      className={`w-full flex items-center justify-between p-4 rounded-2xl text-left transition-transform duration-75 cursor-pointer outline-none ${
        isFocused
          ? 'bg-[#292a2f] border-2 border-[#ff7a18] tv-focus-ring scale-[1.01]'
          : 'bg-[#1a1b21] border border-[rgba(255,255,255,0.08)] hover:bg-[#22232a]'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
        <PlaylistCoverMosaic
          coverPosterUrls={playlist.cover_poster_urls}
          serverUrl={serverUrl}
          token={token}
          unlockTokens={unlockTokens}
          showBadges={false}
          title={playlist.name}
          className="w-16 h-16 rounded-xl shrink-0"
        />
        <div style={{ marginLeft: '16px', minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="text-xl font-bold text-white truncate">{playlist.name}</span>
            <span
              className="font-mono text-xs px-2 py-0.5 rounded bg-[#0d0e15] text-[#a8a29e] border border-[rgba(255,255,255,0.08)] shrink-0"
              style={{ marginLeft: '10px', display: 'inline-flex', alignItems: 'center' }}
            >
              {playlist.is_public ? (
                <>
                  <Globe className="w-3 h-3 text-[#10b981]" style={{ marginRight: '4px' }} />
                  Public
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-[#ffb871]" style={{ marginRight: '4px' }} />
                  Private
                </>
              )}
            </span>
          </div>
          <div className="text-sm text-[#a8a29e] font-mono" style={{ marginTop: '4px' }}>
            {playlist.visible_item_count}{' '}
            {playlist.visible_item_count === 1 ? 'item' : 'items'}
            {playlist.locked_item_count > 0 ? ` • +${playlist.locked_item_count} locked` : ''}
          </div>
        </div>
      </div>

      <div style={{ marginLeft: '16px', flexShrink: 0 }}>
        {isMember ? (
          <span
            data-testid={`in-playlist-badge-${playlist.id}`}
            className="px-3 py-1.5 rounded-lg bg-[#10b981]/15 border border-[#10b981]/40 text-[#10b981] font-mono text-xs font-bold inline-flex items-center"
          >
            <CheckCircle2 className="w-4 h-4" style={{ marginRight: '6px' }} />
            In Playlist
          </span>
        ) : (
          <span className="px-3 py-1.5 rounded-lg bg-[#281216] border border-[#ff7a18]/30 text-[#ffb871] font-mono text-xs font-bold inline-flex items-center">
            <Plus className="w-4 h-4" style={{ marginRight: '4px' }} />
            Add
          </span>
        )}
      </div>
    </button>
  );
});

export function AddToPlaylistModal({
  isOpen,
  client,
  serverUrl,
  token,
  target,
  onClose,
  onSuccess,
  onLockedLibrary,
}: AddToPlaylistModalProps) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Scope options for Show & Folder targets
  const [showScope, setShowScope] = useState<'all' | number>('all');
  const [recursive, setRecursive] = useState<boolean>(false);

  // 1-step Create & Add form state
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newIsPublic, setNewIsPublic] = useState<boolean>(false);

  const [pendingInitialFocusId, setPendingInitialFocusId] = useState<string | null>(null);
  const setFocusedIdRef = useRef<((id: string | null) => void) | null>(null);

  const clearPendingFocus = useCallback(() => {
    setPendingInitialFocusId(null);
  }, []);

  const unlockTokens = useMemo(
    () => (client?.getUnlockTokens ? client.getUnlockTokens() : []),
    [client]
  );

  useEffect(() => {
    if (!isOpen || !target) return;
    setError(null);
    setSubmitting(false);
    setShowScope('all');
    setRecursive(false);
    setNewName('');
    setNewDescription('');
    setNewIsPublic(false);
    setShowCreateForm(false);
    setPendingInitialFocusId(null);

    let cancelled = false;
    setLoading(true);
    const containsId = target.kind === 'item' ? target.itemId : undefined;
    fetchPlaylists(client, containsId)
      .then((list) => {
        if (cancelled) return;
        const safeList = Array.isArray(list) ? list : [];
        setPlaylists(safeList);
        const editable = safeList.filter((p) => p.is_editable);
        if (editable.length === 0) {
          setShowCreateForm(true);
          if (target.kind === 'item') {
            setPendingInitialFocusId('add-playlist-new-name-input');
          }
        } else if (target.kind === 'item') {
          setPendingInitialFocusId(`add-to-playlist-option-${editable[0].id}`);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPlaylists([]);
        setShowCreateForm(true);
        if (target.kind === 'item') {
          setPendingInitialFocusId('add-playlist-new-name-input');
        }
        setLoading(false);
        const msg = err instanceof Error ? err.message : '';
        if (msg && !msg.includes('undefined')) {
          setError(msg);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, target, client]);

  const editablePlaylists = useMemo(
    () => playlists.filter((p) => p.is_editable),
    [playlists]
  );

  const buildItemsRequest = useCallback((): AddPlaylistItemsRequest => {
    if (!target) return {};
    if (target.kind === 'item') {
      return { item_ids: [Number(target.itemId)] };
    }
    if (target.kind === 'show') {
      if (showScope === 'all') {
        return { show: { show_id: Number(target.showId) } };
      }
      return {
        show: {
          show_id: Number(target.showId),
          season_number: showScope,
        },
      };
    }
    return {
      folder: {
        library_id: target.libraryId,
        path: target.path,
        recursive,
      },
    };
  }, [target, showScope, recursive]);

  const handleApiError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to add to playlist';
      setError(msg);
      if (msg.includes('403') || msg.includes('LIBRARY_LOCKED')) {
        onLockedLibrary?.(target?.kind === 'folder' ? target.libraryId : undefined);
      }
    },
    [onLockedLibrary, target]
  );

  const handleSelectExisting = useCallback(
    async (playlist: PlaylistSummary) => {
      if (submitting || !target) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await addPlaylistItems(client, playlist.id, buildItemsRequest());
        onSuccess?.({
          playlistId: playlist.id,
          playlistName: playlist.name,
          addedCount: res?.added_count,
          skippedDuplicateCount: res?.skipped_duplicate_count,
        });
        onClose();
      } catch (err: unknown) {
        setSubmitting(false);
        handleApiError(err);
      }
    },
    [submitting, target, client, buildItemsRequest, onSuccess, onClose, handleApiError]
  );

  const handleCreateAndAdd = async () => {
    if (submitting || !target) return;
    const trimmedName = newName.trim();
    const trimmedDesc = newDescription.trim();
    if (trimmedName.length < 1 || trimmedName.length > 120) {
      setError('Playlist name must be between 1 and 120 characters.');
      return;
    }
    if (trimmedDesc.length > 500) {
      setError('Description must be 500 characters or fewer.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const detail = await createPlaylist(client, {
        name: trimmedName,
        description: trimmedDesc || undefined,
        is_public: newIsPublic,
        items: buildItemsRequest(),
      });
      onSuccess?.({
        playlistId: detail.summary.id,
        playlistName: detail.summary.name,
        addedCount: detail.items?.length ?? detail.summary.visible_item_count,
      });
      onClose();
    } catch (err: unknown) {
      setSubmitting(false);
      handleApiError(err);
    }
  };

  // Compute deterministic sequential orders for JSDOM & D-pad navigation
  const seasonOptions = useMemo(() => {
    if (!target || target.kind !== 'show') return [];
    if (target.seasons && target.seasons.length > 0) return target.seasons;
    if (target.defaultSeason !== undefined) return [target.defaultSeason];
    return [];
  }, [target]);

  let nextOrder = 1;
  const showAllOrder = target?.kind === 'show' ? nextOrder++ : undefined;
  const showSeasonOrders = seasonOptions.map(() => nextOrder++);
  const folderRecursiveOrder = target?.kind === 'folder' ? nextOrder++ : undefined;
  const playlistBaseOrder = nextOrder;
  nextOrder += editablePlaylists.length;
  const toggleCreateOrder = nextOrder++;
  const newNameOrder = showCreateForm ? nextOrder++ : undefined;
  const newDescOrder = showCreateForm ? nextOrder++ : undefined;
  const newPublicOrder = showCreateForm ? nextOrder++ : undefined;
  const createSubmitOrder = showCreateForm ? nextOrder++ : undefined;
  const closeOrder = nextOrder++;

  const recursiveToggleFocus = useFocusable<HTMLButtonElement>({
    id: 'add-playlist-recursive-toggle',
    groupId: TRAP_ID,
    order: folderRecursiveOrder ?? 999,
    onEnter: () => setRecursive((prev) => !prev),
  });

  const newNameFocus = useFocusable<HTMLInputElement>({
    id: 'add-playlist-new-name-input',
    groupId: TRAP_ID,
    order: newNameOrder ?? 999,
  });

  const newDescFocus = useFocusable<HTMLInputElement>({
    id: 'add-playlist-new-desc-input',
    groupId: TRAP_ID,
    order: newDescOrder ?? 999,
  });

  const newPublicFocus = useFocusable<HTMLButtonElement>({
    id: 'add-playlist-new-public-toggle',
    groupId: TRAP_ID,
    order: newPublicOrder ?? 999,
    onEnter: () => setNewIsPublic((prev) => !prev),
  });

  if (!isOpen || !target) return null;

  const targetSubtitle =
    target.kind === 'item'
      ? target.title
      : target.kind === 'show'
      ? showScope === 'all'
        ? `${target.title} (All Seasons)`
        : `${target.title} (Season ${showScope})`
      : `${target.folderName || target.path || 'Root Folder'}${
          recursive ? ' (Including Subfolders)' : ' (Current Folder Only)'
        }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add to Playlist"
      className="fixed inset-0 z-[75] bg-[#090a0f]/95 flex items-center justify-center p-10 select-none"
    >
      <AddToPlaylistFocusBridge
        isOpen={isOpen}
        hasTarget={Boolean(target)}
        loading={loading}
        pendingInitialFocusId={pendingInitialFocusId}
        onClearPendingFocus={clearPendingFocus}
        onClose={onClose}
        setFocusedIdRef={setFocusedIdRef}
      />
      <div className="w-full max-w-3xl max-h-[920px] bg-[#121318] border border-[rgba(255,122,24,0.25)] rounded-3xl p-10 shadow-2xl text-[#e3e1e9] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div
          className="shrink-0"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '20px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <ListPlus
                className="w-7 h-7 text-[#ff7a18] shrink-0"
                style={{ marginRight: '10px' }}
              />
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                Add to Playlist
              </h2>
            </div>
            <p className="text-base text-[#ffb871] font-medium truncate">{targetSubtitle}</p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-none">
          {/* Show Scope Selector */}
          {target.kind === 'show' && (
            <div
              data-testid="add-playlist-show-scope"
              style={{ marginBottom: '20px' }}
            >
              <div
                className="font-mono text-xs uppercase tracking-wider text-[#a8a29e]"
                style={{ marginBottom: '10px' }}
              >
                Episodes to Add
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ marginBottom: '8px' }}>
                  <PillButton
                    id="add-playlist-scope-show"
                    groupId={TRAP_ID}
                    order={showAllOrder}
                    variant={showScope === 'all' ? 'current' : 'secondary'}
                    size="sm"
                    icon={<Tv className="w-4 h-4" />}
                    marginRight="12px"
                    onSelect={() => setShowScope('all')}
                  >
                    Whole Show
                  </PillButton>
                </div>
                {seasonOptions.map((seasonNum, idx) => (
                  <div key={seasonNum} style={{ marginBottom: '8px' }}>
                    <PillButton
                      id={`add-playlist-scope-season-${seasonNum}`}
                      groupId={TRAP_ID}
                      order={showSeasonOrders[idx]}
                      variant={showScope === seasonNum ? 'current' : 'secondary'}
                      size="sm"
                      marginRight="12px"
                      onSelect={() => setShowScope(seasonNum)}
                    >
                      {`Season ${seasonNum}`}
                    </PillButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Folder Recursive Toggle */}
          {target.kind === 'folder' && (
            <div style={{ marginBottom: '20px' }}>
              <button
                ref={recursiveToggleFocus.ref}
                id="add-playlist-recursive-toggle"
                type="button"
                tabIndex={-1}
                aria-pressed={recursive}
                onClick={() => setRecursive((prev) => !prev)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-left cursor-pointer outline-none ${
                  recursiveToggleFocus.isFocused
                    ? 'bg-[#292a2f] border-2 border-[#ff7a18] tv-focus-ring'
                    : 'bg-[#1a1b21] border border-[rgba(255,255,255,0.1)]'
                }`}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <FolderTree
                    className="w-6 h-6 text-[#ff9f2e] shrink-0"
                    style={{ marginRight: '14px' }}
                  />
                  <div>
                    <div className="text-lg font-bold text-white">Include Subfolders</div>
                    <div className="text-sm text-[#a8a29e]">
                      Recursively expand all playable media inside nested subfolders
                    </div>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded font-mono text-xs font-bold uppercase ${
                    recursive
                      ? 'bg-[#ff7a18]/20 text-[#ffb871] border border-[#ff7a18]/50'
                      : 'bg-[#292a2f] text-[#a8a29e] border border-[rgba(255,255,255,0.1)]'
                  }`}
                >
                  {recursive ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          )}

          {/* Existing Editable Playlists */}
          <div style={{ marginBottom: '20px' }}>
            <div
              className="font-mono text-xs uppercase tracking-wider text-[#a8a29e]"
              style={{ marginBottom: '10px' }}
            >
              Select Existing Playlist
            </div>

            {loading ? (
              <div
                className="flex items-center justify-center py-8 text-[#a8a29e]"
                data-testid="add-playlist-loading"
              >
                <Loader2
                  className="w-6 h-6 animate-spin text-[#ff7a18]"
                  style={{ marginRight: '10px' }}
                />
                <span>Loading playlists...</span>
              </div>
            ) : editablePlaylists.length > 0 ? (
              <div>
                {editablePlaylists.map((pl, idx) => (
                  <PlaylistOptionRow
                    key={pl.id}
                    playlist={pl}
                    order={playlistBaseOrder + idx}
                    serverUrl={serverUrl}
                    token={token}
                    unlockTokens={unlockTokens}
                    showMembership={target.kind === 'item'}
                    disabled={submitting}
                    onSelect={handleSelectExisting}
                  />
                ))}
              </div>
            ) : (
              <div className="px-5 py-4 rounded-2xl bg-[#1a1b21] border border-[rgba(255,255,255,0.06)] text-[#a8a29e] text-base">
                No editable playlists yet — create one below to add directly in one step.
              </div>
            )}
          </div>

          {/* 1-Step Create & Add Section */}
          <div
            className="pt-4 border-t border-[rgba(255,255,255,0.08)]"
            style={{ marginBottom: '16px' }}
          >
            <div style={{ marginBottom: showCreateForm ? '16px' : '0px' }}>
              <PillButton
                id="add-playlist-toggle-create-btn"
                groupId={TRAP_ID}
                order={toggleCreateOrder}
                variant={showCreateForm ? 'current' : 'secondary'}
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                marginRight="0px"
                onSelect={() => {
                  setShowCreateForm((prev) => {
                    const next = !prev;
                    if (next) {
                      setTimeout(() => setFocusedIdRef.current?.('add-playlist-new-name-input'), 0);
                    }
                    return next;
                  });
                }}
              >
                {showCreateForm ? 'New Playlist Details' : 'Create New Playlist & Add'}
              </PillButton>
            </div>

            {showCreateForm && (
              <div
                data-testid="create-and-add-form"
                className="p-5 rounded-2xl bg-[#181920] border border-[rgba(255,122,24,0.2)]"
              >
                <div style={{ marginBottom: '14px' }}>
                  <label
                    htmlFor="add-playlist-new-name-input"
                    className="block text-xs font-mono uppercase tracking-wider text-[#a8a29e]"
                    style={{ marginBottom: '6px' }}
                  >
                    New Playlist Name
                  </label>
                  <input
                    ref={newNameFocus.ref}
                    id="add-playlist-new-name-input"
                    type="text"
                    maxLength={120}
                    value={newName}
                    onFocus={() => setFocusedIdRef.current?.('add-playlist-new-name-input')}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Weekend Watchlist"
                    className={`w-full bg-[#0d0e15] px-4 py-3.5 rounded-xl text-lg text-white outline-none ${
                      newNameFocus.isFocused
                        ? 'border-2 border-[#ff7a18] tv-focus-ring'
                        : 'border border-[rgba(255,255,255,0.12)]'
                    }`}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label
                    htmlFor="add-playlist-new-desc-input"
                    className="block text-xs font-mono uppercase tracking-wider text-[#a8a29e]"
                    style={{ marginBottom: '6px' }}
                  >
                    Description (Optional)
                  </label>
                  <input
                    ref={newDescFocus.ref}
                    id="add-playlist-new-desc-input"
                    type="text"
                    maxLength={500}
                    value={newDescription}
                    onFocus={() => setFocusedIdRef.current?.('add-playlist-new-desc-input')}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Optional description..."
                    className={`w-full bg-[#0d0e15] px-4 py-3 rounded-xl text-base text-white outline-none ${
                      newDescFocus.isFocused
                        ? 'border-2 border-[#ff7a18] tv-focus-ring'
                        : 'border border-[rgba(255,255,255,0.12)]'
                    }`}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    ref={newPublicFocus.ref}
                    id="add-playlist-new-public-toggle"
                    type="button"
                    tabIndex={-1}
                    aria-pressed={newIsPublic}
                    onClick={() => setNewIsPublic((prev) => !prev)}
                    style={{ marginRight: '16px' }}
                    className={`flex items-center px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer outline-none ${
                      newPublicFocus.isFocused
                        ? 'bg-[#292a2f] border-2 border-[#ff7a18] text-white tv-focus-ring'
                        : 'bg-[#0d0e15] border border-[rgba(255,255,255,0.12)] text-[#e3e1e9]'
                    }`}
                  >
                    {newIsPublic ? (
                      <Globe
                        className="w-4 h-4 text-[#10b981]"
                        style={{ marginRight: '8px' }}
                      />
                    ) : (
                      <Lock
                        className="w-4 h-4 text-[#ffb871]"
                        style={{ marginRight: '8px' }}
                      />
                    )}
                    <span>{newIsPublic ? 'Public on Server' : 'Private Playlist'}</span>
                  </button>

                  <PillButton
                    id="add-playlist-create-submit-btn"
                    groupId={TRAP_ID}
                    order={createSubmitOrder}
                    variant="primary"
                    size="sm"
                    icon={<Plus className="w-4 h-4" />}
                    marginRight="0px"
                    onSelect={handleCreateAndAdd}
                  >
                    {submitting ? 'Creating...' : 'Create & Add'}
                  </PillButton>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="px-4 py-3 rounded-xl bg-[#D43F15]/15 border border-[#D43F15]/40 text-[#ffb871] text-base"
              style={{ marginBottom: '12px' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 pt-4 border-t border-[rgba(255,255,255,0.08)]"
          style={{ display: 'flex', justifyContent: 'flex-end' }}
        >
          <PillButton
            id="add-playlist-close-btn"
            groupId={TRAP_ID}
            order={closeOrder}
            variant="secondary"
            icon={<X className="w-5 h-5" />}
            marginRight="0px"
            onSelect={onClose}
          >
            Cancel
          </PillButton>
        </div>
      </div>
    </div>
  );
}
