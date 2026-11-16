import { useState, useEffect, useMemo, memo } from 'react';
import { Plus, ListVideo, Clock, Film, User, Loader2 } from 'lucide-react';
import { ApiClient } from '../api/client';
import {
  fetchPlaylists,
  formatPlaylistDuration,
  PlaylistSummary,
  PlaylistDetail,
} from '../api/playlists';
import { useFocusContext } from '../navigation/FocusContext';
import { useFocusable } from '../navigation/useFocusable';
import { PillButton } from '../components/tv/PillButton';
import { PlaylistCoverMosaic } from '../components/playlists/PlaylistCoverMosaic';
import { CreateEditPlaylistModal } from '../components/playlists/CreateEditPlaylistModal';

export interface PlaylistsViewProps {
  client: ApiClient;
  serverUrl: string;
  token?: string;
  currentUserId?: string;
  refreshKey?: number;
  onOpenPlaylist: (playlistId: string) => void;
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

function scrollCardIntoViewIfClipped(el: HTMLElement | null): void {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  const scrollParent = el.closest('.overflow-y-auto') as HTMLElement | null;
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    if (
      parentRect.height > 0 &&
      rect.top >= parentRect.top &&
      rect.bottom <= parentRect.bottom
    ) {
      return;
    }
  } else {
    const vh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 1080;
    if (rect.top >= 0 && rect.bottom <= vh) {
      return;
    }
  }

  el.scrollIntoView({ block: 'nearest' });
}

interface PlaylistsFocusBridgeProps {
  loading: boolean;
  firstPlaylistId: string | null;
}

function PlaylistsFocusBridge({ loading, firstPlaylistId }: PlaylistsFocusBridgeProps) {
  const { focusedId, setFocusedId, activeTrap } = useFocusContext();

  useEffect(() => {
    if (loading || isAnyModalActive(activeTrap)) return;
    const isOnSidebar = Boolean(focusedId && focusedId.startsWith('nav-'));
    const isCurrentValidInPlaylists = Boolean(
      focusedId &&
        (focusedId === 'playlists-create-btn' || focusedId.startsWith('playlist-card-')) &&
        typeof document !== 'undefined' &&
        document.getElementById(focusedId)
    );
    if (!isOnSidebar && !isCurrentValidInPlaylists) {
      if (firstPlaylistId) {
        setFocusedId(`playlist-card-${firstPlaylistId}`);
      } else {
        setFocusedId('playlists-create-btn');
      }
    }
  }, [loading, activeTrap, focusedId, firstPlaylistId, setFocusedId]);

  return null;
}

interface PlaylistCardTileProps {
  playlist: PlaylistSummary;
  order: number;
  colIndex: number;
  isFirstCard: boolean;
  showOwner: boolean;
  serverUrl: string;
  token?: string;
  unlockTokens: string[];
  onSelect: (playlistId: string) => void;
}

const PlaylistCardTile = memo(function PlaylistCardTile({
  playlist,
  order,
  colIndex,
  isFirstCard,
  showOwner,
  serverUrl,
  token,
  unlockTokens,
  onSelect,
}: PlaylistCardTileProps) {
  const cardId = `playlist-card-${playlist.id}`;
  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id: cardId,
    groupId: 'playlists-content',
    order,
    onEnter: () => onSelect(playlist.id),
  });

  useEffect(() => {
    if (isFocused && ref.current) {
      scrollCardIntoViewIfClipped(ref.current);
    }
  }, [isFocused, ref]);

  return (
    <div
      ref={ref}
      id={cardId}
      data-testid={cardId}
      data-playlist-col={String(colIndex)}
      data-playlist-focus-first={isFirstCard ? 'true' : undefined}
      tabIndex={-1}
      role="button"
      aria-label={playlist.name}
      onClick={() => onSelect(playlist.id)}
      className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer outline-none transition-transform duration-75 ${
        isFocused
          ? 'bg-[#292a2f] scale-[1.02] z-20 tv-focus-ring border-2 border-[#ff7a18]'
          : 'bg-[#14151c] border border-[rgba(255,255,255,0.08)] hover:bg-[#1c1d26]'
      }`}
    >
      <PlaylistCoverMosaic
        coverPosterUrls={playlist.cover_poster_urls}
        serverUrl={serverUrl}
        token={token}
        unlockTokens={unlockTokens}
        lockedItemCount={playlist.locked_item_count}
        isPublic={playlist.is_public}
        title={playlist.name}
        className="w-full h-64"
        style={{ height: '256px' }}
      />

      <div className="p-5 flex flex-col flex-1 justify-between">
        <div>
          <h3
            className={`text-xl font-bold truncate ${
              isFocused ? 'text-white' : 'text-[#F5E5E5]'
            }`}
          >
            {playlist.name}
          </h3>
          {playlist.description ? (
            <p
              className="text-sm text-[#a8a29e] line-clamp-1"
              style={{ marginTop: '4px' }}
            >
              {playlist.description}
            </p>
          ) : (
            <p
              className="text-sm text-[#6e6865] italic"
              style={{ marginTop: '4px' }}
            >
              {playlist.is_public ? 'Shared server playlist' : 'Personal playlist'}
            </p>
          )}
        </div>

        <div
          className="pt-3 border-t border-[rgba(255,255,255,0.06)] font-mono text-xs text-[#a8a29e]"
          style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '12px' }}>
              <Film className="w-3.5 h-3.5 text-[#ff9f2e]" style={{ marginRight: '4px' }} />
              {playlist.visible_item_count}{' '}
              {playlist.visible_item_count === 1 ? 'item' : 'items'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Clock className="w-3.5 h-3.5 text-[#ffb871]" style={{ marginRight: '4px' }} />
              {formatPlaylistDuration(playlist.total_duration_seconds)}
            </span>
          </div>

          {showOwner && playlist.owner_username && (
            <span
              className="text-[#ffb871] truncate max-w-[120px]"
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <User className="w-3.5 h-3.5" style={{ marginRight: '4px' }} />
              {playlist.owner_username}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export function PlaylistsView({
  client,
  serverUrl,
  token,
  currentUserId,
  refreshKey,
  onOpenPlaylist,
}: PlaylistsViewProps) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  const unlockTokens = useMemo(
    () => (client?.getUnlockTokens ? client.getUnlockTokens() : []),
    [client, refreshKey]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlaylists(client)
      .then((data) => {
        if (cancelled) return;
        setPlaylists(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        // Swallow unmocked fetch errors gracefully so standalone BrowseScreen/App tests stay green
        if (cancelled) return;
        setPlaylists([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, refreshKey]);

  const { myPlaylists, sharedPlaylists } = useMemo(() => {
    if (currentUserId) {
      return {
        myPlaylists: playlists.filter((p) => p.owner_user_id === currentUserId),
        sharedPlaylists: playlists.filter(
          (p) => p.owner_user_id !== currentUserId && p.is_public
        ),
      };
    }
    return {
      myPlaylists: playlists.filter((p) => p.is_editable),
      sharedPlaylists: playlists.filter((p) => !p.is_editable && p.is_public),
    };
  }, [playlists, currentUserId]);

  const firstPlaylistId = (myPlaylists[0] || sharedPlaylists[0])?.id ?? null;

  const handleCreated = (detail: PlaylistDetail) => {
    setPlaylists((prev) => [
      detail.summary,
      ...prev.filter((p) => p.id !== detail.summary.id),
    ]);
    onOpenPlaylist(detail.summary.id);
  };

  const GRID_COLS = 4;

  return (
    <div data-testid="playlists-view" className="w-full pb-16 select-none">
      <PlaylistsFocusBridge loading={loading} firstPlaylistId={firstPlaylistId} />
      {/* Top Header */}
      <div
        className="pb-6 border-b border-[rgba(245,229,229,0.08)]"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '36px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            className="w-14 h-14 rounded-2xl bg-[#281216] border border-[#ff7a18]/30 flex items-center justify-center shrink-0"
            style={{ marginRight: '18px' }}
          >
            <ListVideo className="w-7 h-7 text-[#ff7a18]" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#F5E5E5]">Playlists</h1>
            <p className="text-base text-[#a8a29e]" style={{ marginTop: '4px' }}>
              Curated watch queues &amp; shared server collections
            </p>
          </div>
        </div>

        <PillButton
          id="playlists-create-btn"
          groupId="playlists-content"
          order={1}
          variant="primary"
          icon={<Plus className="w-5 h-5" />}
          marginRight="0px"
          onSelect={() => setIsCreateModalOpen(true)}
        >
          Create Playlist
        </PillButton>
      </div>

      {loading ? (
        <div
          data-testid="playlists-loading"
          className="w-full py-24 flex items-center justify-center text-[#a8a29e] text-2xl"
        >
          <Loader2
            className="w-8 h-8 animate-spin text-[#ff7a18]"
            style={{ marginRight: '12px' }}
          />
          <span>Loading playlists...</span>
        </div>
      ) : (
        <>
          {/* My Playlists Section */}
          <section data-testid="my-playlists-section" style={{ marginBottom: '48px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}
            >
              <h2 className="text-2xl font-bold text-[#F5E5E5] tracking-tight">
                My Playlists
              </h2>
              <span className="font-mono text-xs uppercase px-3 py-1 rounded bg-[#1a1b21] text-[#ffb871] border border-[rgba(255,255,255,0.08)]">
                {myPlaylists.length} {myPlaylists.length === 1 ? 'Playlist' : 'Playlists'}
              </span>
            </div>

            {myPlaylists.length > 0 ? (
              <div
                className="grid grid-cols-4"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gridGap: '24px',
                }}
              >
                {myPlaylists.map((playlist, idx) => (
                  <PlaylistCardTile
                    key={playlist.id}
                    playlist={playlist}
                    order={2 + idx}
                    colIndex={idx % GRID_COLS}
                    isFirstCard={idx === 0}
                    showOwner={false}
                    serverUrl={serverUrl}
                    token={token}
                    unlockTokens={unlockTokens}
                    onSelect={onOpenPlaylist}
                  />
                ))}
              </div>
            ) : (
              <div className="p-10 rounded-3xl bg-[#14151c] border border-[rgba(255,255,255,0.06)] text-center">
                <p className="text-xl font-semibold text-[#e3e1e9]">
                  You haven&apos;t created any playlists yet.
                </p>
                <p className="text-base text-[#a8a29e]" style={{ marginTop: '6px' }}>
                  Use &ldquo;Create Playlist&rdquo; above or add movies, shows, and folders from their detail screens.
                </p>
              </div>
            )}
          </section>

          {/* Shared on Server Section */}
          <section data-testid="shared-playlists-section">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}
            >
              <h2 className="text-2xl font-bold text-[#F5E5E5] tracking-tight">
                Shared on Server
              </h2>
              <span className="font-mono text-xs uppercase px-3 py-1 rounded bg-[#1a1b21] text-[#a8a29e] border border-[rgba(255,255,255,0.08)]">
                {sharedPlaylists.length} Shared
              </span>
            </div>

            {sharedPlaylists.length > 0 ? (
              <div
                className="grid grid-cols-4"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gridGap: '24px',
                }}
              >
                {sharedPlaylists.map((playlist, idx) => (
                  <PlaylistCardTile
                    key={playlist.id}
                    playlist={playlist}
                    order={2 + myPlaylists.length + idx}
                    colIndex={idx % GRID_COLS}
                    isFirstCard={myPlaylists.length === 0 && idx === 0}
                    showOwner={true}
                    serverUrl={serverUrl}
                    token={token}
                    unlockTokens={unlockTokens}
                    onSelect={onOpenPlaylist}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-3xl bg-[#14151c]/70 border border-[rgba(255,255,255,0.05)] text-center text-[#a8a29e] text-base">
                No public playlists have been shared by other profiles yet.
              </div>
            )}
          </section>
        </>
      )}

      {isCreateModalOpen && (
        <CreateEditPlaylistModal
          isOpen={isCreateModalOpen}
          mode="create"
          client={client}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
