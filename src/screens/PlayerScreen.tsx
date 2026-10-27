import { useEffect, useRef, useState, useCallback, useMemo, useContext } from 'react';
import { createPlayerDriver, PlayerDriver, PlayerState } from '../player/driver';
import { ErrorQRCode, DiagnosticPayload } from '../components/player/ErrorQRCode';
import { KNOWN_COMPATIBILITY_INFO, isSupportedOnSamsungTv, getPlaybackUrl } from '../player/compatibility';
import { reportPlaybackProgress } from '../api/playback';
import { ApiClient } from '../api/client';
import { fetchItemSubtitles } from '../api/subtitles';
import { fetchMediaItem, MediaItemDetail } from '../api/items';
import { SubtitleTrack } from '../types/kadr';
import { PlaybackSessionManager } from '../player/session';
import { TVKeys } from '../navigation/keys';
import { FocusContext } from '../navigation/FocusContext';
import { PlayerOSD } from '../components/osd/PlayerOSD';
import { SubtitleModal } from '../components/player/SubtitleModal';
import { TVButton } from '../components/tv/TVButton';
import { AlertTriangle, RotateCcw, MonitorPlay, ArrowLeft, FastForward, Rewind, Layers, Info } from 'lucide-react';

export function formatTime(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function redactStreamUrl(url: string): string {
  if (!url) return '';
  return url.replace(/([?&](?:token|unlock_tokens?)=)[^&#]+/gi, '$1[REDACTED]');
}

export interface PlaybackErrorInfo {
  message: string;
  streamUrl: string;
  driverName: string;
  statusCode?: number;
}

export interface PlaylistItem {
  id: number | string;
  title: string;
  technical?: MediaItemDetail['technical'];
}

export interface PlayerScreenProps {
  itemId: number | string;
  title?: string;
  serverUrl: string;
  token: string;
  initialTimeMs?: number;
  initialResumeMs?: number;
  technical?: MediaItemDetail['technical'];
  client?: ApiClient;
  apiClient?: ApiClient;
  playlist?: PlaylistItem[];
  currentIndex?: number;
  onNext?: () => void;
  onPrevious?: () => void;
  onExit: () => void;
}

export function PlayerScreen({
  itemId,
  title = '',
  serverUrl,
  token,
  initialTimeMs = 0,
  initialResumeMs,
  technical,
  client,
  apiClient: apiClientProp,
  playlist,
  currentIndex,
  onNext,
  onPrevious,
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
  const isBrowserEnv =
    typeof window !== 'undefined' &&
    !(window as any).webapis?.avplay &&
    !(window as any).tizen &&
    (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test');
  const [forceHtml5, setForceHtml5] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const showDetailsModalRef = useRef(showDetailsModal);
  showDetailsModalRef.current = showDetailsModal;

  const [technicalInfo, setTechnicalInfo] = useState<MediaItemDetail['technical'] | undefined>(technical);
  const technicalInfoRef = useRef(technicalInfo);
  technicalInfoRef.current = technicalInfo;

  const [knownDurationMs, setKnownDurationMs] = useState<number>(0);
  const knownDurationMsRef = useRef(knownDurationMs);
  knownDurationMsRef.current = knownDurationMs;

  const [useHls, setUseHls] = useState<boolean>(() => {
    if (technical) {
      return !isSupportedOnSamsungTv(
        technical.video_codec,
        technical.audio_codec,
        technical.container,
        isBrowserEnv
      );
    }
    return false;
  });
  const [hlsSeekOffsetMs, setHlsSeekOffsetMs] = useState<number>(0);

  const isHlsRef = useRef(useHls);
  isHlsRef.current = useHls;

  const streamStartOffsetMsRef = useRef(0);
  const rawStreamDurationRef = useRef(0);

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

  // Fetch media item details (technical codecs + accurate duration)
  useEffect(() => {
    let isMounted = true;
    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(String(itemId), 10);
    if (!isNaN(numericItemId)) {
      fetchMediaItem(apiClient, numericItemId)
        .then((detail) => {
          if (!isMounted) return;
          if (detail.technical) {
            setTechnicalInfo(detail.technical);
            if (!isSupportedOnSamsungTv(
              detail.technical.video_codec,
              detail.technical.audio_codec,
              detail.technical.container,
              forceHtml5 || isBrowserEnv
            )) {
              setUseHls(true);
            }
          }
          if (detail.duration_ms) {
            setKnownDurationMs(detail.duration_ms);
          } else if (detail.duration_seconds) {
            setKnownDurationMs(detail.duration_seconds * 1000);
          }
        })
        .catch((err) => {
          console.warn('[PlayerScreen] Failed to fetch media item detail:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [itemId, apiClient, forceHtml5]);

  const handleRetry = useCallback((retryWithHls?: boolean) => {
    if (retryWithHls !== undefined) {
      setUseHls(retryWithHls);
    }
    setPlaybackError(null);
    setShowDetailsModal(false);
    setPlayerState('buffering');
    setReloadKey((k) => k + 1);
  }, []);

  const handleSwitchToHtml5 = useCallback(() => {
    setForceHtml5(true);
    setPlaybackError(null);
    setShowDetailsModal(false);
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
    if (!diagnosticPayload) return;
    const hostname = (() => {
      try {
        const parsed = new URL(serverUrl);
        if (parsed.hostname && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          return parsed.hostname;
        }
      } catch {}
      return (typeof window !== 'undefined' && window.location?.hostname) || '127.0.0.1';
    })();
    const logUrl = `http://${hostname}:9999/log`;
    if (typeof fetch === 'function') {
      try {
        fetch(logUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagnosticPayload),
        }).catch(() => {
          // Silently catch network errors (logger not active)
        });
      } catch {
        // Silently catch
      }
    }
  }, [diagnosticPayload, serverUrl]);

  useEffect(() => {
    if (playbackError && focusCtxRef.current) {
      focusCtxRef.current.pushTrap('player-error');
      focusCtxRef.current.setFocusedId('player-error-retry-btn');
      return () => {
        focusCtxRef.current?.popTrap();
      };
    }
  }, [playbackError]);

  useEffect(() => {
    if (showDetailsModal && focusCtxRef.current) {
      focusCtxRef.current.pushTrap('player-error-details');
      focusCtxRef.current.setFocusedId('player-error-details-close-btn');
      return () => {
        focusCtxRef.current?.popTrap();
        focusCtxRef.current?.setFocusedId('player-error-details-btn');
      };
    }
  }, [showDetailsModal]);

  const positionMsRef = useRef(positionMs);
  positionMsRef.current = positionMs;

  const durationMsRef = useRef(durationMs);
  durationMsRef.current = durationMs;

  const playerStateRef = useRef(playerState);
  playerStateRef.current = playerState;

  const hasPrevious = currentIndex !== undefined ? currentIndex > 0 : Boolean(onPrevious);
  const hasNext =
    currentIndex !== undefined && playlist ? currentIndex < playlist.length - 1 : Boolean(onNext);

  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const onPreviousRef = useRef(onPrevious);
  onPreviousRef.current = onPrevious;
  const hasNextRef = useRef(hasNext);
  hasNextRef.current = hasNext;
  const hasPreviousRef = useRef(hasPrevious);
  hasPreviousRef.current = hasPrevious;

  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const autoAdvanceCountdownRef = useRef(autoAdvanceCountdown);
  autoAdvanceCountdownRef.current = autoAdvanceCountdown;
  const autoAdvanceDismissedRef = useRef(false);

  useEffect(() => {
    autoAdvanceDismissedRef.current = false;
    setAutoAdvanceCountdown(null);
    setShowDetailsModal(false);
  }, [itemId]);

  // Handle auto-advance trigger near media end
  useEffect(() => {
    if (autoAdvanceDismissedRef.current) return;
    if (!hasNext || !onNext) return;
    if (autoAdvanceCountdown !== null) return;

    const isPaused = playerState === 'paused' || playerState === 'error';
    const isNearEnd = !isPaused && durationMs > 0 && positionMs >= durationMs - 1500;
    const isEnded = playerState === 'ended';

    if (isEnded || isNearEnd) {
      setAutoAdvanceCountdown(5);
    }
  }, [playerState, positionMs, durationMs, hasNext, onNext, autoAdvanceCountdown]);

  // Countdown timer for auto-advance (pure state decrement)
  useEffect(() => {
    if (autoAdvanceCountdown === null) return;

    const interval = setInterval(() => {
      setAutoAdvanceCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoAdvanceCountdown !== null]);

  // Trigger navigation when countdown hits 0 cleanly outside setState
  useEffect(() => {
    if (autoAdvanceCountdown === 0) {
      autoAdvanceDismissedRef.current = true;
      setAutoAdvanceCountdown(null);
      sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
      onNextRef.current?.();
    }
  }, [autoAdvanceCountdown, sessionManager]);

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

    if (
      autoAdvanceCountdownRef.current !== null &&
      durationMsRef.current > 0 &&
      targetMs < durationMsRef.current - 1500
    ) {
      setAutoAdvanceCountdown(null);
    }

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

      if (isHlsRef.current) {
        const relativeSeekMs = targetMs - streamStartOffsetMsRef.current;
        if (relativeSeekMs >= 0 && relativeSeekMs <= rawStreamDurationRef.current) {
          driverRef.current?.seekTo(relativeSeekMs, () => {});
        } else {
          setHlsSeekOffsetMs(targetMs);
          setReloadKey((k) => k + 1);
        }
      } else {
        driverRef.current?.seekTo(targetMs, () => {});
      }
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

    const activeStartMs = hlsSeekOffsetMs > 0 ? hlsSeekOffsetMs : initialResume;
    const streamStartOffsetMs = useHls && activeStartMs > 0 ? activeStartMs : 0;
    streamStartOffsetMsRef.current = streamStartOffsetMs;

    const playbackResult = getPlaybackUrl({
      serverUrl: cleanServerUrl,
      itemId,
      token,
      unlockTokens: apiClient.getUnlockTokens ? apiClient.getUnlockTokens() : [],
      forceHls: useHls,
      forceHtml5: forceHtml5 || isBrowserEnv,
      videoCodec: technicalInfoRef.current?.video_codec || technical?.video_codec,
      audioCodec: technicalInfoRef.current?.audio_codec || technical?.audio_codec,
      container: technicalInfoRef.current?.container || technical?.container,
      startSeconds: streamStartOffsetMs > 0 ? streamStartOffsetMs / 1000 : 0,
    });
    const streamUrl = playbackResult.url;
    const isHls = playbackResult.isHls;
    isHlsRef.current = isHls;

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
      rawStreamDurationRef.current = dur;
      const effectiveDur = knownDurationMsRef.current > 0 ? knownDurationMsRef.current : (streamStartOffsetMs + dur);
      setDurationMs(effectiveDur);
      durationMsRef.current = effectiveDur;

      // When seeking is in progress, ignore stale time updates
      if (seekDebounceTimerRef.current !== null) {
        return;
      }
      const effectivePos = streamStartOffsetMs + pos;
      if (targetSeekMsRef.current !== null) {
        const dir = seekDirectionRef.current;
        const target = targetSeekMsRef.current;
        const isLockActive = Date.now() < seekLockUntilMsRef.current;
        const isStale =
          dir === 'forward'
            ? effectivePos < target - 2000
            : dir === 'backward'
            ? effectivePos > target + 2000
            : false;

        if (isLockActive && isStale) {
          // Drop stale timestamp from before seek completed
          return;
        }

        targetSeekMsRef.current = null;
        seekDirectionRef.current = null;
      }

      setPositionMs(effectivePos);
      positionMsRef.current = effectivePos;
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

    const probeAbortController = new AbortController();
    const initialDriverTime = isHls && streamStartOffsetMs > 0 ? 0 : activeStartMs;

    const initDriver = () => {
      if (!isMounted || !containerRef.current) return;
      driver.init(containerRef.current, streamUrl, initialDriverTime).catch((err) => {
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
    };

    // Pre-flight stream check to catch missing media files (HTTP 404) gracefully
    const probeStream = async () => {
      try {
        const probeRes = await fetch(streamUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal: probeAbortController.signal,
        });

        if (!isMounted) return;

        if (probeRes.status === 404) {
          clearTimeout(bufferWatchdog);
          let serverErr = 'Media file missing from disk';
          try {
            const data = await probeRes.json();
            if (data && typeof data.error === 'string') {
              serverErr = data.error;
            } else if (data && typeof data.message === 'string') {
              serverErr = data.message;
            }
          } catch {
            // Keep default serverErr
          }

          setPlayerState('error');
          playerStateRef.current = 'error';
          setPlaybackError({
            message: `Media File Missing: ${serverErr} (HTTP 404)`,
            streamUrl,
            driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
            statusCode: 404,
          });
          return;
        }

        if (probeRes.ok) {
          try {
            probeRes.body?.cancel?.();
          } catch {
            // Ignored
          }
        }
      } catch (err: any) {
        if (!isMounted || probeAbortController.signal.aborted) {
          return;
        }
        // Non-blocking probe failure (e.g. network glitch): proceed with driver init
        console.warn('[PlayerScreen] Pre-flight probe failed, falling back to driver init:', err);
      }

      if (!isMounted) return;
      initDriver();
    };

    const isMockFetch = typeof fetch !== 'undefined' && Boolean((fetch as any).mock);
    const shouldProbe = typeof process === 'undefined' || process.env.NODE_ENV !== 'test' || isMockFetch;

    if (!shouldProbe) {
      initDriver();
    } else {
      probeStream();
    }

    if (activeSubtitleUrlRef.current) {
      driver.setSubtitleTrack(activeSubtitleUrlRef.current);
    }

    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(String(itemId), 10);
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
      probeAbortController.abort();
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
  }, [
    itemId,
    serverUrl,
    token,
    initialResume,
    sessionManager,
    reloadKey,
    forceHtml5,
    useHls,
    hlsSeekOffsetMs,
    technical,
  ]);

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
          if (showDetailsModalRef.current) {
            setShowDetailsModal(false);
          } else {
            onExit();
          }
        }
        return;
      }

      resetOsdTimer();

      if (autoAdvanceCountdownRef.current !== null) {
        if (code === TVKeys.ENTER || e.key === 'Enter') {
          e.preventDefault();
          autoAdvanceDismissedRef.current = true;
          setAutoAdvanceCountdown(null);
          sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
          onNextRef.current?.();
          return;
        }
        if (
          code === TVKeys.BACK_TIZEN ||
          code === TVKeys.BACK_WEB ||
          code === TVKeys.BACKSPACE ||
          e.key === 'Escape'
        ) {
          e.preventDefault();
          setAutoAdvanceCountdown(null);
          autoAdvanceDismissedRef.current = true;
          return;
        }
      }

      const isModalOpen =
        isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current;

      if (!isModalOpen) {
        if (
          code === TVKeys.MEDIA_TRACK_NEXT ||
          e.key === 'MediaTrackNext' ||
          code === TVKeys.CH_UP ||
          e.key === 'ChannelUp'
        ) {
          if (hasNextRef.current && onNextRef.current) {
            e.preventDefault();
            autoAdvanceDismissedRef.current = true;
            setAutoAdvanceCountdown(null);
            sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
            onNextRef.current();
            return;
          }
        } else if (
          code === TVKeys.MEDIA_TRACK_PREVIOUS ||
          e.key === 'MediaTrackPrevious' ||
          code === TVKeys.CH_DOWN ||
          e.key === 'ChannelDown'
        ) {
          if (hasPreviousRef.current && onPreviousRef.current) {
            e.preventDefault();
            autoAdvanceDismissedRef.current = true;
            setAutoAdvanceCountdown(null);
            sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
            onPreviousRef.current();
            return;
          }
        }
      }

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
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onPrevious={onPrevious}
        onNext={onNext}
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

      {autoAdvanceCountdown !== null && (
        <div
          data-testid="auto-advance-overlay"
          className="fixed bottom-24 right-16 z-50 bg-[#3B1111]/95 backdrop-blur-md border border-[rgba(245,229,229,0.2)] p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 animate-fade-in pointer-events-auto"
        >
          <div className="text-sm uppercase tracking-wider text-[#FFB800] font-bold">
            Up Next
          </div>
          <div className="text-2xl font-bold text-[#F5E5E5]">
            Next episode in {autoAdvanceCountdown}s...
          </div>
          <div className="text-xs text-[#F5E5E5]/60 flex items-center gap-4 mt-1">
            <span>Press <strong className="text-white">Enter</strong> to play now</span>
            <span>•</span>
            <span>Press <strong className="text-white">Back</strong> to cancel</span>
          </div>
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
                    <h2 className="text-3xl font-extrabold text-[#F5E5E5] tracking-tight">
                      {playbackError.statusCode === 404 || playbackError.message.includes('Media File Missing')
                        ? 'Media File Missing from Server Disk'
                        : 'Playback Error'}
                    </h2>
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

                {playbackError.statusCode === 404 || playbackError.message.includes('Media File Missing') ? (
                  <div className="bg-[#2A0A0A]/70 p-4 rounded-xl border border-[rgba(245,229,229,0.08)] font-sans text-xs space-y-1.5 text-[#F5E5E5]/80">
                    <div className="font-bold text-[#FFB800] uppercase tracking-wider text-[11px] mb-1">
                      File Resolution Guidance
                    </div>
                    <p className="text-[#F5E5E5]/90 text-sm">
                      The media file for this item could not be found in storage. Please verify your library paths or rescan your library on the server.
                    </p>
                  </div>
                ) : (
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
                )}
              </div>

              {diagnosticPayload && (
                <div className="shrink-0 flex flex-col items-center justify-center pt-2">
                  <ErrorQRCode payload={diagnosticPayload} />
                </div>
              )}
            </div>

            <div className="flex flex-col space-y-6 w-full">
              {focusCtx ? (
                <TVButton
                  id="player-error-retry-btn"
                  groupId="player-error"
                  order={1}
                  variant={useHls ? "primary" : "secondary"}
                  autoFocus={useHls}
                  onClick={() => handleRetry()}
                  onEnter={() => handleRetry()}
                  className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl"
                >
                  <RotateCcw className="w-6 h-6 mr-2" /> Retry Playback
                </TVButton>
              ) : (
                <button
                  id="player-error-retry-btn"
                  type="button"
                  autoFocus={useHls}
                  onClick={() => handleRetry()}
                  className={`w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl flex items-center justify-center cursor-pointer select-none ${
                    useHls ? 'bg-[#FF6B00] text-white' : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]'
                  }`}
                >
                  <RotateCcw className="w-6 h-6 mr-2" /> Retry Playback
                </button>
              )}

              {!useHls && (
                focusCtx ? (
                  <TVButton
                    id="player-error-hls-btn"
                    groupId="player-error"
                    order={2}
                    variant="primary"
                    autoFocus
                    onClick={() => handleRetry(true)}
                    onEnter={() => handleRetry(true)}
                    className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl bg-[#FF6B00]"
                  >
                    <Layers className="w-6 h-6 mr-2" /> Play with Transcoding (HLS)
                  </TVButton>
                ) : (
                  <button
                    id="player-error-hls-btn"
                    type="button"
                    autoFocus
                    onClick={() => handleRetry(true)}
                    className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl flex items-center justify-center cursor-pointer select-none bg-[#FF6B00] text-white"
                  >
                    <Layers className="w-6 h-6 mr-2" /> Play with Transcoding (HLS)
                  </button>
                )
              )}

              {playbackError.driverName.includes('AVPlay') && (
                focusCtx ? (
                  <TVButton
                    id="player-error-html5-btn"
                    groupId="player-error"
                    order={3}
                    variant="secondary"
                    onClick={handleSwitchToHtml5}
                    onEnter={handleSwitchToHtml5}
                    className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl"
                  >
                    <MonitorPlay className="w-6 h-6 mr-2" /> Try HTML5 Video Player
                  </TVButton>
                ) : (
                  <button
                    id="player-error-html5-btn"
                    type="button"
                    onClick={handleSwitchToHtml5}
                    className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl flex items-center justify-center cursor-pointer select-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]"
                  >
                    <MonitorPlay className="w-6 h-6 mr-2" /> Try HTML5 Video Player
                  </button>
                )
              )}

              {focusCtx ? (
                <TVButton
                  id="player-error-exit-btn"
                  groupId="player-error"
                  order={4}
                  variant="secondary"
                  onClick={onExit}
                  onEnter={onExit}
                  className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl"
                >
                  <ArrowLeft className="w-6 h-6 mr-2" /> Exit to Browse
                </TVButton>
              ) : (
                <button
                  id="player-error-exit-btn"
                  type="button"
                  onClick={onExit}
                  className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl flex items-center justify-center cursor-pointer select-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]"
                >
                  <ArrowLeft className="w-6 h-6 mr-2" /> Exit to Browse
                </button>
              )}

              {focusCtx ? (
                <TVButton
                  id="player-error-details-btn"
                  data-testid="player-error-details-btn"
                  groupId="player-error"
                  order={5}
                  variant="secondary"
                  onClick={() => setShowDetailsModal(true)}
                  onEnter={() => setShowDetailsModal(true)}
                  className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl"
                >
                  <Info className="w-6 h-6 mr-2" /> View Technical Details
                </TVButton>
              ) : (
                <button
                  id="player-error-details-btn"
                  data-testid="player-error-details-btn"
                  type="button"
                  onClick={() => setShowDetailsModal(true)}
                  className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl flex items-center justify-center cursor-pointer select-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]"
                >
                  <Info className="w-6 h-6 mr-2" /> View Technical Details
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && playbackError && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Technical Diagnostic Details"
          data-testid="player-error-details-modal"
          className="fixed inset-0 z-[60] bg-[#1A0505]/95 backdrop-blur-md flex items-center justify-center p-12 select-none"
        >
          <div className="bg-[#2A0A0A] border-2 border-[#FF6B00]/40 rounded-3xl p-8 max-w-4xl w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-[rgba(245,229,229,0.1)] mb-6">
              <div className="flex items-center gap-3">
                <Info className="w-8 h-8 text-[#FF6B00]" />
                <h3 className="text-2xl font-bold text-[#F5E5E5]">
                  Technical Diagnostic Details
                </h3>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-sm space-y-4 text-[#F5E5E5]/90 pr-2">
              <div className="grid grid-cols-2 gap-4 bg-[#3B1111]/50 p-4 rounded-xl border border-[rgba(245,229,229,0.08)]">
                <div>
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Item ID</span>
                  <span className="text-[#F5E5E5]">{itemId}</span>
                </div>
                <div>
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Title</span>
                  <span className="text-[#F5E5E5]">{title || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">HTTP Status Code</span>
                  <span className="text-[#F5E5E5]">{playbackError.statusCode || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Player Engine</span>
                  <span className="text-[#F5E5E5]">{playbackError.driverName}</span>
                </div>
                <div>
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Timestamp</span>
                  <span className="text-[#F5E5E5]">{diagnosticPayload?.timestamp || new Date().toISOString()}</span>
                </div>
                <div>
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Platform</span>
                  <span className="text-[#F5E5E5]">
                    {diagnosticPayload?.tv_model || 'Unknown TV'} (Tizen {diagnosticPayload?.tizen_version || '5.5'})
                  </span>
                </div>
              </div>

              <div className="bg-[#3B1111]/50 p-4 rounded-xl border border-[rgba(245,229,229,0.08)]">
                <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Error Message</span>
                <p className="text-[#D43F15] whitespace-pre-wrap break-words">{playbackError.message}</p>
              </div>

              <div className="bg-[#3B1111]/50 p-4 rounded-xl border border-[rgba(245,229,229,0.08)]">
                <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Stream URL (Redacted)</span>
                <p className="break-all text-[#F5E5E5]/80">{redactStreamUrl(playbackError.streamUrl)}</p>
              </div>

              <div className="bg-[#3B1111]/50 p-4 rounded-xl border border-[rgba(245,229,229,0.08)]">
                <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Resolution Guidance / Stack Trace</span>
                <p className="text-xs text-[#F5E5E5]/70 whitespace-pre-wrap">
                  {playbackError.statusCode === 404 || playbackError.message.includes('Media File Missing')
                    ? 'Media file missing on server storage. Check file paths and server storage mounts.'
                    : 'Stream failed to play or buffer timed out. If the media uses an unsupported audio/video codec (e.g. DTS audio or AV1 video), transcode via HLS or use HTML5 fallback.'}
                </p>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-[rgba(245,229,229,0.1)]">
              {focusCtx ? (
                <TVButton
                  id="player-error-details-close-btn"
                  data-testid="player-error-details-close-btn"
                  groupId="player-error-details"
                  order={1}
                  autoFocus
                  variant="primary"
                  onClick={() => setShowDetailsModal(false)}
                  onEnter={() => setShowDetailsModal(false)}
                  className="w-full !py-4 !px-8 !text-xl font-bold rounded-xl"
                >
                  Close
                </TVButton>
              ) : (
                <button
                  id="player-error-details-close-btn"
                  data-testid="player-error-details-close-btn"
                  type="button"
                  autoFocus
                  onClick={() => setShowDetailsModal(false)}
                  className="w-full !py-4 !px-8 !text-xl font-bold rounded-xl bg-[#FF6B00] text-white flex items-center justify-center cursor-pointer select-none"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
