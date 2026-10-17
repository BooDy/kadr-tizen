import { useEffect, useRef, useState, useCallback, useMemo, useContext } from 'react';
import { createPlayerDriver } from '../player/avplay-driver';
import { PlayerDriver, PlayerState } from '../player/driver';
import { reportPlaybackProgress } from '../api/playback';
import { ApiClient } from '../api/client';
import { fetchItemSubtitles } from '../api/subtitles';
import { SubtitleTrack } from '../types/kadr';
import { PlaybackSessionManager } from '../player/session';
import { TVKeys } from '../navigation/keys';
import { FocusContext } from '../navigation/FocusContext';
import { PlayerOSD } from '../components/osd/PlayerOSD';
import { TVButton } from '../components/tv/TVButton';
import { AlertTriangle, RotateCcw, MonitorPlay, ArrowLeft } from 'lucide-react';

export interface PlaybackErrorInfo {
  message: string;
  streamUrl: string;
  driverName: string;
}

export interface PlayerScreenProps {
  itemId: number | string;
  title: string;
  serverUrl: string;
  token: string;
  initialTimeMs?: number;
  initialResumeMs?: number;
  client?: ApiClient;
  onExit: () => void;
}

export function PlayerScreen({
  itemId,
  title,
  serverUrl,
  token,
  initialTimeMs = 0,
  initialResumeMs,
  client,
  onExit,
}: PlayerScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const driverRef = useRef<PlayerDriver | null>(null);
  const initialResume = initialResumeMs ?? initialTimeMs ?? 0;
  const [playerState, setPlayerState] = useState<PlayerState>('buffering');
  const [positionMs, setPositionMs] = useState(initialResume);
  const [durationMs, setDurationMs] = useState(0);
  const [showOSD, setShowOSD] = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<PlaybackErrorInfo | null>(null);
  const [forceHtml5, setForceHtml5] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const playbackErrorRef = useRef(playbackError);
  playbackErrorRef.current = playbackError;

  const focusCtx = useContext(FocusContext);
  const focusCtxRef = useRef(focusCtx);
  focusCtxRef.current = focusCtx;

  const [isSubtitlePopupOpen, setIsSubtitlePopupOpen] = useState(false);
  const isSubtitlePopupOpenRef = useRef(isSubtitlePopupOpen);
  isSubtitlePopupOpenRef.current = isSubtitlePopupOpen;

  const cleanServerUrl = useMemo(() => serverUrl.replace(/\/+$/, ''), [serverUrl]);

  const apiClient = useMemo(() => {
    if (client) return client;
    const c = new ApiClient(serverUrl);
    if (token) c.setToken(token);
    return c;
  }, [client, serverUrl, token]);

  const sessionManager = useMemo(() => new PlaybackSessionManager(apiClient), [apiClient]);
  const hasActiveSessionRef = useRef(false);

  const handleRetry = useCallback(() => {
    setPlaybackError(null);
    setPlayerState('buffering');
    setReloadKey((k) => k + 1);
  }, []);

  const handleSwitchToHtml5 = useCallback(() => {
    setForceHtml5(true);
    setPlaybackError(null);
    setPlayerState('buffering');
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (playbackError && focusCtxRef.current) {
      focusCtxRef.current.pushTrap('player-error-modal');
      focusCtxRef.current.setFocusedId('player-error-retry-btn');
      return () => {
        focusCtxRef.current?.popTrap();
      };
    }
  }, [playbackError]);

  const positionMsRef = useRef(positionMs);
  positionMsRef.current = positionMs;

  const durationMsRef = useRef(durationMs);
  durationMsRef.current = durationMs;

  const playerStateRef = useRef(playerState);
  playerStateRef.current = playerState;

  // Fetch subtitles on mount / item change
  useEffect(() => {
    let isMounted = true;
    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(itemId, 10);
    if (!isNaN(numericItemId)) {
      fetchItemSubtitles(apiClient, numericItemId)
        .then((tracks) => {
          if (!isMounted) return;
          setSubtitles(tracks);
          const defaultTrack = tracks.find((t) => t.is_default);
          if (defaultTrack) {
            setSelectedSubtitleId(defaultTrack.id);
          }
        })
        .catch(() => {
          // Subtitles discovery optional/fallback
        });
    }
    return () => {
      isMounted = false;
    };
  }, [itemId, apiClient]);

  const activeSubtitleUrl = useMemo(() => {
    if (selectedSubtitleId === null) return null;
    const track = subtitles.find((s) => s.id === selectedSubtitleId);
    if (!track) return null;
    return track.stream_url.startsWith('http')
      ? track.stream_url
      : `${cleanServerUrl}${track.stream_url.startsWith('/') ? '' : '/'}${track.stream_url}`;
  }, [selectedSubtitleId, subtitles, cleanServerUrl]);

  const activeSubtitleUrlRef = useRef(activeSubtitleUrl);
  activeSubtitleUrlRef.current = activeSubtitleUrl;

  useEffect(() => {
    driverRef.current?.setSubtitleTrack(activeSubtitleUrl);
  }, [activeSubtitleUrl]);

  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetOsdTimer = useCallback(() => {
    setShowOSD(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    if (playerStateRef.current === 'playing' && !isSubtitlePopupOpenRef.current) {
      osdTimerRef.current = setTimeout(() => {
        setShowOSD(false);
      }, 4000);
    }
  }, []);

  useEffect(() => {
    if (isSubtitlePopupOpen) {
      setShowOSD(true);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      return;
    }
    if (playerState === 'playing') {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      osdTimerRef.current = setTimeout(() => {
        setShowOSD(false);
      }, 4000);
    } else {
      setShowOSD(true);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    }
  }, [playerState, isSubtitlePopupOpen]);

  useEffect(() => {
    // For AVPlay hardware video plane on Samsung Tizen, body background must be transparent
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let isMounted = true;

    const cleanServerUrl = serverUrl.replace(/\/+$/, '');
    if (!itemId || itemId === 'undefined' || itemId === 'null') {
      console.error('[PlayerScreen] Invalid itemId:', itemId);
      setPlayerState('error');
      playerStateRef.current = 'error';
      setPlaybackError({
        message: 'Invalid or missing media item ID for playback stream',
        streamUrl: `${cleanServerUrl}/api/v1/stream/${itemId}`,
        driverName: forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay',
      });
      return;
    }

    const queryParams = new URLSearchParams();
    if (token) {
      queryParams.set('token', token);
    }
    const unlockTokens = apiClient.getUnlockTokens ? apiClient.getUnlockTokens() : [];
    if (unlockTokens.length > 0) {
      queryParams.set('unlocked', unlockTokens.join(','));
    }
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const streamUrl = `${cleanServerUrl}/api/v1/stream/${itemId}${queryString}`;
    const driver = createPlayerDriver(forceHtml5);
    driverRef.current = driver;

    driver.onTimeUpdate((pos, dur) => {
      setPositionMs(pos);
      setDurationMs(dur);
      positionMsRef.current = pos;
      durationMsRef.current = dur;
    });

    driver.onStateChange((state) => {
      setPlayerState(state);
      playerStateRef.current = state;
    });

    driver.onError((err) => {
      console.error('[PlayerScreen] Playback error:', err);
      setPlayerState('error');
      playerStateRef.current = 'error';
      setPlaybackError({
        message: err || 'Playback failed',
        streamUrl,
        driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
      });
    });

    driver.init(containerRef.current, streamUrl, initialResume).catch((err) => {
      console.error('[PlayerScreen] Driver init failed:', err);
      setPlayerState('error');
      playerStateRef.current = 'error';
      setPlaybackError({
        message: err?.message || String(err),
        streamUrl,
        driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
      });
    });

    if (activeSubtitleUrlRef.current) {
      driver.setSubtitleTrack(activeSubtitleUrlRef.current);
    }

    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(itemId, 10);
    if (!isNaN(numericItemId)) {
      sessionManager.start(numericItemId).then((session) => {
        if (!isMounted) {
          sessionManager.destroy();
          return;
        }
        if (session) {
          hasActiveSessionRef.current = true;
          if (session.resume_position_seconds > 0 && initialResume === 0) {
            const resumeMs = session.resume_position_seconds * 1000;
            driver.seekTo(resumeMs);
            setPositionMs(resumeMs);
            positionMsRef.current = resumeMs;
          }
        }
      });
    }

    // 10s Scrobble interval
    const scrobbleInterval = setInterval(() => {
      if (hasActiveSessionRef.current) {
        sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
      } else {
        reportPlaybackProgress(
          serverUrl,
          token,
          itemId,
          positionMsRef.current,
          playerStateRef.current === 'paused'
        );
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(scrobbleInterval);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      // Final scrobble sync before teardown
      if (hasActiveSessionRef.current) {
        sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
        sessionManager.destroy();
      } else {
        reportPlaybackProgress(serverUrl, token, itemId, positionMsRef.current, true);
        sessionManager.destroy();
      }
      driver.destroy();
    };
  }, [itemId, serverUrl, token, initialResume, sessionManager, reloadKey, forceHtml5]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      if (playbackErrorRef.current) {
        if (
          code === TVKeys.BACK_TIZEN ||
          code === TVKeys.BACK_WEB ||
          code === TVKeys.BACKSPACE ||
          e.key === 'Escape'
        ) {
          e.preventDefault();
          onExit();
        }
        return;
      }

      resetOsdTimer();

      if (
        code === TVKeys.PLAY_PAUSE ||
        code === TVKeys.PLAY ||
        code === TVKeys.PAUSE
      ) {
        if (playerStateRef.current === 'playing') {
          driverRef.current?.pause();
        } else {
          driverRef.current?.play();
        }
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        if (
          e.defaultPrevented ||
          isSubtitlePopupOpenRef.current ||
          focusCtxRef.current?.focusedId ||
          (document.activeElement &&
            document.activeElement !== document.body &&
            document.activeElement.tagName === 'BUTTON')
        ) {
          return;
        }
        if (playerStateRef.current === 'playing') {
          driverRef.current?.pause();
        } else {
          driverRef.current?.play();
        }
      } else if (code === TVKeys.LEFT) {
        const newPos = Math.max(0, positionMsRef.current - 10000);
        positionMsRef.current = newPos;
        setPositionMs(newPos);
        driverRef.current?.seekTo(newPos);
      } else if (code === TVKeys.RIGHT) {
        const maxPos = durationMsRef.current > 0 ? durationMsRef.current : Infinity;
        const newPos = Math.min(maxPos, positionMsRef.current + 10000);
        positionMsRef.current = newPos;
        setPositionMs(newPos);
        driverRef.current?.seekTo(newPos);
      } else if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
        sessionManager.destroy();
        onExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, resetOsdTimer, sessionManager]);

  return (
    <div className="relative w-full h-full bg-transparent overflow-hidden select-none">
      <div ref={containerRef} className="w-full h-full bg-transparent" />
      <PlayerOSD
        title={title}
        playerState={playerState}
        positionMs={positionMs}
        durationMs={durationMs}
        visible={showOSD && !playbackError}
        subtitles={subtitles}
        selectedSubtitleId={selectedSubtitleId}
        onSelectSubtitle={setSelectedSubtitleId}
        onPopupOpenChange={setIsSubtitlePopupOpen}
      />

      {playbackError && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Playback Error"
          className="fixed inset-0 z-50 bg-[#2A0A0A]/95 backdrop-blur-md flex items-center justify-center p-12 select-none"
        >
          <div className="bg-[#3B1111] border-2 border-[#D43F15]/50 rounded-3xl p-10 max-w-4xl w-full shadow-2xl flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-[#D43F15]/20 border border-[#D43F15]/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-8 h-8 text-[#D43F15]" />
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-[#F5E5E5] tracking-tight">Playback Error</h2>
                <p className="text-base text-[#F5E5E5]/70">Could not stream media "{title}"</p>
              </div>
            </div>

            <div className="bg-[#2A0A0A] p-5 rounded-2xl border border-[rgba(245,229,229,0.08)] mb-8 font-mono text-sm space-y-2 text-[#F5E5E5]/90">
              <div>
                <span className="text-[#FFB800] font-bold">Error:</span> {playbackError.message}
              </div>
              <div className="truncate">
                <span className="text-[#FFB800] font-bold">Stream URL:</span> {playbackError.streamUrl}
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[#FFB800] font-bold">Player Engine:</span> {playbackError.driverName}
                </div>
                <div>
                  <span className="text-[#FFB800] font-bold">Auth Token:</span> {token ? 'Present' : 'None'}
                </div>
                <div>
                  <span className="text-[#FFB800] font-bold">Item ID:</span> {itemId}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {focusCtx ? (
                <TVButton
                  id="player-error-retry-btn"
                  groupId="player-error"
                  order={1}
                  variant="primary"
                  autoFocus
                  onClick={handleRetry}
                  onEnter={handleRetry}
                  className="px-6 py-4 text-lg font-bold"
                >
                  <RotateCcw className="w-6 h-6 mr-2" /> Retry Playback
                </TVButton>
              ) : (
                <button
                  id="player-error-retry-btn"
                  type="button"
                  autoFocus
                  onClick={handleRetry}
                  className="px-6 py-4 rounded-xl font-bold text-lg flex items-center justify-center cursor-pointer select-none bg-[#FF6B00] text-white"
                >
                  <RotateCcw className="w-6 h-6 mr-2" /> Retry Playback
                </button>
              )}

              {playbackError.driverName.includes('AVPlay') && (
                focusCtx ? (
                  <TVButton
                    id="player-error-html5-btn"
                    groupId="player-error"
                    order={2}
                    variant="secondary"
                    onClick={handleSwitchToHtml5}
                    onEnter={handleSwitchToHtml5}
                    className="px-6 py-4 text-lg font-bold"
                  >
                    <MonitorPlay className="w-6 h-6 mr-2" /> Try HTML5 Video Player
                  </TVButton>
                ) : (
                  <button
                    id="player-error-html5-btn"
                    type="button"
                    onClick={handleSwitchToHtml5}
                    className="px-6 py-4 rounded-xl font-bold text-lg flex items-center justify-center cursor-pointer select-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]"
                  >
                    <MonitorPlay className="w-6 h-6 mr-2" /> Try HTML5 Video Player
                  </button>
                )
              )}

              {focusCtx ? (
                <TVButton
                  id="player-error-exit-btn"
                  groupId="player-error"
                  order={3}
                  variant="secondary"
                  onClick={onExit}
                  onEnter={onExit}
                  className="px-6 py-4 text-lg font-bold ml-auto"
                >
                  <ArrowLeft className="w-6 h-6 mr-2" /> Exit to Browse
                </TVButton>
              ) : (
                <button
                  id="player-error-exit-btn"
                  type="button"
                  onClick={onExit}
                  className="px-6 py-4 rounded-xl font-bold text-lg flex items-center justify-center cursor-pointer select-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] ml-auto"
                >
                  <ArrowLeft className="w-6 h-6 mr-2" /> Exit to Browse
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
