import { useEffect, useRef, useState, useCallback, useMemo, useContext } from 'react';
import { createPlayerDriver, PlayerDriver, PlayerState } from '../player/driver';
import { ErrorQRCode, DiagnosticPayload } from '../components/player/ErrorQRCode';
import {
  KNOWN_COMPATIBILITY_INFO,
  SAMSUNG_TV_HLS_MAX_HEIGHT,
  hasMissingAudioStream,
  isSupportedOnSamsungTv,
  getPlaybackUrl,
} from '../player/compatibility';
import { reportPlaybackProgress } from '../api/playback';
import { ApiClient } from '../api/client';
import { fetchItemSubtitles } from '../api/subtitles';
import { fetchMediaItem, MediaItemDetail } from '../api/items';
import { SubtitleTrack } from '../types/kadr';
import { PlaybackSessionManager } from '../player/session';
import { TVKeys } from '../navigation/keys';
import { FocusContext } from '../navigation/FocusContext';
import { PlayerOSD, PlayerOsdFocusItem } from '../components/osd/PlayerOSD';
import { SubtitleModal } from '../components/player/SubtitleModal';
import { SubtitleOverlay } from '../components/player/SubtitleOverlay';
import { findActiveCueText } from '../player/subtitles';
import { useStoryboard } from '../player/storyboard';
import { useSubtitleCues } from '../player/useSubtitleCues';
import {
  clampSubtitleDelay,
  loadSubtitleDelays,
  loadSubtitlePreference,
  loadSubtitleSettings,
  pickInitialSubtitleTrack,
  saveSubtitleDelays,
  saveSubtitlePreference,
  saveSubtitleSettings,
  SubtitleSettings,
} from '../player/subtitleSettings';
import { TVButton } from '../components/tv/TVButton';
import { AlertTriangle, RotateCcw, MonitorPlay, ArrowLeft, FastForward, Rewind, Layers, Info } from 'lucide-react';
import { PlaybackProgressSnapshot } from '../utils/playbackProgress';

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
  mediaType?: string;
  isLive?: boolean;
  technical?: MediaItemDetail['technical'];
  client?: ApiClient;
  apiClient?: ApiClient;
  playlist?: PlaylistItem[];
  currentIndex?: number;
  onNext?: () => void;
  onPrevious?: () => void;
  onExit: (snapshot?: PlaybackProgressSnapshot) => void;
  onEpisodeProgress?: (snapshot: PlaybackProgressSnapshot) => void;
}

function canBypassHlsForAudioLessVideo(
  tech: MediaItemDetail['technical'] | undefined,
  useHtml5: boolean
): boolean {
  if (!tech || !hasMissingAudioStream(tech.video_codec, tech.audio_codec)) {
    return false;
  }
  return isSupportedOnSamsungTv(
    tech.video_codec,
    undefined,
    useHtml5 ? tech.container : undefined,
    useHtml5
  );
}

/** Idle time after the last skip press before the seek is applied (the video keeps playing meanwhile). */
const SEEK_COMMIT_DELAY_MS = 700;
/** HLS seeks restart the server transcode, so wait longer to batch several skips into one restart. */
const HLS_SEEK_COMMIT_DELAY_MS = 1000;

export function PlayerScreen({
  itemId,
  title = '',
  serverUrl,
  token,
  initialTimeMs,
  initialResumeMs,
  mediaType,
  isLive: isLiveProp,
  technical,
  client,
  apiClient: apiClientProp,
  playlist,
  currentIndex,
  onNext,
  onPrevious,
  onExit,
  onEpisodeProgress,
}: PlayerScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const driverRef = useRef<PlayerDriver | null>(null);
  const rawInitialStart = initialResumeMs ?? initialTimeMs;
  // Auto-resume from server playback session ONLY when start time was omitted (undefined),
  // negative, or passed as a 1..100 percentage sentinel (when caller only knew playback_progress).
  // An explicit 0 ("Play", "Play from Beginning", Folder Browser, Playlist) must start at 0:00.
  const allowSessionAutoResume =
    rawInitialStart === undefined ||
    rawInitialStart < 0 ||
    (rawInitialStart > 0 && rawInitialStart <= 100);
  const allowSessionAutoResumeRef = useRef(allowSessionAutoResume);
  allowSessionAutoResumeRef.current = allowSessionAutoResume;

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onEpisodeProgressRef = useRef(onEpisodeProgress);
  onEpisodeProgressRef.current = onEpisodeProgress;

  const initialResume =
    rawInitialStart !== undefined && rawInitialStart > 100 ? rawInitialStart : 0;
  const initialKnownDurationMs =
    technical?.duration_seconds !== undefined && technical.duration_seconds > 0
      ? technical.duration_seconds * 1000
      : 0;

  const [playerState, setPlayerState] = useState<PlayerState>('buffering');
  const [positionMs, setPositionMs] = useState(initialResume);
  const [durationMs, setDurationMs] = useState(initialKnownDurationMs);
  const [showOSD, setShowOSD] = useState(true);
  const showOSDRef = useRef(showOSD);
  showOSDRef.current = showOSD;

  const hasStartedPlaybackRef = useRef(false);
  const osdDismissedByUserRef = useRef(false);
  const finalFlushedItemRef = useRef<string | null>(null);
  const prevPlayerStateRef = useRef<PlayerState>(playerState);

  useEffect(() => {
    hasStartedPlaybackRef.current = false;
    osdDismissedByUserRef.current = false;
    finalFlushedItemRef.current = null;
  }, [itemId]);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<number | null>(null);
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(() =>
    loadSubtitleSettings()
  );
  // Timing offset (ms, + = later) per subtitle track id
  const [subtitleDelays, setSubtitleDelays] = useState<Record<string, number>>(() =>
    loadSubtitleDelays()
  );
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

  const [itemMediaType, setItemMediaType] = useState<string | undefined>(mediaType);
  const [isLiveStream, setIsLiveStream] = useState<boolean>(() =>
    Boolean(
      isLiveProp ||
        mediaType === 'live_channel' ||
        (technical?.duration_seconds !== undefined && technical.duration_seconds <= 0)
    )
  );
  const isLiveStreamRef = useRef(isLiveStream);
  isLiveStreamRef.current = isLiveStream;

  const [knownDurationMs, setKnownDurationMs] = useState<number>(initialKnownDurationMs);
  const knownDurationMsRef = useRef(knownDurationMs);
  knownDurationMsRef.current = knownDurationMs;

  const initialBypassHls = canBypassHlsForAudioLessVideo(technical, forceHtml5 || isBrowserEnv);
  const [useHls, setUseHls] = useState<boolean>(() => !initialBypassHls);
  const hlsAutoFallbackDoneRef = useRef<boolean>(initialBypassHls);
  const hlsTranscodeFailedRef = useRef<boolean>(false);
  const directStreamTriedRef = useRef<boolean>(false);
  const [hlsSeekOffsetMs, setHlsSeekOffsetMs] = useState<number | null>(null);
  const hlsSeekOffsetMsRef = useRef<number | null>(hlsSeekOffsetMs);
  hlsSeekOffsetMsRef.current = hlsSeekOffsetMs;

  const isHlsRef = useRef(useHls);
  const sessionResumeMsRef = useRef<number>(0);
  const isDriverInitializedRef = useRef<boolean>(false);

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

  const [osdFocusedItem, setOsdFocusedItem] = useState<PlayerOsdFocusItem>('progress');
  const osdFocusedItemRef = useRef<PlayerOsdFocusItem>(osdFocusedItem);
  osdFocusedItemRef.current = osdFocusedItem;

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
          if (detail.media_type) {
            setItemMediaType(detail.media_type);
          }
          const detailDurationSec =
            detail.duration_seconds ?? detail.technical?.duration_seconds;
          if (
            detail.media_type === 'live_channel' ||
            (detailDurationSec !== undefined && detailDurationSec <= 0)
          ) {
            setIsLiveStream(true);
            isLiveStreamRef.current = true;
          }
          if (detail.technical || detail.resolution) {
            const mergedTechnical: MediaItemDetail['technical'] = {
              ...detail.technical,
              resolution: detail.technical?.resolution ?? detail.resolution,
            };
            setTechnicalInfo(mergedTechnical);
            technicalInfoRef.current = mergedTechnical;
            driverRef.current?.setMediaHints?.({
              resolution: mergedTechnical.resolution,
              width: mergedTechnical.width,
              height: mergedTechnical.height,
              rotation: mergedTechnical.rotation,
            });
            if (
              !hlsAutoFallbackDoneRef.current &&
              !directStreamTriedRef.current &&
              canBypassHlsForAudioLessVideo(mergedTechnical, forceHtml5 || isBrowserEnv)
            ) {
              hlsAutoFallbackDoneRef.current = true;
              hlsTranscodeFailedRef.current = true;
              setUseHls(false);
            } else if (
              detail.technical &&
              !hlsAutoFallbackDoneRef.current &&
              !isSupportedOnSamsungTv(
                detail.technical.video_codec,
                detail.technical.audio_codec,
                detail.technical.container,
                forceHtml5 || isBrowserEnv
              )
            ) {
              setUseHls(true);
            }
          }
          const probedDurationMs =
            detail.duration_ms && detail.duration_ms > 0
              ? detail.duration_ms
              : detailDurationSec && detailDurationSec > 0
              ? detailDurationSec * 1000
              : 0;
          if (probedDurationMs > 0) {
            setKnownDurationMs(probedDurationMs);
            knownDurationMsRef.current = probedDurationMs;
            setDurationMs(probedDurationMs);
            durationMsRef.current = probedDurationMs;
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
      hlsAutoFallbackDoneRef.current = !retryWithHls || directStreamTriedRef.current;
      if (retryWithHls) {
        hlsTranscodeFailedRef.current = false;
      }
      setUseHls(retryWithHls);
    } else {
      const bypass = canBypassHlsForAudioLessVideo(
        technicalInfoRef.current ?? technical,
        forceHtml5 || isBrowserEnv
      );
      hlsAutoFallbackDoneRef.current = bypass;
      hlsTranscodeFailedRef.current = false;
      directStreamTriedRef.current = false;
    }
    setPlaybackError(null);
    setShowDetailsModal(false);
    setPlayerState('buffering');
    setReloadKey((k) => k + 1);
  }, [technical, forceHtml5, isBrowserEnv]);

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
    setTechnicalInfo(technical);
    technicalInfoRef.current = technical;
    const bypass = canBypassHlsForAudioLessVideo(technical, forceHtml5 || isBrowserEnv);
    hlsAutoFallbackDoneRef.current = bypass;
    hlsTranscodeFailedRef.current = false;
    directStreamTriedRef.current = false;
    setUseHls(!bypass);
  }, [itemId]);

  useEffect(() => {
    const activeTech = technicalInfo ?? technical;
    driverRef.current?.setMediaHints?.(
      activeTech
        ? {
            resolution: activeTech.resolution,
            width: activeTech.width,
            height: activeTech.height,
            rotation: activeTech.rotation,
          }
        : undefined
    );
  }, [technicalInfo, technical]);

  useEffect(() => {
    autoAdvanceDismissedRef.current = false;
    setAutoAdvanceCountdown(null);
    setShowDetailsModal(false);
    setHlsSeekOffsetMs(null);
    hlsSeekOffsetMsRef.current = null;
    sessionResumeMsRef.current = 0;
    targetSeekMsRef.current = null;
    seekDirectionRef.current = null;
    seekLockUntilMsRef.current = 0;
    setSeekHud(null);
    setOsdFocusedItem('progress');
    osdFocusedItemRef.current = 'progress';
    setItemMediaType(mediaType);
    const nextKnownDurMs =
      technical?.duration_seconds !== undefined && technical.duration_seconds > 0
        ? technical.duration_seconds * 1000
        : 0;
    setKnownDurationMs(nextKnownDurMs);
    knownDurationMsRef.current = nextKnownDurMs;
    setDurationMs(nextKnownDurMs);
    durationMsRef.current = nextKnownDurMs;
    setPositionMs(initialResume);
    positionMsRef.current = initialResume;
    const nextIsLive = Boolean(
      isLiveProp ||
        mediaType === 'live_channel' ||
        (technical?.duration_seconds !== undefined && technical.duration_seconds <= 0)
    );
    setIsLiveStream(nextIsLive);
    isLiveStreamRef.current = nextIsLive;
  }, [itemId, mediaType, isLiveProp, technical, initialResume]);

  const buildAndFlushSnapshot = useCallback(
    (overridePosMs?: number, destroySession = false): PlaybackProgressSnapshot => {
      const posMs = overridePosMs ?? positionMsRef.current;
      if (overridePosMs !== undefined) {
        positionMsRef.current = posMs;
      }
      const durMs = durationMsRef.current;
      const shouldWrite =
        (hasStartedPlaybackRef.current || posMs > 0) && !isLiveStreamRef.current;

      finalFlushedItemRef.current = String(itemId);

      const hadActiveSession = hasActiveSessionRef.current;
      if (hadActiveSession) {
        hasActiveSessionRef.current = false;
      }

      const flushPromise: Promise<void> | undefined = hadActiveSession
        ? sessionManager.flushAndDestroy(shouldWrite ? Math.floor(posMs / 1000) : undefined)
        : shouldWrite
        ? Promise.all([
            reportPlaybackProgress(serverUrl, token, itemId, posMs, true),
            sessionManager.destroy(),
          ]).then(() => {})
        : sessionManager.destroy();

      const snapshot: PlaybackProgressSnapshot = {
        itemId,
        positionMs: posMs,
        durationMs: durMs,
        flushPromise,
      };

      if (!destroySession) {
        onEpisodeProgressRef.current?.(snapshot);
      }

      return snapshot;
    },
    [itemId, serverUrl, token, sessionManager]
  );

  const handleManualNext = useCallback(() => {
    buildAndFlushSnapshot(undefined, false);
    onNextRef.current?.();
  }, [buildAndFlushSnapshot]);

  const handleManualPrevious = useCallback(() => {
    buildAndFlushSnapshot(undefined, false);
    onPreviousRef.current?.();
  }, [buildAndFlushSnapshot]);

  const handleExit = useCallback(() => {
    const snap = buildAndFlushSnapshot(undefined, true);
    onExit(snap);
  }, [buildAndFlushSnapshot, onExit]);

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
      const overridePosMs =
        durationMsRef.current > 0
          ? Math.max(positionMsRef.current, durationMsRef.current)
          : positionMsRef.current;
      buildAndFlushSnapshot(overridePosMs, false);
      onNextRef.current?.();
    }
  }, [autoAdvanceCountdown, buildAndFlushSnapshot]);

  // Fetch subtitles on mount / item change
  useEffect(() => {
    let isMounted = true;
    setSubtitles([]);
    setSelectedSubtitleId(null);
    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(itemId, 10);
    if (!isNaN(numericItemId)) {
      fetchItemSubtitles(apiClient, numericItemId)
        .then((tracks) => {
          if (!isMounted) return;
          if (!Array.isArray(tracks)) return;
          setSubtitles(tracks);
          const initialId = pickInitialSubtitleTrack(tracks, loadSubtitlePreference());
          setSelectedSubtitleId(initialId);
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

  // Subtitles are rendered by <SubtitleOverlay> in the web layer (Tizen AVPlay draws video on a
  // native plane, so driver-level <track> elements are never visible there).
  const activeSubtitleFormat = subtitles.find((s) => s.id === selectedSubtitleId)?.format;
  const {
    cues: subtitleCues,
    loading: subtitleLoading,
    error: subtitleError,
  } = useSubtitleCues(apiClient, activeSubtitleUrl, activeSubtitleFormat);
  const activeSubtitleDelayMs =
    selectedSubtitleId !== null ? subtitleDelays[String(selectedSubtitleId)] ?? 0 : 0;
  // A positive delay shows each line later, so look the cue up at an earlier position
  const activeSubtitleText = useMemo(
    () => findActiveCueText(subtitleCues, positionMs - activeSubtitleDelayMs),
    [subtitleCues, positionMs, activeSubtitleDelayMs]
  );

  const handleChangeSubtitleDelay = useCallback(
    (delayMs: number) => {
      if (selectedSubtitleId === null) return;
      const clamped = clampSubtitleDelay(delayMs);
      setSubtitleDelays((prev) => {
        const next = { ...prev };
        if (clamped === 0) {
          delete next[String(selectedSubtitleId)];
        } else {
          next[String(selectedSubtitleId)] = clamped;
        }
        saveSubtitleDelays(next);
        return next;
      });
    },
    [selectedSubtitleId]
  );

  const handleChangeSubtitleSettings = useCallback((next: SubtitleSettings) => {
    setSubtitleSettings(next);
    saveSubtitleSettings(next);
  }, []);

  const handleSelectSubtitle = useCallback(
    (id: number | null, explicitTrack?: SubtitleTrack) => {
      setSelectedSubtitleId(id);
      if (id === null) {
        saveSubtitlePreference({ mode: 'off' });
      } else {
        const chosen = explicitTrack ?? subtitles.find((t) => t.id === id);
        if (chosen?.language) {
          saveSubtitlePreference({
            mode: 'language',
            language: chosen.language,
            preferForced: Boolean(chosen.is_forced),
          });
        }
      }
    },
    [subtitles]
  );

  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetOsdTimer = useCallback(() => {
    osdDismissedByUserRef.current = false;
    setShowOSD(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    if (playerStateRef.current === 'playing' && !isSubtitlePopupOpenRef.current && !isSubtitleModalOpenRef.current) {
      osdTimerRef.current = setTimeout(() => {
        setShowOSD(false);
        setOsdFocusedItem('progress');
        osdFocusedItemRef.current = 'progress';
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

  // Applies the pending skip right away (OK button) instead of waiting for the idle delay
  const commitPendingSeekRef = useRef<(() => void) | null>(null);
  // Set when an HLS seek restarts the stream so the old picture can keep playing until the new one is ready
  const seamlessSwapRef = useRef(false);
  const retiringDriverRef = useRef<{ release: () => void } | null>(null);

  const applySeek = useCallback((deltaMs: number, direction: 'forward' | 'backward', stepLabel: string) => {
    resetOsdTimer();
    if (isLiveStreamRef.current) {
      return;
    }
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

    // The video keeps playing at its natural position while skips accumulate; only the progress
    // indicator moves. The jump happens once the user stops pressing (or presses OK).
    const commit = () => {
      if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
      seekDebounceTimerRef.current = null;
      commitPendingSeekRef.current = null;
      seekDirectionRef.current = direction;
      targetSeekMsRef.current = targetMs;
      seekLockUntilMsRef.current = Date.now() + 5000;

      if (isHlsRef.current) {
        seamlessSwapRef.current = true;
        hlsSeekOffsetMsRef.current = targetMs;
        setHlsSeekOffsetMs(targetMs);
        setReloadKey((k) => k + 1);
      } else {
        driverRef.current?.seekTo(targetMs, () => {
          seekLockUntilMsRef.current = Math.min(seekLockUntilMsRef.current, Date.now() + 500);
        });
      }
    };

    if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
    commitPendingSeekRef.current = commit;
    seekDebounceTimerRef.current = setTimeout(
      commit,
      isHlsRef.current ? HLS_SEEK_COMMIT_DELAY_MS : SEEK_COMMIT_DELAY_MS
    );
  }, [resetOsdTimer]);

  useEffect(() => {
    if (!seekHud) return;
    if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
    seekHudTimerRef.current = setTimeout(() => {
      setSeekHud(null);
      consecutiveFfCountRef.current = 0;
      consecutiveRewCountRef.current = 0;
    }, 1500);
    return () => {
      if (seekHudTimerRef.current) {
        clearTimeout(seekHudTimerRef.current);
        seekHudTimerRef.current = null;
      }
    };
  }, [seekHud]);

  useEffect(() => {
    return () => {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
      if (seekDebounceTimerRef.current) {
        clearTimeout(seekDebounceTimerRef.current);
        seekDebounceTimerRef.current = null;
        commitPendingSeekRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const isStateTransition = prevPlayerStateRef.current !== playerState;
    prevPlayerStateRef.current = playerState;
    if (isStateTransition && (playerState === 'paused' || playerState === 'ended')) {
      osdDismissedByUserRef.current = false;
    }

    if (isSubtitlePopupOpen || isSubtitleModalOpen) {
      setShowOSD(true);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      return;
    }
    if (playerState === 'playing') {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      osdTimerRef.current = setTimeout(() => {
        setShowOSD(false);
        setOsdFocusedItem('progress');
        osdFocusedItemRef.current = 'progress';
      }, 4000);
    } else {
      if (!osdDismissedByUserRef.current) {
        setShowOSD(true);
      }
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    }
  }, [playerState, isSubtitlePopupOpen, isSubtitleModalOpen]);

  useEffect(() => {
    // For AVPlay hardware video plane on Samsung Tizen, html and body backgrounds must be transparent
    const prevBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.backgroundColor = prevBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
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

    const activeStartMs =
      hlsSeekOffsetMs !== null
        ? hlsSeekOffsetMs
        : sessionResumeMsRef.current > 0
        ? sessionResumeMsRef.current
        : initialResume;

    const playbackResult = getPlaybackUrl({
      serverUrl: cleanServerUrl,
      itemId,
      token,
      unlockTokens: apiClient.getUnlockTokens ? apiClient.getUnlockTokens() : [],
      forceHls: useHls,
      forceDirect: !useHls,
      forceHtml5: forceHtml5 || isBrowserEnv,
      videoCodec: technicalInfoRef.current?.video_codec || technical?.video_codec,
      audioCodec: technicalInfoRef.current?.audio_codec || technical?.audio_codec,
      container: technicalInfoRef.current?.container || technical?.container,
      startSeconds: activeStartMs > 0 ? activeStartMs / 1000 : 0,
      maxHeight: SAMSUNG_TV_HLS_MAX_HEIGHT,
    });
    const streamUrl = playbackResult.url;
    const isHls = playbackResult.isHls;
    isHlsRef.current = isHls;
    if (!isHls) {
      directStreamTriedRef.current = true;
    }

    const streamStartOffsetMs = isHls && activeStartMs > 0 ? activeStartMs : 0;
    streamStartOffsetMsRef.current = streamStartOffsetMs;

    let hlsProbeSucceeded = false;
    let hasPlayedCurrentStream = false;

    const canDirectPlayCodecs = () => {
      if (hlsAutoFallbackDoneRef.current || directStreamTriedRef.current) {
        return false;
      }
      const fallbackTech = technicalInfoRef.current ?? technical;
      if (!fallbackTech) {
        return true;
      }
      const useHtml5Mode = forceHtml5 || isBrowserEnv;
      return isSupportedOnSamsungTv(
        fallbackTech.video_codec,
        fallbackTech.audio_codec,
        useHtml5Mode ? fallbackTech.container : undefined,
        useHtml5Mode
      );
    };

    const driver = createPlayerDriver(forceHtml5);
    driverRef.current = driver;
    isDriverInitializedRef.current = false;

    const activeTech = technicalInfoRef.current ?? technical;
    driver.setMediaHints?.(
      activeTech
        ? {
            resolution: activeTech.resolution,
            width: activeTech.width,
            height: activeTech.height,
            rotation: activeTech.rotation,
          }
        : undefined
    );

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
      if (!isMounted || driverRef.current !== driver) return;
      if (pos > 0) {
        hasStartedPlaybackRef.current = true;
        hasPlayedCurrentStream = true;
        clearTimeout(bufferWatchdog);
      }
      const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 0;
      rawStreamDurationRef.current = safeDur;
      const effectiveDur =
        knownDurationMsRef.current > 0 ? knownDurationMsRef.current : streamStartOffsetMs + safeDur;
      setDurationMs(effectiveDur);
      durationMsRef.current = effectiveDur;

      // When seeking is in progress, ignore stale time updates
      if (seekDebounceTimerRef.current !== null) {
        return;
      }
      const effectivePos = streamStartOffsetMs + pos;
      if (targetSeekMsRef.current !== null) {
        const target = targetSeekMsRef.current;
        const isLockActive = Date.now() < seekLockUntilMsRef.current;
        // Drop any pre-seek or live-edge timestamp outside the expected post-seek window,
        // regardless of whether the final tap in a multi-key scrub was forward or backward.
        const isStale = effectivePos < target - 2500 || effectivePos > target + 8000;

        if (isLockActive && isStale) {
          return;
        }

        targetSeekMsRef.current = null;
        seekDirectionRef.current = null;
      }

      setPositionMs(effectivePos);
      positionMsRef.current = effectivePos;
    });

    driver.onStateChange((state) => {
      if (!isMounted || driverRef.current !== driver) return;
      if (retiringDriverRef.current) {
        // Seamless swap: the previous picture is still on screen and playing.
        if (state === 'buffering') return; // don't flash a spinner over a playing video
        if (state === 'playing') retiringDriverRef.current.release(); // new stream is ready
      }
      setPlayerState(state);
      playerStateRef.current = state;
      if (state === 'playing' || state === 'paused' || state === 'ended') {
        hasStartedPlaybackRef.current = true;
      }
      if (state === 'playing') {
        hasPlayedCurrentStream = true;
        clearTimeout(bufferWatchdog);
      }
      if (state === 'ended') {
        if (!isLiveStreamRef.current && durationMsRef.current > 0) {
          positionMsRef.current = durationMsRef.current;
          setPositionMs(durationMsRef.current);
          const endedSecs = Math.floor(durationMsRef.current / 1000);
          if (hasActiveSessionRef.current) {
            sessionManager.updateProgress(endedSecs);
          } else {
            reportPlaybackProgress(serverUrl, token, itemId, durationMsRef.current, false);
          }
        }
      }
    });

    const probeAbortController = new AbortController();
    let activeHlsSessionId: string | null = null;

    // Releases the server-side ffmpeg transcode for an HLS session we no longer need
    const deleteHlsSession = (sessionId: string) => {
      if (typeof fetch !== 'function') return;
      try {
        fetch(`${cleanServerUrl}/api/v1/media/${itemId}/hls/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }).catch(() => {});
      } catch {
        // Ignored
      }
    };
    const extractHlsSessionId = (playlistText: string): string | null => {
      const match = playlistText.match(/\/hls\/sessions\/([0-9a-f-]{36})\//i);
      return match && match[1] ? match[1] : null;
    };

    driver.onError((err) => {
      if (!isMounted || driverRef.current !== driver) return;
      clearTimeout(bufferWatchdog);
      if (isHls && hlsProbeSucceeded && !hasPlayedCurrentStream && canDirectPlayCodecs()) {
        if (activeHlsSessionId) {
          const idToDelete = activeHlsSessionId;
          activeHlsSessionId = null;
          deleteHlsSession(idToDelete);
        }
        hlsAutoFallbackDoneRef.current = true;
        hlsTranscodeFailedRef.current = true;
        setUseHls(false);
        return;
      }
      console.error('[PlayerScreen] Playback error:', err);
      setPlayerState('error');
      playerStateRef.current = 'error';
      setPlaybackError({
        message: err || 'Playback failed',
        streamUrl,
        driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
      });
    });

    driver.onSeekFailure?.((failedTargetMs) => {
      if (!isMounted || driverRef.current !== driver) return;
      if (
        !isHlsRef.current &&
        !hlsTranscodeFailedRef.current &&
        !canBypassHlsForAudioLessVideo(
          technicalInfoRef.current ?? technical,
          forceHtml5 || isBrowserEnv
        )
      ) {
        hlsSeekOffsetMsRef.current = failedTargetMs;
        setUseHls(true);
        setHlsSeekOffsetMs(failedTargetMs);
        setReloadKey((k) => k + 1);
      }
    });

    let driverInitialized = false;
    const initDriver = () => {
      if (!isMounted || !containerRef.current) return;
      driverInitialized = true;
      const currentStartMs =
        hlsSeekOffsetMsRef.current !== null
          ? hlsSeekOffsetMsRef.current
          : sessionResumeMsRef.current > 0
          ? sessionResumeMsRef.current
          : initialResume;
      const initialDriverTime = isHls && streamStartOffsetMs > 0 ? 0 : currentStartMs;
      isDriverInitializedRef.current = true;
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
        // An HLS probe must not be aborted: the server creates (and keeps) an ffmpeg transcode
        // session as soon as it receives the request, and we need its id to release it again.
        const probeRes = await fetch(streamUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal: isHls ? undefined : probeAbortController.signal,
        });

        if (!isMounted) {
          // Superseded (e.g. another seek) while the probe was in flight: free the orphaned session
          if (isHls && probeRes.ok && typeof probeRes.text === 'function') {
            try {
              const orphanId = extractHlsSessionId(await probeRes.text());
              if (orphanId) deleteHlsSession(orphanId);
            } catch {
              // Ignored
            }
          }
          return;
        }

        if (
          isHls &&
          !probeRes.ok &&
          !hlsAutoFallbackDoneRef.current &&
          !directStreamTriedRef.current
        ) {
          const fallbackTech = technicalInfoRef.current ?? technical;
          const canDirectPlayStrict =
            !fallbackTech ||
            isSupportedOnSamsungTv(
              fallbackTech.video_codec,
              fallbackTech.audio_codec,
              fallbackTech.container,
              forceHtml5 || isBrowserEnv
            );
          const isTranscoderCrashStatus =
            probeRes.status === 500 || probeRes.status === 502 || probeRes.status === 504;

          if (
            probeRes.status === 409 ||
            probeRes.status === 404 ||
            probeRes.status === 501 ||
            (isTranscoderCrashStatus && canDirectPlayCodecs()) ||
            ((probeRes.status === 503 || probeRes.status === 429) && canDirectPlayStrict)
          ) {
            // Automatic Direct-Play fallback when HLS fails or is unsupported for this item
            // (e.g. HTTP 500 ffmpeg crash on audio-less videos `#1346`, 409 PLAYBACK_DIRECT_ONLY,
            // or 404/501/503 where Direct Stream `/api/v1/stream/{id}` can play).
            clearTimeout(bufferWatchdog);
            hlsAutoFallbackDoneRef.current = true;
            if (isTranscoderCrashStatus) {
              hlsTranscodeFailedRef.current = true;
            }
            setUseHls(false);
            return;
          }
        }

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

        if (isHls && !probeRes.ok) {
          // Surface the server's reason (e.g. transcoding capacity exceeded, ffmpeg failure,
          // timed out) instead of letting the player spin until the generic buffering timeout.
          clearTimeout(bufferWatchdog);
          let serverErr = probeRes.statusText || 'Transcoding request failed';
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
          if (!isMounted) return;
          const formattedErr = /^transcoding failed/i.test(serverErr.trim())
            ? `${serverErr} (HTTP ${probeRes.status})`
            : `Transcoding failed: ${serverErr} (HTTP ${probeRes.status})`;
          setPlayerState('error');
          playerStateRef.current = 'error';
          setPlaybackError({
            message: formattedErr,
            streamUrl,
            driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
            statusCode: probeRes.status,
          });
          return;
        }

        if (probeRes.ok) {
          if (isHls) {
            hlsProbeSucceeded = true;
          }
          try {
            if (isHls && typeof probeRes.text === 'function') {
              const playlistText = await probeRes.text();
              activeHlsSessionId = extractHlsSessionId(playlistText);
              if (!isMounted && activeHlsSessionId) {
                // Superseded while reading the playlist: the cleanup already ran without the id
                deleteHlsSession(activeHlsSessionId);
                return;
              }
            } else {
              probeRes.body?.cancel?.();
            }
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

    return () => {
      isMounted = false;
      isDriverInitializedRef.current = false;
      probeAbortController.abort();
      clearTimeout(bufferWatchdog);

      const releaseDriver = () => {
        if (activeHlsSessionId) {
          deleteHlsSession(activeHlsSessionId);
        }
        driver.destroy();
      };

      const swapSeamlessly =
        seamlessSwapRef.current && driverInitialized && Boolean(driver.supportsSeamlessSwap);
      seamlessSwapRef.current = false;

      if (swapSeamlessly) {
        // Keep this driver (and its server transcode) alive and playing until the replacement
        // stream reports 'playing', so a seek never shows a black screen. Detach its callbacks
        // so it can no longer influence position / state / errors.
        driver.onTimeUpdate(() => {});
        driver.onStateChange(() => {});
        driver.onError(() => {});
        driver.onSeekFailure?.(() => {});
        // Only one outgoing driver at a time
        retiringDriverRef.current?.release();
        let released = false;
        const handle = {
          release: () => {
            if (released) return;
            released = true;
            clearTimeout(safetyTimer);
            if (retiringDriverRef.current === handle) retiringDriverRef.current = null;
            releaseDriver();
          },
        };
        const safetyTimer = setTimeout(handle.release, 20000);
        retiringDriverRef.current = handle;
      } else {
        retiringDriverRef.current?.release();
        releaseDriver();
      }
    };
  }, [
    itemId,
    serverUrl,
    token,
    initialResume,
    apiClient,
    reloadKey,
    forceHtml5,
    useHls,
    hlsSeekOffsetMs,
    technical,
  ]);

  useEffect(() => {
    if (!itemId || itemId === 'undefined' || itemId === 'null') {
      return;
    }
    let isMounted = true;
    hasActiveSessionRef.current = false;

    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(String(itemId), 10);
    if (!isNaN(numericItemId)) {
      sessionManager.start(numericItemId).then((session) => {
        if (!isMounted) {
          sessionManager.destroy();
          return;
        }
        if (session) {
          hasActiveSessionRef.current = true;
          if (session.duration_seconds > 0 && knownDurationMsRef.current === 0) {
            const sessDurMs = session.duration_seconds * 1000;
            setKnownDurationMs(sessDurMs);
            knownDurationMsRef.current = sessDurMs;
            setDurationMs(sessDurMs);
            durationMsRef.current = sessDurMs;
          }
          if (
            !isLiveStreamRef.current &&
            allowSessionAutoResumeRef.current &&
            session.resume_position_seconds > 0 &&
            hlsSeekOffsetMsRef.current === null &&
            targetSeekMsRef.current === null &&
            seekDebounceTimerRef.current === null
          ) {
            const resumeMs = session.resume_position_seconds * 1000;
            sessionResumeMsRef.current = resumeMs;
            setPositionMs(resumeMs);
            positionMsRef.current = resumeMs;
            if (isHlsRef.current) {
              hlsSeekOffsetMsRef.current = resumeMs;
              setHlsSeekOffsetMs(resumeMs);
              setReloadKey((k) => k + 1);
            } else if (isDriverInitializedRef.current) {
              driverRef.current?.seekTo(resumeMs);
            }
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
      if (finalFlushedItemRef.current === String(itemId)) {
        return;
      }
      // Final scrobble sync before teardown
      if (hasActiveSessionRef.current) {
        sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
        sessionManager.destroy();
      } else {
        reportPlaybackProgress(serverUrl, token, itemId, positionMsRef.current, true);
        sessionManager.destroy();
      }
    };
  }, [itemId, serverUrl, token, initialResume, sessionManager]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      const isBackKey =
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape';

      if (playbackErrorRef.current) {
        if (isBackKey) {
          e.preventDefault();
          if (showDetailsModalRef.current) {
            setShowDetailsModal(false);
          } else {
            const snap = buildAndFlushSnapshot(undefined, true);
            onExit(snap);
          }
        }
        return;
      }

      if (isBackKey) {
        const isModalOpen =
          isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current;
        if (isModalOpen) {
          return;
        }

        if (autoAdvanceCountdownRef.current !== null) {
          e.preventDefault();
          setAutoAdvanceCountdown(null);
          autoAdvanceDismissedRef.current = true;
          return;
        }

        if (seekDebounceTimerRef.current !== null) {
          e.preventDefault();
          clearTimeout(seekDebounceTimerRef.current);
          seekDebounceTimerRef.current = null;
          commitPendingSeekRef.current = null;
          setSeekHud(null);
          setPositionMs(positionMsRef.current);
          return;
        }

        if (hasStartedPlaybackRef.current && showOSDRef.current) {
          e.preventDefault();
          if (osdTimerRef.current) {
            clearTimeout(osdTimerRef.current);
            osdTimerRef.current = null;
          }
          osdDismissedByUserRef.current = true;
          osdFocusedItemRef.current = 'progress';
          setOsdFocusedItem('progress');
          setShowOSD(false);
          return;
        }

        e.preventDefault();
        const snap = buildAndFlushSnapshot(undefined, true);
        onExit(snap);
        return;
      }

      resetOsdTimer();

      if (autoAdvanceCountdownRef.current !== null) {
        if (code === TVKeys.ENTER || e.key === 'Enter') {
          e.preventDefault();
          autoAdvanceDismissedRef.current = true;
          setAutoAdvanceCountdown(null);
          const overridePosMs =
            durationMsRef.current > 0
              ? Math.max(positionMsRef.current, durationMsRef.current)
              : positionMsRef.current;
          buildAndFlushSnapshot(overridePosMs, false);
          onNextRef.current?.();
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
            buildAndFlushSnapshot(undefined, false);
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
            buildAndFlushSnapshot(undefined, false);
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
      } else if (!isModalOpen && (code === TVKeys.DOWN || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (osdFocusedItemRef.current === 'progress') {
          const controls: Array<'prev' | 'next' | 'subtitles'> = [];
          if (onPreviousRef.current && hasPreviousRef.current) controls.push('prev');
          if (onNextRef.current && hasNextRef.current) controls.push('next');
          controls.push('subtitles');
          if (controls.length > 0) {
            const first = controls[0];
            osdFocusedItemRef.current = first;
            setOsdFocusedItem(first);
          }
        }
      } else if (!isModalOpen && (code === TVKeys.UP || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (osdFocusedItemRef.current !== 'progress') {
          osdFocusedItemRef.current = 'progress';
          setOsdFocusedItem('progress');
        }
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        if (
          e.defaultPrevented ||
          isSubtitlePopupOpenRef.current ||
          isSubtitleModalOpenRef.current
        ) {
          return;
        }
        if (osdFocusedItemRef.current !== 'progress') {
          e.preventDefault();
          if (osdFocusedItemRef.current === 'prev' && hasPreviousRef.current && onPreviousRef.current) {
            autoAdvanceDismissedRef.current = true;
            setAutoAdvanceCountdown(null);
            buildAndFlushSnapshot(undefined, false);
            onPreviousRef.current();
          } else if (osdFocusedItemRef.current === 'next' && hasNextRef.current && onNextRef.current) {
            autoAdvanceDismissedRef.current = true;
            setAutoAdvanceCountdown(null);
            buildAndFlushSnapshot(undefined, false);
            onNextRef.current();
          } else if (osdFocusedItemRef.current === 'subtitles') {
            setIsSubtitleModalOpen(true);
          }
          return;
        }
        if (commitPendingSeekRef.current) {
          // A skip is waiting for its idle delay: OK applies it immediately
          e.preventDefault();
          commitPendingSeekRef.current();
          return;
        }
        if (playerStateRef.current === 'playing') {
          driverRef.current?.pause();
        } else {
          driverRef.current?.play();
        }
      } else if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        if (isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current) {
          return;
        }
        if (osdFocusedItemRef.current !== 'progress') {
          e.preventDefault();
          const controls: Array<'prev' | 'next' | 'subtitles'> = [];
          if (onPreviousRef.current && hasPreviousRef.current) controls.push('prev');
          if (onNextRef.current && hasNextRef.current) controls.push('next');
          controls.push('subtitles');
          const idx = controls.indexOf(osdFocusedItemRef.current);
          if (idx > 0) {
            const prev = controls[idx - 1];
            osdFocusedItemRef.current = prev;
            setOsdFocusedItem(prev);
          }
          return;
        }
        consecutiveFfCountRef.current = 0;
        consecutiveRewCountRef.current = 0;
        applySeek(-10000, 'backward', '-10s');
      } else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        if (isSubtitlePopupOpenRef.current || isSubtitleModalOpenRef.current) {
          return;
        }
        if (osdFocusedItemRef.current !== 'progress') {
          e.preventDefault();
          const controls: Array<'prev' | 'next' | 'subtitles'> = [];
          if (onPreviousRef.current && hasPreviousRef.current) controls.push('prev');
          if (onNextRef.current && hasNextRef.current) controls.push('next');
          controls.push('subtitles');
          const idx = controls.indexOf(osdFocusedItemRef.current);
          if (idx >= 0 && idx < controls.length - 1) {
            const next = controls[idx + 1];
            osdFocusedItemRef.current = next;
            setOsdFocusedItem(next);
          }
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, resetOsdTimer, sessionManager, applySeek, buildAndFlushSnapshot]);

  const isSeekingActive = Boolean(seekHud) && !isLiveStream;
  const seekPreviewTimeMs = seekHud ? seekHud.targetMs : positionMs;

  const storyboard = useStoryboard({
    client: apiClient,
    itemId,
    serverUrl: cleanServerUrl,
    token,
    durationMs,
    mediaType: itemMediaType,
    isLive: isLiveStream,
    isSeeking: isSeekingActive,
    previewTimeMs: seekPreviewTimeMs,
  });

  return (
    <div className="relative w-full h-full bg-transparent overflow-hidden select-none">
      <div ref={containerRef} className="relative w-full h-full bg-transparent" />
      <SubtitleOverlay
        text={activeSubtitleText}
        settings={subtitleSettings}
        osdVisible={showOSD && !playbackError}
      />
      {playerState === 'buffering' && !playbackError && (
        <div
          data-testid="player-buffering-spinner"
          role="status"
          aria-label="Buffering"
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
        >
          <div className="bg-[#0d0e15]/80 border border-[#FF6B00]/25 rounded-full p-6 shadow-2xl flex items-center justify-center">
            <svg
              className="w-14 h-14 animate-spin"
              viewBox="0 0 56 56"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="28"
                cy="28"
                r="23"
                stroke="#3B1111"
                strokeWidth="5"
                strokeOpacity="0.7"
              />
              <path
                d="M28 5a23 23 0 0 1 23 23"
                stroke="#FF6B00"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M28 5a23 23 0 0 1 11.5 3.08"
                stroke="#FFB800"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      )}
      <div
        className={`transition-opacity duration-300 ${
          showOSD && !playbackError ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <PlayerOSD
          title={title}
          playerState={playerState}
          positionMs={positionMs}
          durationMs={durationMs}
          visible={showOSD && !playbackError}
          isLive={isLiveStream}
          isSeeking={isSeekingActive}
          seekPreviewMs={seekPreviewTimeMs}
          spriteCrop={storyboard.spriteCrop}
          frameUrl={storyboard.frameUrl}
          subtitles={subtitles}
          selectedSubtitleId={selectedSubtitleId}
          onSelectSubtitle={handleSelectSubtitle}
          onPopupOpenChange={setIsSubtitlePopupOpen}
          onOpenSubtitleModal={() => setIsSubtitleModalOpen(true)}
          onOpenSubtitles={() => setIsSubtitleModalOpen(true)}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onPrevious={onPrevious ? handleManualPrevious : undefined}
          onNext={onNext ? handleManualNext : undefined}
          focusedItem={osdFocusedItem}
        />
      </div>

      <SubtitleModal
        isOpen={isSubtitleModalOpen}
        itemId={itemId}
        apiClient={apiClient}
        subtitles={subtitles}
        selectedSubtitleId={selectedSubtitleId}
        onSelectSubtitle={(id) => {
          handleSelectSubtitle(id);
          setIsSubtitleModalOpen(false);
        }}
        onSubtitleDownloaded={(track) => {
          setSubtitles((prev) => [...prev, track]);
          handleSelectSubtitle(track.id, track);
        }}
        settings={subtitleSettings}
        onChangeSettings={handleChangeSubtitleSettings}
        delayMs={activeSubtitleDelayMs}
        onChangeDelay={handleChangeSubtitleDelay}
        subtitleStatus={{
          loading: subtitleLoading,
          error: subtitleError,
          cueCount: subtitleCues.length,
          currentText: activeSubtitleText,
        }}
        onClose={() => setIsSubtitleModalOpen(false)}
      />

      {seekHud && (
        <div
          data-testid="seek-hud-badge"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#3B1111]/90 backdrop-blur-md border border-[rgba(245,229,229,0.2)] px-6 py-3 rounded-2xl flex items-center space-x-3 text-white text-2xl font-bold shadow-2xl animate-fade-in"
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
          className="fixed bottom-24 right-16 z-50 bg-[#3B1111]/95 backdrop-blur-md border border-[rgba(245,229,229,0.2)] p-6 rounded-2xl shadow-2xl flex flex-col items-center space-y-3 animate-fade-in pointer-events-auto"
        >
          <div className="text-sm uppercase tracking-wider text-[#FFB800] font-bold">
            Up Next
          </div>
          <div className="text-2xl font-bold text-[#F5E5E5]">
            Next episode in {autoAdvanceCountdown}s...
          </div>
          <div className="text-xs text-[#F5E5E5]/60 flex items-center space-x-4 mt-1">
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
            <div className="flex items-start justify-between space-x-8 mb-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4 mb-4">
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
                  <div className="flex items-center space-x-6">
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
                    <div className="flex flex-col space-y-1">
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
                  variant="secondary"
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
                  onClick={() => handleRetry()}
                  className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl flex items-center justify-center cursor-pointer select-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]"
                >
                  <RotateCcw className="w-6 h-6 mr-2" /> Retry Playback
                </button>
              )}

              {useHls ? (
                focusCtx ? (
                  <TVButton
                    id="player-error-direct-btn"
                    groupId="player-error"
                    order={2}
                    variant="primary"
                    autoFocus
                    onClick={() => handleRetry(false)}
                    onEnter={() => handleRetry(false)}
                    className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl bg-[#FF6B00]"
                  >
                    <Layers className="w-6 h-6 mr-2" /> Try Direct Stream
                  </TVButton>
                ) : (
                  <button
                    id="player-error-direct-btn"
                    type="button"
                    autoFocus
                    onClick={() => handleRetry(false)}
                    className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl flex items-center justify-center cursor-pointer select-none bg-[#FF6B00] text-white"
                  >
                    <Layers className="w-6 h-6 mr-2" /> Try Direct Stream
                  </button>
                )
              ) : (
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
                  onClick={handleExit}
                  onEnter={handleExit}
                  className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl"
                >
                  <ArrowLeft className="w-6 h-6 mr-2" /> Exit to Browse
                </TVButton>
              ) : (
                <button
                  id="player-error-exit-btn"
                  type="button"
                  onClick={handleExit}
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
              <div className="flex items-center space-x-3">
                <Info className="w-8 h-8 text-[#FF6B00]" />
                <h3 className="text-2xl font-bold text-[#F5E5E5]">
                  Technical Diagnostic Details
                </h3>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-sm space-y-4 text-[#F5E5E5]/90 pr-2">
              <div className="flex flex-wrap bg-[#3B1111]/50 p-4 rounded-xl border border-[rgba(245,229,229,0.08)]">
                <div className="w-1/2 pr-4 pb-3">
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Item ID</span>
                  <span className="text-[#F5E5E5]">{itemId}</span>
                </div>
                <div className="w-1/2 pb-3">
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Title</span>
                  <span className="text-[#F5E5E5]">{title || 'Unknown'}</span>
                </div>
                <div className="w-1/2 pr-4 pb-3">
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">HTTP Status Code</span>
                  <span className="text-[#F5E5E5]">{playbackError.statusCode || 'N/A'}</span>
                </div>
                <div className="w-1/2 pb-3">
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Player Engine</span>
                  <span className="text-[#F5E5E5]">{playbackError.driverName}</span>
                </div>
                <div className="w-1/2 pr-4">
                  <span className="text-[#FFB800] font-bold block text-xs uppercase tracking-wider mb-1">Timestamp</span>
                  <span className="text-[#F5E5E5]">{diagnosticPayload?.timestamp || new Date().toISOString()}</span>
                </div>
                <div className="w-1/2">
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
