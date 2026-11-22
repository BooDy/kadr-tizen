import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FocusProvider } from './navigation/FocusContext';
import { ApiClient } from './api/client';
import { listProfiles, authenticatePin } from './api/auth';
import { fetchMediaItem, MediaItemDetail } from './api/items';
import { unlockLibrary } from './api/libraries';
import { subscribeEvents, PlaylistUpdatedPayload } from './api/events';
import { ProfileCard, FolderImage, UserRole } from './types/kadr';
import { ServerConnectScreen } from './screens/ServerConnectScreen';
import { ProfileSelectScreen } from './screens/ProfileSelectScreen';
import { BrowseScreen } from './screens/BrowseScreen';
import { ItemDetailModal } from './screens/ItemDetailModal';
import { FolderBrowserModal } from './screens/FolderBrowserModal';
import { ImageViewerModal } from './screens/ImageViewerModal';
import { PlaylistDetailModal, PlaylistQueuePlayItem } from './screens/PlaylistDetailModal';
import {
  AddToPlaylistModal,
  AddToPlaylistTarget,
} from './components/playlists/AddToPlaylistModal';
import { PinPadModal } from './components/pin/PinPadModal';
import { ExitConfirmModal } from './components/tv/ExitConfirmModal';
import { PlayerScreen } from './screens/PlayerScreen';
import { WifiOff } from 'lucide-react';
import {
  applyOptimisticProgress,
  applyWatchStateMutation,
  PlaybackProgressSnapshot,
} from './utils/playbackProgress';
import { setItemWatchState, setBatchWatchState } from './api/playback';
import { resetSavedSearchState } from './api/search';
import { disarmBootErrorTrap } from './utils/bootTrap';
import { exitTvApp } from './utils/tizenLifecycle';

export type AppView = 'connect' | 'profiles' | 'browse' | 'player';

export default function App() {
  const [serverUrl, setServerUrl] = useState<string | null>(() => localStorage.getItem('kadr_server_url'));
  const [serverName, setServerName] = useState<string>(() => localStorage.getItem('kadr_server_name') || 'Kadr');
  const [view, setView] = useState<AppView>(() =>
    localStorage.getItem('kadr_server_url') ? 'profiles' : 'connect'
  );
  const [token, setToken] = useState<string | null>(() => {
    localStorage.removeItem('kadr_token');
    localStorage.removeItem('kadr_username');
    localStorage.removeItem('kadr_user_role');
    return null;
  });
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [activeItem, setActiveItem] = useState<MediaItemDetail | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [addToPlaylistTarget, setAddToPlaylistTarget] = useState<AddToPlaylistTarget | null>(null);
  const [playerItem, setPlayerItem] = useState<{
    id: number | string;
    title: string;
    startMs: number;
    technical?: MediaItemDetail['technical'];
    playlist?: PlaylistQueuePlayItem[];
    currentIndex?: number;
    mediaType?: string;
    posterUrl?: string;
    subtitle?: string;
  } | null>(null);
  const [folderBrowserState, setFolderBrowserState] = useState<{
    libraryId: string;
    path: string;
    lastItemId?: number | string;
  } | null>(null);
  const [imageViewerState, setImageViewerState] = useState<{
    images: FolderImage[];
    initialIndex: number;
    autoPlay: boolean;
  } | null>(null);
  const [unlockLibraryId, setUnlockLibraryId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | undefined>();
  const [unlockLockoutSecs, setUnlockLockoutSecs] = useState<number>(0);
  const [screenRefreshKey, setScreenRefreshKey] = useState<number>(0);
  const [folderRefreshKey, setFolderRefreshKey] = useState<number>(0);
  const [playlistRefreshKey, setPlaylistRefreshKey] = useState<number>(0);
  const [activeBrowseTab, setActiveBrowseTab] = useState<string>('home');
  const [lastBrowseFocusId, setLastBrowseFocusId] = useState<string | null>(null);
  const [itemDetailViewState, setItemDetailViewState] = useState<{
    itemId: string;
    selectedSeason: number;
    lastFocusedId: string | null;
  } | null>(null);
  const [suspendedItemDetail, setSuspendedItemDetail] = useState<{
    item: MediaItemDetail;
    viewState: { itemId: string; selectedSeason: number; lastFocusedId: string | null } | null;
  } | null>(null);
  const sessionProgressRef = useRef<Map<string, PlaybackProgressSnapshot>>(new Map());
  const unauthorizedRedirectRef = useRef(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const client = useMemo(() => {
    const c = new ApiClient(serverUrl || 'http://localhost:8492');
    if (token) c.setToken(token);
    return c;
  }, [serverUrl, token]);

  useEffect(() => disarmBootErrorTrap(), []);

  useEffect(() => {
    setIsExitModalOpen(false);
  }, [view]);

  const clearAuthIdentity = useCallback(() => {
    localStorage.removeItem('kadr_token');
    localStorage.removeItem('kadr_username');
    localStorage.removeItem('kadr_user_role');
    setToken(null);
    setCurrentUserId(null);
    setCurrentUsername(null);
    setCurrentUserRole(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      unauthorizedRedirectRef.current = true;
      clearAuthIdentity();
      setActiveItem(null);
      setActivePlaylistId(null);
      setAddToPlaylistTarget(null);
      setFolderBrowserState(null);
      setImageViewerState(null);
      setUnlockLibraryId(null);
      setUnlockError(undefined);
      setUnlockLockoutSecs(0);
      setActiveBrowseTab('home');
      setLastBrowseFocusId(null);
      setItemDetailViewState(null);
      setSuspendedItemDetail(null);
      setPlayerItem(null);
      sessionProgressRef.current.clear();
      client.clearLibraryUnlockTokens();
      resetSavedSearchState();
      setSessionExpiredNotice('Session expired — please enter your PIN to continue');
      setView('profiles');
    };
    client.setOnUnauthorized(handleUnauthorized);
    return () => {
      client.setOnUnauthorized(null);
    };
  }, [client, clearAuthIdentity]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOffline) return;
    const suppressKeys = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', suppressKeys, true);
    return () => {
      window.removeEventListener('keydown', suppressKeys, true);
    };
  }, [isOffline]);

  useEffect(() => {
    if (serverUrl && !token) {
      listProfiles(serverUrl)
        .then((p) => {
          setProfiles(p);
          setView('profiles');
        })
        .catch(() => setView('connect'));
    } else if (serverUrl && token) {
      setView('browse');
    }
  }, [serverUrl, token]);

  // Real-time SSE subscription
  useEffect(() => {
    if (!serverUrl || !token) return;
    const unsubscribe = subscribeEvents(serverUrl, token, (type, payload) => {
      if (type === 'layout:changed') {
        setScreenRefreshKey((k) => k + 1);
      } else if (type === 'library:updated') {
        setFolderRefreshKey((k) => k + 1);
        setPlaylistRefreshKey((k) => k + 1);
      } else if (type === 'playlist:updated') {
        const raw = payload as Record<string, unknown> | null;
        const inner = (
          raw && typeof raw.payload === 'object' && raw.payload !== null ? raw.payload : raw
        ) as Partial<PlaylistUpdatedPayload> | null;
        if (inner?.action === 'deleted' && inner.playlist_id) {
          setActivePlaylistId((prev) => (prev === inner.playlist_id ? null : prev));
        }
        setPlaylistRefreshKey((k) => k + 1);
        setScreenRefreshKey((k) => k + 1);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [serverUrl, token]);

  const handleServerSelected = async (url: string, name: string) => {
    unauthorizedRedirectRef.current = false;
    setSessionExpiredNotice(null);
    localStorage.setItem('kadr_server_url', url);
    localStorage.setItem('kadr_server_name', name);
    setServerUrl(url);
    setServerName(name);
    try {
      const p = await listProfiles(url);
      setProfiles(p);
      setView('profiles');
    } catch {
      setView('connect');
    }
  };

  const handleLogin = async (userId: string, pin: string) => {
    if (!serverUrl) return { success: false };
    const res = await authenticatePin(serverUrl, userId, pin);
    if (res.success && res.data) {
      unauthorizedRedirectRef.current = false;
      setSessionExpiredNotice(null);
      const resolvedUserId = res.data.user_id || userId;
      const matchedProfile = profiles.find((p) => p.id === resolvedUserId);
      const resolvedUsername = res.data.username || matchedProfile?.username || '';
      const resolvedRole = res.data.role || matchedProfile?.role || null;
      localStorage.setItem('kadr_token', res.data.token);
      if (resolvedUsername) {
        localStorage.setItem('kadr_username', resolvedUsername);
      } else {
        localStorage.removeItem('kadr_username');
      }
      if (resolvedRole) {
        localStorage.setItem('kadr_user_role', resolvedRole);
      } else {
        localStorage.removeItem('kadr_user_role');
      }
      setToken(res.data.token);
      setCurrentUserId(resolvedUserId);
      setCurrentUsername(resolvedUsername || null);
      setCurrentUserRole(resolvedRole);
      setView('browse');
      return { success: true };
    }
    return { success: false, error: res.error, lockedOutSecs: res.retryAfterSecs };
  };

  const handleSwitchServer = () => {
    unauthorizedRedirectRef.current = false;
    setSessionExpiredNotice(null);
    localStorage.removeItem('kadr_server_url');
    localStorage.removeItem('kadr_server_name');
    clearAuthIdentity();
    setServerUrl(null);
    setActiveItem(null);
    setActivePlaylistId(null);
    setAddToPlaylistTarget(null);
    setFolderBrowserState(null);
    setImageViewerState(null);
    setUnlockLibraryId(null);
    setActiveBrowseTab('home');
    setLastBrowseFocusId(null);
    setItemDetailViewState(null);
    setSuspendedItemDetail(null);
    sessionProgressRef.current.clear();
    client.clearLibraryUnlockTokens();
    resetSavedSearchState();
    setView('connect');
  };

  const handleOpenDetail = async (itemId: number | string) => {
    try {
      const item = await fetchMediaItem(client, itemId);
      setActiveItem(item);
      const newId = String(item.id ?? item.card?.id ?? itemId);
      setItemDetailViewState((prev) => (prev?.itemId === newId ? prev : null));
    } catch {
      // Ignored
    }
  };

  const handlePlayItem = (
    itemId: number | string,
    resumeMs = 0,
    titleOverride?: string,
    technicalOverride?: MediaItemDetail['technical'],
    playlistOverride?: PlaylistQueuePlayItem[],
    currentIndexOverride?: number,
    mediaTypeOverride?: string,
    posterUrlOverride?: string,
    subtitleOverride?: string
  ) => {
    if (itemId === undefined || itemId === null || itemId === '' || itemId === 'undefined') {
      console.error('[App] Cannot play item with invalid id:', itemId);
      return;
    }
    if (view !== 'player') {
      sessionProgressRef.current.clear();
    }
    let title = titleOverride;
    let technical = technicalOverride;
    let playlist = playlistOverride;
    let currentIndex = currentIndexOverride;

    if (activeItem) {
      if (String(activeItem.id) === String(itemId)) {
        if (!title) title = activeItem.title || activeItem.card?.title;
        if (!technical) technical = activeItem.technical;
      } else if (activeItem.episodes) {
        const ep = activeItem.episodes.find((e) => String(e.id) === String(itemId));
        if (ep?.title && !title) {
          title = ep.title;
        }
      }
      if (!title) {
        title = activeItem.title || activeItem.card?.title;
      }

      if (!playlist && activeItem.episodes && activeItem.episodes.length > 0) {
        const sorted = [...activeItem.episodes].sort((a, b) =>
          a.season !== b.season ? a.season - b.season : a.episode - b.episode
        );
        playlist = sorted.map((e) => ({
          id: e.id,
          title: e.title,
        }));
        const idx = playlist.findIndex((p) => String(p.id) === String(itemId));
        if (idx >= 0) {
          currentIndex = idx;
        }
      }
    }

    const queueItem =
      playlist && currentIndex !== undefined && currentIndex >= 0 && currentIndex < playlist.length
        ? playlist[currentIndex]
        : undefined;
    if (!title && queueItem?.title) title = queueItem.title;
    if (!technical && queueItem?.technical) technical = queueItem.technical;

    const activeMatch =
      activeItem && String(activeItem.id) === String(itemId) ? activeItem : null;
    const mediaType =
      mediaTypeOverride ??
      queueItem?.mediaType ??
      (activeMatch ? activeMatch.media_type ?? activeMatch.card?.media_type : undefined);
    const posterUrl =
      posterUrlOverride ??
      queueItem?.posterUrl ??
      (activeMatch ? activeMatch.poster_url ?? activeMatch.card?.poster_url : undefined);
    const subtitle =
      subtitleOverride ??
      queueItem?.subtitle ??
      (activeMatch ? activeMatch.card?.subtitle : undefined);

    title = title || 'Playing';
    setPlayerItem({
      id: itemId,
      title,
      startMs: resumeMs,
      technical,
      playlist,
      currentIndex,
      mediaType,
      posterUrl,
      subtitle,
    });
    setView('player');
  };

  const playQueueEntry = (queue: PlaylistQueuePlayItem[], index: number) => {
    const entry = queue[index];
    if (!entry) return;
    handlePlayItem(
      entry.id,
      entry.resumeMs ?? 0,
      entry.title,
      entry.technical,
      queue,
      index,
      entry.mediaType,
      entry.posterUrl,
      entry.subtitle
    );
  };

  const handlePlayPlaylistQueue = (queue: PlaylistQueuePlayItem[], startIndex: number) => {
    playQueueEntry(queue, startIndex);
  };

  const handleSelectQueueIndex = (index: number) => {
    if (!playerItem?.playlist) return;
    playQueueEntry(playerItem.playlist, index);
  };

  const handleNextEpisode = () => {
    if (!playerItem?.playlist || playerItem.currentIndex === undefined) return;
    playQueueEntry(playerItem.playlist, playerItem.currentIndex + 1);
  };

  const handlePreviousEpisode = () => {
    if (!playerItem?.playlist || playerItem.currentIndex === undefined) return;
    playQueueEntry(playerItem.playlist, playerItem.currentIndex - 1);
  };

  const handleEpisodeProgress = (snap: PlaybackProgressSnapshot) => {
    sessionProgressRef.current.set(String(snap.itemId), snap);
  };

  const handleExitPlayer = async (snapshot?: PlaybackProgressSnapshot) => {
    if (snapshot) {
      sessionProgressRef.current.set(String(snapshot.itemId), snapshot);
    }
    const progressMap = new Map(sessionProgressRef.current);

    if (activeItem && progressMap.size > 0) {
      setActiveItem((prev) => (prev ? applyOptimisticProgress(prev, progressMap) : prev));
    }

    setView('browse');

    if (snapshot?.flushPromise) {
      await Promise.race([
        snapshot.flushPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 800)),
      ]);
    }

    setScreenRefreshKey((k) => k + 1);
    if (folderBrowserState) {
      setFolderRefreshKey((k) => k + 1);
    }
    if (activePlaylistId) {
      setPlaylistRefreshKey((k) => k + 1);
    }

    if (activeItem) {
      const targetId = activeItem.id ?? activeItem.card?.id;
      if (targetId !== undefined && targetId !== null) {
        try {
          const fresh = await fetchMediaItem(client, targetId);
          setActiveItem((prev) => {
            // Only update if user is still viewing the same item
            const prevId = prev?.id ?? prev?.card?.id;
            return prev && String(prevId) === String(targetId) ? fresh : prev;
          });
        } catch (e) {
          console.warn('[App] Failed to refresh item detail on player exit:', e);
        }
      }
    }
  };

  const handleWatchStateChange = async (
    itemIds: Array<number | string>,
    watched: boolean
  ) => {
    if (itemIds.length === 0) return;
    const idSet = new Set(itemIds.map(String));
    for (const id of idSet) {
      sessionProgressRef.current.delete(id);
    }

    const previousActiveItem = activeItem;
    const previousSuspendedItem = suspendedItemDetail?.item ?? null;

    setActiveItem((prev) => (prev ? applyWatchStateMutation(prev, idSet, watched) : prev));
    if (suspendedItemDetail) {
      setSuspendedItemDetail((prev) =>
        prev ? { ...prev, item: applyWatchStateMutation(prev.item, idSet, watched) } : prev
      );
    }

    try {
      if (itemIds.length === 1) {
        await setItemWatchState(client, itemIds[0], watched);
      } else {
        await setBatchWatchState(client, itemIds, watched);
      }
      setScreenRefreshKey((k) => k + 1);
      if (folderBrowserState) {
        setFolderRefreshKey((k) => k + 1);
      }
      if (activePlaylistId) {
        setPlaylistRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.warn('[App] Failed to update watch state:', err);
      if (previousActiveItem) {
        const prevId = String(previousActiveItem.id ?? previousActiveItem.card?.id ?? '');
        setActiveItem((prev) => {
          const curId = String(prev?.id ?? prev?.card?.id ?? '');
          return prev && curId === prevId ? previousActiveItem : prev;
        });
      }
      if (previousSuspendedItem) {
        const prevSuspId = String(
          previousSuspendedItem.id ?? previousSuspendedItem.card?.id ?? ''
        );
        setSuspendedItemDetail((prev) => {
          if (!prev) return prev;
          const curSuspId = String(prev.item.id ?? prev.item.card?.id ?? '');
          return curSuspId === prevSuspId ? { ...prev, item: previousSuspendedItem } : prev;
        });
      }
      const errMsg = err instanceof Error ? err.message : String(err ?? '');
      const is403 =
        (err as { status?: number })?.status === 403 ||
        errMsg.includes('403') ||
        errMsg.includes('LIBRARY_LOCKED');
      const lockedLibId = previousActiveItem?.library_id || activeItem?.library_id;
      if (is403 && lockedLibId) {
        client.removeLibraryUnlockToken(lockedLibId);
        setUnlockLibraryId(lockedLibId);
      }
      throw err;
    }
  };

  const handleUnlockPin = async (pin: string) => {
    if (!unlockLibraryId) return;
    try {
      const res = await unlockLibrary(client, unlockLibraryId, pin);
      const unlockToken = res.unlock_token || res.token;
      client.setLibraryUnlockToken(unlockLibraryId, unlockToken);
      setUnlockLibraryId(null);
      setUnlockError(undefined);
      setUnlockLockoutSecs(0);
      setFolderRefreshKey((k) => k + 1);
      setScreenRefreshKey((k) => k + 1);
      setPlaylistRefreshKey((k) => k + 1);
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.message || 'Incorrect PIN';
      if (status === 429 || msg.includes('429')) {
        setUnlockLockoutSecs(err?.retryAfterSecs || 30);
      }
      setUnlockError(msg);
    }
  };

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === currentUserId),
    [profiles, currentUserId]
  );
  const resolvedUsername = currentUsername || activeProfile?.username || undefined;
  const resolvedUserRole = currentUserRole || activeProfile?.role || undefined;

  return (
    <FocusProvider>
      <div
        className={`w-[1920px] h-[1080px] ${
          view === 'player' ? 'bg-transparent' : 'bg-[#2A0A0A]'
        } overflow-hidden relative font-sans text-[#F5E5E5]`}
      >
        {isOffline && (
          <div
            data-testid="reconnection-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-label="Connection Lost"
            data-modal-overlay="true"
            className="fixed inset-0 bg-[#120404]/95 z-50 flex flex-col items-center justify-center select-none"
          >
            <WifiOff
              className="w-16 h-16 text-[#D43F15] animate-pulse"
              style={{ marginBottom: '16px' }}
            />
            <h2
              className="text-3xl font-bold text-[#F5E5E5]"
              style={{ marginBottom: '12px' }}
            >
              Connection Lost
            </h2>
            <p className="text-xl text-[#5C3C3C]">Waiting for network connection to restore...</p>
          </div>
        )}

        {view === 'connect' && (
          <ServerConnectScreen
            onServerSelected={handleServerSelected}
            onRequestExit={() => setIsExitModalOpen(true)}
          />
        )}

        {view === 'profiles' && (
          <ProfileSelectScreen
            profiles={profiles}
            serverName={serverName}
            noticeMessage={sessionExpiredNotice}
            onLogin={handleLogin}
            onBackToServerConnect={() => {
              unauthorizedRedirectRef.current = false;
              setSessionExpiredNotice(null);
              setView('connect');
            }}
          />
        )}

        {view === 'browse' && (
          <>
            <BrowseScreen
              client={client}
              serverUrl={serverUrl || ''}
              token={token || undefined}
              currentUserId={currentUserId || undefined}
              currentUsername={resolvedUsername}
              currentUserRole={resolvedUserRole}
              onUnlockedLibrariesChanged={() => setScreenRefreshKey((k) => k + 1)}
              initialTab={activeBrowseTab}
              onTabChange={setActiveBrowseTab}
              initialFocusId={lastBrowseFocusId}
              onContentFocusChange={setLastBrowseFocusId}
              onSelectItem={handleOpenDetail}
              onPlayItem={handlePlayItem}
              onBrowseFolder={(libraryId, folderPath) => {
                setSuspendedItemDetail(null);
                setFolderBrowserState({ libraryId, path: folderPath || '' });
              }}
              onOpenPlaylist={(playlistId) => {
                setActivePlaylistId(playlistId);
              }}
              onLockedLibrary={(libraryId) => {
                setUnlockLibraryId(libraryId);
              }}
              onRequestExit={() => setIsExitModalOpen(true)}
              onSwitchProfile={() => {
                if (unauthorizedRedirectRef.current) return;
                setSessionExpiredNotice(null);
                clearAuthIdentity();
                setActiveItem(null);
                setActivePlaylistId(null);
                setAddToPlaylistTarget(null);
                setFolderBrowserState(null);
                setImageViewerState(null);
                setUnlockLibraryId(null);
                setActiveBrowseTab('home');
                setLastBrowseFocusId(null);
                setItemDetailViewState(null);
                setSuspendedItemDetail(null);
                sessionProgressRef.current.clear();
                client.clearLibraryUnlockTokens();
                resetSavedSearchState();
                setView('profiles');
              }}
              onSwitchServer={handleSwitchServer}
              refreshKey={screenRefreshKey}
              playlistRefreshKey={playlistRefreshKey}
            />
            {folderBrowserState && (
              <FolderBrowserModal
                key={folderBrowserState.libraryId}
                client={client}
                serverUrl={serverUrl || ''}
                token={token || ''}
                libraryId={folderBrowserState.libraryId}
                initialPath={folderBrowserState.path}
                initialFocusItemId={folderBrowserState.lastItemId}
                refreshKey={folderRefreshKey}
                onPathChange={(nextPath) =>
                  setFolderBrowserState((prev) => (prev ? { ...prev, path: nextPath } : prev))
                }
                onClose={() => {
                  setFolderBrowserState(null);
                  if (suspendedItemDetail) {
                    setActiveItem(suspendedItemDetail.item);
                    setItemDetailViewState(suspendedItemDetail.viewState);
                    setSuspendedItemDetail(null);
                  }
                }}
                onSelectItem={(itemId) => {
                  setFolderBrowserState((prev) =>
                    prev ? { ...prev, lastItemId: itemId } : prev
                  );
                  handleOpenDetail(itemId);
                }}
                onSelectImage={(images, initialIndex) => {
                  setImageViewerState({ images, initialIndex, autoPlay: false });
                }}
                onStartSlideshow={(images) => {
                  setImageViewerState({ images, initialIndex: 0, autoPlay: true });
                }}
                onPlayQueue={handlePlayPlaylistQueue}
                onLockedLibrary={(libraryId) => {
                  setUnlockLibraryId(libraryId);
                }}
                onAddToPlaylist={(target) => {
                  setAddToPlaylistTarget(target);
                }}
                onPlaylistChanged={() => {
                  setPlaylistRefreshKey((k) => k + 1);
                }}
              />
            )}
            {activePlaylistId && (
              <PlaylistDetailModal
                isOpen={Boolean(activePlaylistId)}
                playlistId={activePlaylistId}
                client={client}
                serverUrl={serverUrl || ''}
                token={token || undefined}
                refreshKey={playlistRefreshKey}
                onClose={() => setActivePlaylistId(null)}
                onPlayQueue={handlePlayPlaylistQueue}
                onSelectItem={(itemId) => {
                  handleOpenDetail(itemId);
                }}
                onPlaylistChanged={() => {
                  setPlaylistRefreshKey((k) => k + 1);
                }}
                onPlaylistDeleted={() => {
                  setActivePlaylistId(null);
                  setPlaylistRefreshKey((k) => k + 1);
                }}
                onLockedLibrary={(libraryId) => {
                  if (libraryId) setUnlockLibraryId(libraryId);
                }}
              />
            )}
            <ItemDetailModal
              isOpen={Boolean(activeItem)}
              item={activeItem}
              serverUrl={serverUrl || ''}
              client={client}
              token={token || undefined}
              initialSelectedSeason={
                itemDetailViewState &&
                activeItem &&
                itemDetailViewState.itemId === String(activeItem.id ?? activeItem.card?.id)
                  ? itemDetailViewState.selectedSeason
                  : undefined
              }
              initialFocusedId={
                itemDetailViewState &&
                activeItem &&
                itemDetailViewState.itemId === String(activeItem.id ?? activeItem.card?.id)
                  ? itemDetailViewState.lastFocusedId
                  : undefined
              }
              onViewStateChange={(state) => {
                if (activeItem) {
                  const itemId = String(activeItem.id ?? activeItem.card?.id);
                  setItemDetailViewState((prev) => {
                    if (
                      prev &&
                      prev.itemId === itemId &&
                      prev.selectedSeason === state.selectedSeason &&
                      prev.lastFocusedId === state.lastFocusedId
                    ) {
                      return prev;
                    }
                    return {
                      itemId,
                      selectedSeason: state.selectedSeason,
                      lastFocusedId: state.lastFocusedId,
                    };
                  });
                }
              }}
              onPlay={handlePlayItem}
              onClose={() => {
                setActiveItem(null);
                setItemDetailViewState(null);
              }}
              onBrowseFolder={(libraryId, folderPath) => {
                if (activeItem) {
                  const currentItemId = String(activeItem.id ?? activeItem.card?.id);
                  setSuspendedItemDetail({
                    item: activeItem,
                    viewState:
                      itemDetailViewState?.itemId === currentItemId
                        ? itemDetailViewState
                        : null,
                  });
                }
                const focusItemId = activeItem?.id ?? activeItem?.card?.id;
                setActiveItem(null);
                setFolderBrowserState({
                  libraryId,
                  path: folderPath,
                  lastItemId: focusItemId,
                });
              }}
              onAddToPlaylist={(target) => {
                setAddToPlaylistTarget(target);
              }}
              onPlaylistChanged={() => {
                setPlaylistRefreshKey((k) => k + 1);
              }}
              onWatchStateChange={handleWatchStateChange}
              onLockedLibrary={(libraryId) => {
                if (libraryId) {
                  client.removeLibraryUnlockToken(libraryId);
                  setUnlockLibraryId(libraryId);
                }
              }}
            />
            {addToPlaylistTarget && (
              <AddToPlaylistModal
                isOpen={Boolean(addToPlaylistTarget)}
                client={client}
                serverUrl={serverUrl || ''}
                token={token || undefined}
                target={addToPlaylistTarget}
                onClose={() => setAddToPlaylistTarget(null)}
                onSuccess={() => {
                  setAddToPlaylistTarget(null);
                  setPlaylistRefreshKey((k) => k + 1);
                }}
                onLockedLibrary={(libraryId) => {
                  if (libraryId) setUnlockLibraryId(libraryId);
                }}
              />
            )}
            {imageViewerState && (
              <ImageViewerModal
                images={imageViewerState.images}
                initialIndex={imageViewerState.initialIndex}
                autoPlay={imageViewerState.autoPlay}
                serverUrl={serverUrl || ''}
                token={token || ''}
                client={client}
                onClose={() => setImageViewerState(null)}
              />
            )}
            {unlockLibraryId && (
              <PinPadModal
                isOpen={Boolean(unlockLibraryId)}
                title="Unlock Private Library"
                subtitle="Enter 4-digit PIN to access this library"
                onSubmitPin={handleUnlockPin}
                onSubmit={handleUnlockPin}
                onClose={() => {
                  setUnlockLibraryId(null);
                  setUnlockError(undefined);
                  setUnlockLockoutSecs(0);
                }}
                errorMessage={unlockError}
                lockedOutSecs={unlockLockoutSecs}
                onErrorClear={() => setUnlockError(undefined)}
                onLockoutEnd={() => setUnlockLockoutSecs(0)}
              />
            )}
          </>
        )}

        {view === 'player' && playerItem && (
          <PlayerScreen
            client={client}
            itemId={playerItem.id}
            title={playerItem.title}
            subtitle={playerItem.subtitle}
            posterUrl={playerItem.posterUrl}
            mediaType={playerItem.mediaType}
            serverUrl={serverUrl || ''}
            token={token || ''}
            initialTimeMs={playerItem.startMs}
            technical={playerItem.technical}
            playlist={playerItem.playlist}
            currentIndex={playerItem.currentIndex}
            onNext={playerItem.playlist ? handleNextEpisode : undefined}
            onPrevious={playerItem.playlist ? handlePreviousEpisode : undefined}
            onSelectQueueIndex={playerItem.playlist ? handleSelectQueueIndex : undefined}
            onEpisodeProgress={handleEpisodeProgress}
            onExit={handleExitPlayer}
          />
        )}

        {view !== 'player' && (
          <ExitConfirmModal
            isOpen={isExitModalOpen}
            onCancel={() => setIsExitModalOpen(false)}
            onConfirmExit={() => {
              setIsExitModalOpen(false);
              exitTvApp();
            }}
          />
        )}
      </div>
    </FocusProvider>
  );
}
