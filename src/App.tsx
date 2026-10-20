import { useState, useEffect, useMemo } from 'react';
import { FocusProvider } from './navigation/FocusContext';
import { ApiClient } from './api/client';
import { listProfiles, authenticatePin } from './api/auth';
import { fetchMediaItem, MediaItemDetail } from './api/items';
import { unlockLibrary } from './api/libraries';
import { subscribeEvents } from './api/events';
import { ProfileCard, FolderImage } from './types/kadr';
import { ServerConnectScreen } from './screens/ServerConnectScreen';
import { ProfileSelectScreen } from './screens/ProfileSelectScreen';
import { BrowseScreen } from './screens/BrowseScreen';
import { ItemDetailModal } from './screens/ItemDetailModal';
import { FolderBrowserModal } from './screens/FolderBrowserModal';
import { ImageViewerModal } from './screens/ImageViewerModal';
import { PinPadModal } from './components/pin/PinPadModal';
import { PlayerScreen } from './screens/PlayerScreen';
import { WifiOff } from 'lucide-react';

export type AppView = 'connect' | 'profiles' | 'browse' | 'player';

export default function App() {
  const [view, setView] = useState<AppView>('connect');
  const [serverUrl, setServerUrl] = useState<string | null>(() => localStorage.getItem('kadr_server_url'));
  const [serverName, setServerName] = useState<string>(() => localStorage.getItem('kadr_server_name') || 'Kadr');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('kadr_token'));
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [activeItem, setActiveItem] = useState<MediaItemDetail | null>(null);
  const [playerItem, setPlayerItem] = useState<{ id: number | string; title: string; startMs: number } | null>(null);
  const [folderBrowserState, setFolderBrowserState] = useState<{ libraryId: string; path: string } | null>(null);
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
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const client = useMemo(() => {
    const c = new ApiClient(serverUrl || 'http://localhost:8492');
    if (token) c.setToken(token);
    return c;
  }, [serverUrl, token]);

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
    const unsubscribe = subscribeEvents(serverUrl, token, (type) => {
      if (type === 'layout:changed') {
        setScreenRefreshKey((k) => k + 1);
      } else if (type === 'library:updated') {
        setFolderRefreshKey((k) => k + 1);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [serverUrl, token]);

  const handleServerSelected = async (url: string, name: string) => {
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
      localStorage.setItem('kadr_token', res.data.token);
      setToken(res.data.token);
      setView('browse');
      return { success: true };
    }
    return { success: false, error: res.error, lockedOutSecs: res.retryAfterSecs };
  };

  const handleSwitchServer = () => {
    localStorage.removeItem('kadr_server_url');
    localStorage.removeItem('kadr_server_name');
    localStorage.removeItem('kadr_token');
    setServerUrl(null);
    setToken(null);
    setActiveItem(null);
    setFolderBrowserState(null);
    setImageViewerState(null);
    setUnlockLibraryId(null);
    client.clearLibraryUnlockTokens();
    setView('connect');
  };

  const handleOpenDetail = async (itemId: number | string) => {
    try {
      const item = await fetchMediaItem(client, itemId);
      setActiveItem(item);
    } catch {
      // Ignored
    }
  };

  const handlePlayItem = (itemId: number | string, resumeMs = 0, titleOverride?: string) => {
    if (itemId === undefined || itemId === null || itemId === '' || itemId === 'undefined') {
      console.error('[App] Cannot play item with invalid id:', itemId);
      return;
    }
    let title = titleOverride;
    if (!title && activeItem) {
      if (activeItem.id === itemId) {
        title = activeItem.title || activeItem.card?.title;
      } else if (activeItem.episodes) {
        const ep = activeItem.episodes.find((e) => e.id === itemId);
        if (ep?.title) {
          title = ep.title;
        }
      }
      if (!title) {
        title = activeItem.title || activeItem.card?.title;
      }
    }
    title = title || 'Playing';
    setPlayerItem({ id: itemId, title, startMs: resumeMs });
    setView('player');
  };

  const handleExitPlayer = async () => {
    setView('browse');
    if (!activeItem && playerItem) {
      try {
        const detail = await fetchMediaItem(client, playerItem.id);
        setActiveItem(detail);
      } catch (e) {
        console.error('Failed to load item detail on player exit:', e);
      }
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
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.message || 'Incorrect PIN';
      if (status === 429 || msg.includes('429')) {
        setUnlockLockoutSecs(err?.retryAfterSecs || 30);
      }
      setUnlockError(msg);
    }
  };

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
            className="fixed inset-0 bg-[#2A0A0A]/90 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4 select-none"
          >
            <WifiOff className="w-16 h-16 text-[#D43F15] animate-pulse" />
            <h2 className="text-3xl font-bold text-[#F5E5E5]">Connection Lost</h2>
            <p className="text-xl text-[#5C3C3C]">Waiting for network connection to restore...</p>
          </div>
        )}

        {view === 'connect' && (
          <ServerConnectScreen onServerSelected={handleServerSelected} />
        )}

        {view === 'profiles' && (
          <ProfileSelectScreen
            profiles={profiles}
            serverName={serverName}
            onLogin={handleLogin}
            onBackToServerConnect={() => setView('connect')}
          />
        )}

        {view === 'browse' && (
          <>
            <BrowseScreen
              client={client}
              serverUrl={serverUrl || ''}
              onSelectItem={handleOpenDetail}
              onPlayItem={handlePlayItem}
              onBrowseFolder={(libraryId, folderPath) => {
                setFolderBrowserState({ libraryId, path: folderPath || '' });
              }}
              onLockedLibrary={(libraryId) => {
                setUnlockLibraryId(libraryId);
              }}
              onSwitchProfile={() => {
                localStorage.removeItem('kadr_token');
                setToken(null);
                setActiveItem(null);
                setFolderBrowserState(null);
                setImageViewerState(null);
                setUnlockLibraryId(null);
                client.clearLibraryUnlockTokens();
                setView('profiles');
              }}
              onSwitchServer={handleSwitchServer}
              refreshKey={screenRefreshKey}
            />
            {folderBrowserState && (
              <FolderBrowserModal
                key={`${folderBrowserState.libraryId}-${folderBrowserState.path}`}
                client={client}
                serverUrl={serverUrl || ''}
                token={token || ''}
                libraryId={folderBrowserState.libraryId}
                initialPath={folderBrowserState.path}
                refreshKey={folderRefreshKey}
                onClose={() => setFolderBrowserState(null)}
                onSelectItem={(itemId) => {
                  handleOpenDetail(itemId);
                }}
                onSelectImage={(images, initialIndex) => {
                  setImageViewerState({ images, initialIndex, autoPlay: false });
                }}
                onStartSlideshow={(images) => {
                  setImageViewerState({ images, initialIndex: 0, autoPlay: true });
                }}
                onLockedLibrary={(libraryId) => {
                  setUnlockLibraryId(libraryId);
                }}
              />
            )}
            <ItemDetailModal
              isOpen={Boolean(activeItem)}
              item={activeItem}
              serverUrl={serverUrl || ''}
              onPlay={handlePlayItem}
              onClose={() => setActiveItem(null)}
              onBrowseFolder={(libraryId, folderPath) => {
                setActiveItem(null);
                setFolderBrowserState({ libraryId, path: folderPath });
              }}
            />
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
            serverUrl={serverUrl || ''}
            token={token || ''}
            initialTimeMs={playerItem.startMs}
            onExit={handleExitPlayer}
          />
        )}
      </div>
    </FocusProvider>
  );
}
