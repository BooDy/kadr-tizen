import { useEffect, useRef, useState, useCallback, useMemo, useContext } from 'react';
import { createPlayerDriver, PlayerDriver, PlayerState } from '../player/driver';
import { ErrorQRCode, DiagnosticPayload } from '../components/player/ErrorQRCode';
import { KNOWN_COMPATIBILITY_INFO } from '../player/compatibility';
import { reportPlaybackProgress } from '../api/playback';
import { ApiClient } from '../api/client';
import { fetchItemSubtitles } from '../api/subtitles';
import { SubtitleTrack } from '../types/kadr';
import { PlaybackSessionManager } from '../player/session';
import { TVKeys } from '../navigation/keys';
import { FocusContext } from '../navigation/FocusContext';
import { PlayerOSD } from '../components/osd/PlayerOSD';
import { SubtitleModal } from '../components/player/SubtitleModal';
import { TVButton } from '../components/tv/TVButton';
import { AlertTriangle, RotateCcw, MonitorPlay, ArrowLeft, FastForward, Rewind } from 'lucide-react';

export function formatTime(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export interface PlaybackErrorInfo {
  message: string;
  streamUrl: string;
  driverName: string;
}

export interface PlayerScreenProps {
  itemId: number | string;
  title?: string;
  serverUrl: string;
  token: string;
  initialTimeMs?: number;
  initialResumeMs?: number;
  client?: ApiClient;
  apiClient?: ApiClient;
  onExit: () => void;
}

export function PlayerScreen({
  itemId,
  title = '',
  serverUrl,
  token,
  initialTimeMs = 0,
  initialResumeMs,
  client,
  apiClient: apiClientProp,
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

  const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState(false);
  const isSubtitleModalOpenRef = useRef(isSubtitleModalOpen);
  isSubtitleModalOpenRef.current = isSubtitleModalOpen;

  const cleanServerUrl = useMemo(() => serverUrl.replace(/\/+$/, ''), [serverUrl]);

  const apiClient = useMemo(() => {
    if (apiClientProp) return apiClientProp;
    if (client) return client;
    const c = new ApiClient(serverUrl);
    if (token) c.setToken(token);
    return c;
  }, [apiClientProp, client, serverUrl, token]);

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

  const diagnosticPayload = useMemo<DiagnosticPayload | null>(() => {
    if (!playbackError) return null;
    let tvModel = 'Unknown TV';
    let tizenVer = '5.5';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tvModel = (window as any).webapis?.productinfo?.getModel?.() || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown TV');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tizenVer = (window as any).tizen?.systeminfo?.getCapability?.('http://tizen.org/feature/platform.version') || '5.5';
    } catch {
      // Fallback
    }
    return {
      app: 'kadr-tizen',
      item_id: itemId,
      title: title || undefined,
      stream_url: playbackError.streamUrl,
      driver: playbackError.driverName,
      error: playbackError.message,
      tv_model: tvModel,
      tizen_version: tizenVer,
      timestamp: new Date().toISOString(),
    };
  }, [playbackError, itemId, title]);

  useEffect(() => {
    if (playbackError && focusCtxRef.current) {
      focusCtxRef.current.pushTrap('player-error');
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
    if (playerStateRef.current === 'playing' && !isSubtitlePopupOpenRef.current && !isSubtitleModalOpenRef.current) {
      osdTimerRef.current = setTimeout(() => {
        setShowOSD(false);
      }, 4000);
    }
  }, []);

  const [seekHud, setSeekHud] = useState<{ label: string; targetMs: number; direction: 'forward' | 'backward' } | null>(null);
  const seekHudTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seekDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seekDirectionRef = useRef<'forward' | 'backward' | null>(null);
  const targetSeekMsRef = useRef<number | null>(null);
  const seekLockUntilMsRef = useRef<number>(0);
  const consecutiveFfCountRef = useRef(0);
  const consecutiveRewCountRef = useRef(0);

  const applySeek = useCallback((deltaMs: number, direction: 'forward' | 'backward', stepLabel: string) => {
    resetOsdTimer();
    const current = positionMsRef.current;
    const dur = durationMsRef.current > 0 ? durationMsRef.current : Infinity;
    const targetMs = Math.max(0, Math.min(dur, current + deltaMs));
    positionMsRef.current = targetMs;
    setPositionMs(targetMs);
    seekDirectionRef.current = direction;
    targetSeekMsRef.current = targetMs;
    seekLockUntilMsRef.current = Date.now() + 5000;

    setSeekHud({
      label: stepLabel,
      targetMs,
      direction,
    });

    if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
    seekHudTimerRef.current = setTimeout(() => {
      setSeekHud(null);
      consecutiveFfCountRef.current = 0;
      consecutiveRewCountRef.current = 0;
    }, 1500);

    if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
    seekDebounceTimerRef.current = setTimeout(() => {
      seekDebounceTimerRef.current = null;
      seekDirectionRef.current = direction;
      targetSeekMsRef.current = targetMs;
      seekLockUntilMsRef.current = Date.now() + 5000;
      driverRef.current?.seekTo(targetMs, () => {});
    }, 300);
  }, [resetOsdTimer]);

  useEffect(() => {
    if (isSubtitlePopupOpen || isSubtitleModalOpen) {
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
  }, [playerState, isSubtitlePopupOpen, isSubtitleModalOpen]);

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

    const bufferWatchdog = setTimeout(() => {
      if (playerStateRef.current !== 'playing') {
        console.error('[PlayerScreen] 10s buffering timeout fired');
        driver.destroy();
        setPlayerState('error');
        playerStateRef.current = 'error';
        setPlaybackError({
          message: 'Buffering timeout after 10s. The stream may contain an unsupported codec (e.g. DTS audio or AV1 video) or network stalls.',
          streamUrl,
          driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
        });
      }
    }, 10000);

    driver.onTimeUpdate((pos, dur) => {
      if (pos > 0) {
        clearTimeout(bufferWatchdog);
      }
      setDurationMs(dur);
      durationMsRef.current = dur;

      // When seeking is in progress, ignore stale time updates
      if (seekDebounceTimerRef.current !== null) {
        return;
      }
      if (targetSeekMsRef.current !== null) {
        const dir = seekDirectionRef.current;
        const target = targetSeekMsRef.current;
        const isLockActive = Date.now() < seekLockUntilMsRef.current;
        const isStale =
          dir === 'forward'
            ? pos < target - 2000
            : dir === 'backward'
            ? pos > target + 2000
            : false;

        if (isLockActive && isStale) {
          // Drop stale timestamp from before seek completed
          return;
        }

        targetSeekMsRef.current = null;
        seekDirectionRef.current = null;
      }

      setPositionMs(pos);
      positionMsRef.current = pos;
    });

    driver.onStateChange((state) => {
      setPlayerState(state);
      playerStateRef.current = state;
      if (state === 'playing') {
        clearTimeout(bufferWatchdog);
      }
    });

    driver.onError((err) => {
      clearTimeout(bufferWatchdog);
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
      clearTimeout(bufferWatchdog);
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
      clearTimeout(bufferWatchdog);
      clearInterval(scrobbleInterval);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
      if (seekDebounceTimerRef.current) {
        clearTimeout(seekDebounceTimerRef.current);
        seekDebounceTimerRef.current = null;
      }
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
        code === TVKeys.PAUSE ||
        e.key === 'MediaPlayPause' ||
        e.key === ' ' ||
        e.key === 'k'
      ) {
        if (playerStateRef.current === 'playing') {
          driverRef.current?.pause();
        } else {
          driverRef.current?.play();
        }
      } else if (playerStateRef.current === 'paused' && (code === TVKeys.DOWN || e.key === 'ArrowDown')) {
        const subBtn = document.getElementById('btn-subtitles');
        if (subBtn && document.activeElement !== subBtn) {
          e.preventDefault();
          subBtn.focus();
          return;
        }
      } else if (playerStateRef.current === 'paused' && (code === TVKeys.UP || e.key === 'ArrowUp')) {
        const subBtn = document.getElementById('btn-subtitles');
        if (subBtn && document.activeElement === subBtn) {
          e.preventDefault();
          subBtn.blur();
          return;
        }
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        if (
          e.defaultPrevented ||
          isSubtitlePopupOpenRef.current ||
          isSubtitleModalOpenRef.current ||
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
        if (isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current) {
          return;
        }
        consecutiveFfCountRef.current = 0;
        consecutiveRewCountRef.current = 0;
        applySeek(-10000, 'backward', '-10s');
      } else if (code === TVKeys.RIGHT) {
        if (isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current) {
          return;
        }
        consecutiveFfCountRef.current = 0;
        consecutiveRewCountRef.current = 0;
        applySeek(10000, 'forward', '+10s');
      } else if (code === TVKeys.FAST_FORWARD) {
        if (isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current) {
          return;
        }
        const count = consecutiveFfCountRef.current;
        const stepSecs = count === 0 ? 30 : count === 1 ? 60 : 120;
        const stepMs = stepSecs * 1000;
        consecutiveFfCountRef.current += 1;
        consecutiveRewCountRef.current = 0;
        applySeek(stepMs, 'forward', `+${stepSecs}s`);
      } else if (code === TVKeys.REWIND) {
        if (isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current) {
          return;
        }
        const count = consecutiveRewCountRef.current;
        const stepSecs = count === 0 ? 30 : count === 1 ? 60 : 120;
        const stepMs = stepSecs * 1000;
        consecutiveRewCountRef.current += 1;
        consecutiveFfCountRef.current = 0;
        applySeek(-stepMs, 'backward', `-${stepSecs}s`);
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
  }, [onExit, resetOsdTimer, sessionManager, applySeek]);

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
        onOpenSubtitleModal={() => setIsSubtitleModalOpen(true)}
        onOpenSubtitles={() => setIsSubtitleModalOpen(true)}
      />

      <SubtitleModal
        isOpen={isSubtitleModalOpen}
        itemId={itemId}
        apiClient={apiClient}
        subtitles={subtitles}
        selectedSubtitleId={selectedSubtitleId}
        onSelectSubtitle={(id) => {
          setSelectedSubtitleId(id);
          setIsSubtitleModalOpen(false);
        }}
        onSubtitleDownloaded={(track) => {
          setSubtitles((prev) => [...prev, track]);
        }}
        onClose={() => setIsSubtitleModalOpen(false)}
      />

      {seekHud && (
        <div
          data-testid="seek-hud-badge"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#3B1111]/90 backdrop-blur-md border border-[rgba(245,229,229,0.2)] px-6 py-3 rounded-2xl flex items-center gap-3 text-white text-2xl font-bold shadow-2xl animate-fade-in"
        >
          {seekHud.direction === 'forward' ? (
            <FastForward className="w-8 h-8 text-[#FF6B00]" />
          ) : (
            <Rewind className="w-8 h-8 text-[#FF6B00]" />
          )}
          <span>{seekHud.label}</span>
          <span className="text-[#F5E5E5]/60 text-lg font-normal">
            ({formatTime(seekHud.targetMs / 1000)} / {formatTime(durationMs / 1000)})
          </span>
        </div>
      )}

      {playbackError && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Playback Error"
          className="fixed inset-0 z-50 bg-[#2A0A0A]/95 backdrop-blur-md flex items-center justify-center p-12 select-none"
        >
          <div className="bg-[#3B1111] border-2 border-[#D43F15]/50 rounded-3xl p-8 max-w-5xl w-full shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-8 mb-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#D43F15]/20 border border-[#D43F15]/30 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-8 h-8 text-[#D43F15]" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-extrabold text-[#F5E5E5] tracking-tight">Playback Error</h2>
                    <p className="text-base text-[#F5E5E5]/70">Could not stream media "{title}"</p>
                  </div>
                </div>

                <div className="bg-[#2A0A0A] p-4 rounded-2xl border border-[rgba(245,229,229,0.08)] mb-4 font-mono text-sm space-y-2 text-[#F5E5E5]/90">
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

                <div className="bg-[#2A0A0A]/70 p-4 rounded-xl border border-[rgba(245,229,229,0.08)] font-sans text-xs space-y-1.5 text-[#F5E5E5]/80">
                  <div className="font-bold text-[#FFB800] uppercase tracking-wider text-[11px] mb-1">
                    Samsung TV Hardware Compatibility Reference
                  </div>
                  <div className="flex flex-col gap-1">
                    <div>
                      <span className="text-emerald-400 font-semibold">Supported Video:</span> {KNOWN_COMPATIBILITY_INFO.supportedVideo.join(', ')}
                    </div>
                    <div>
                      <span className="text-emerald-400 font-semibold">Supported Audio:</span> {KNOWN_COMPATIBILITY_INFO.supportedAudio.join(', ')}
                    </div>
                    <div>
                      <span className="text-[#D43F15] font-semibold">Unsupported Video:</span> {KNOWN_COMPATIBILITY_INFO.unsupportedVideo.join(', ')}
                    </div>
                    <div>
                      <span className="text-[#D43F15] font-semibold">Unsupported Audio:</span> {KNOWN_COMPATIBILITY_INFO.unsupportedAudio.join(', ')} (e.g. DTS)
                    </div>
                  </div>
                </div>
              </div>

              {diagnosticPayload && (
                <div className="shrink-0 flex flex-col items-center justify-center pt-2">
                  <ErrorQRCode payload={diagnosticPayload} />
                </div>
              )}
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
