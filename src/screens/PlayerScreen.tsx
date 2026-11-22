import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import { createPlayerDriver, PlayerDriver, PlayerState, VideoLayoutHints } from '../player/driver';
import { ErrorQRCode, DiagnosticPayload } from '../components/player/ErrorQRCode';
import {
  KNOWN_COMPATIBILITY_INFO,
  SAMSUNG_TV_HLS_MAX_HEIGHT,
  checkAudioCompatibility,
  hasMissingAudioStream,
  isAudioMediaType,
  isSupportedOnSamsungTv,
  getPlaybackUrl,
} from '../player/compatibility';
import { reportPlaybackProgress } from '../api/playback';
import { ApiClient } from '../api/client';
import { fetchItemAudioTracks } from '../api/audio';
import { fetchItemSubtitles } from '../api/subtitles';
import { fetchMediaItem, MediaItemDetail } from '../api/items';
import { AudioStreamInfo, SubtitleTrack } from '../types/kadr';
import { PlaybackSessionManager } from '../player/session';
import { TVKeys } from '../navigation/keys';
import { FocusContext } from '../navigation/FocusContext';
import { PlayerOSD, PlayerOsdFocusItem } from '../components/osd/PlayerOSD';
import { AudioPlayerOverlay, type AudioQueueEntry } from '../components/player/AudioPlayerOverlay';
import { AudioTrackModal } from '../components/player/AudioTrackModal';
import { SubtitleModal } from '../components/player/SubtitleModal';
import { SubtitleOverlay } from '../components/player/SubtitleOverlay';
import { findActiveCueText } from '../player/subtitles';
import { useStoryboard } from '../player/storyboard';
import { useSubtitleCues } from '../player/useSubtitleCues';
import {
  type AudioRepeatMode,
  cycleAudioRepeatMode,
  cycleAudiobookSpeed,
  loadAudiobookSpeed,
  loadAudioPreference,
  pickInitialAudioTrackIndex,
  saveAudiobookSpeed,
  saveAudioPreference,
} from '../player/audioPreferences';
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
import { getAuthenticatedImageUrl } from '../utils/imageUrl';
import { PlaybackProgressSnapshot } from '../utils/playbackProgress';
import { setTvScreenSaver } from '../utils/tizenLifecycle';

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
  subtitle?: string;
  posterUrl?: string;
  mediaType?: string;
  durationSeconds?: number;
}

export interface PlayerScreenProps {
  itemId: number | string;
  title?: string;
  subtitle?: string;
  posterUrl?: string;
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
  onSelectQueueIndex?: (index: number) => void;
  onExit: (snapshot?: PlaybackProgressSnapshot) => void;
  onEpisodeProgress?: (snapshot: PlaybackProgressSnapshot) => void;
}

function buildMediaHints(
  tech: MediaItemDetail['technical'] | undefined,
  audioTrackIndex: number,
  audioTracks: AudioStreamInfo[]
): VideoLayoutHints | undefined {
  const hints: VideoLayoutHints = tech
    ? {
        resolution: tech.resolution,
        width: tech.width,
        height: tech.height,
        rotation: tech.rotation,
      }
    : {};
  if (audioTrackIndex > 0) {
    const activeTrack = audioTracks.find((t) => t.audio_index === audioTrackIndex);
    hints.initialAudioIndex = audioTrackIndex;
    hints.initialAudioStreamIndex = activeTrack?.stream_index;
  }
  if (!tech && audioTrackIndex <= 0) {
    return undefined;
  }
  return hints;
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
/** Idle timeout before dedicated music/audiobook playback dims to Ambient Mode. */
const AMBIENT_DIM_DELAY_MS = 60_000;

interface FetchedAudioDetailMeta {
  itemId: number | string;
  title?: string;
  mediaType?: string;
  posterUrl?: string;
  subtitle?: string;
  overview?: string;
  releaseYear?: number;
}

function computeInitialPlaybackMode(
  mediaType: string | undefined,
  tech: MediaItemDetail['technical'] | undefined,
  useHtml5: boolean
): { useHls: boolean; autoFallbackDone: boolean } {
  if (isAudioMediaType(mediaType)) {
    const compat = checkAudioCompatibility(tech?.audio_codec, tech?.container);
    return { useHls: !compat.isSupported, autoFallbackDone: false };
  }
  const bypass = canBypassHlsForAudioLessVideo(tech, useHtml5);
  return { useHls: !bypass, autoFallbackDone: bypass };
}

function resolveDetailSubtitle(detail: MediaItemDetail): string | undefined {
  const record = detail as MediaItemDetail & {
    subtitle?: string;
    series_title?: string;
    director?: string;
    actors?: string[];
    library_name?: string;
  };
  return (
    record.subtitle ||
    record.series_title ||
    record.director ||
    (Array.isArray(record.actors) && record.actors.length > 0 ? record.actors[0] : undefined) ||
    detail.card?.subtitle ||
    record.library_name
  );
}

function isHardwareMediaTransportKey(e: KeyboardEvent): boolean {
  const code = e.keyCode || e.which;
  return (
    code === TVKeys.PLAY ||
    code === TVKeys.PAUSE ||
    code === TVKeys.PLAY_PAUSE ||
    code === TVKeys.STOP ||
    code === TVKeys.MEDIA_TRACK_NEXT ||
    code === TVKeys.MEDIA_TRACK_PREVIOUS ||
    e.key === 'MediaPlay' ||
    e.key === 'MediaPause' ||
    e.key === 'MediaPlayPause' ||
    e.key === 'MediaStop' ||
    e.key === 'MediaTrackNext' ||
    e.key === 'MediaTrackPrevious'
  );
}

export function PlayerScreen({
  itemId,
  title = '',
  subtitle: subtitleProp,
  posterUrl: posterUrlProp,
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
  onSelectQueueIndex,
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
  const positionMsRef = useRef(positionMs);
  positionMsRef.current = positionMs;
  const [durationMs, setDurationMs] = useState(initialKnownDurationMs);
  const [showOSD, setShowOSD] = useState(true);
  const showOSDRef = useRef(showOSD);
  showOSDRef.current = showOSD;

  const hasStartedPlaybackRef = useRef(false);
  const osdDismissedByUserRef = useRef(false);
  const finalFlushedItemRef = useRef<string | null>(null);
  const prevPlayerStateRef = useRef<PlayerState>(playerState);
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.hidden) : false
  );
  const isDocumentHiddenRef = useRef(isDocumentHidden);
  isDocumentHiddenRef.current = isDocumentHidden;
  const wasHiddenRef = useRef(false);
  const pauseAfterRestoreRef = useRef(false);
  const restoreResumeMsRef = useRef<number | null>(null);

  useEffect(() => {
    hasStartedPlaybackRef.current = false;
    osdDismissedByUserRef.current = false;
    finalFlushedItemRef.current = null;
    pauseAfterRestoreRef.current = false;
    restoreResumeMsRef.current = null;
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
  const forceHtml5Ref = useRef(forceHtml5);
  forceHtml5Ref.current = forceHtml5;
  const [reloadKey, setReloadKey] = useState(0);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const showDetailsModalRef = useRef(showDetailsModal);
  showDetailsModalRef.current = showDetailsModal;

  const technicalPropRef = useRef(technical);
  technicalPropRef.current = technical;
  const [technicalInfo, setTechnicalInfo] = useState<MediaItemDetail['technical'] | undefined>(technical);
  const technicalInfoRef = useRef(technicalInfo);
  technicalInfoRef.current = technicalInfo;

  const [audioTracks, setAudioTracks] = useState<AudioStreamInfo[]>(() =>
    Array.isArray(technical?.audio_tracks) ? technical.audio_tracks : []
  );
  const audioTracksRef = useRef<AudioStreamInfo[]>(audioTracks);
  audioTracksRef.current = audioTracks;

  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<number>(() =>
    pickInitialAudioTrackIndex(
      Array.isArray(technical?.audio_tracks) ? technical.audio_tracks : [],
      loadAudioPreference()
    )
  );
  const selectedAudioTrackIndexRef = useRef<number>(selectedAudioTrackIndex);
  selectedAudioTrackIndexRef.current = selectedAudioTrackIndex;

  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const isAudioModalOpenRef = useRef(isAudioModalOpen);
  isAudioModalOpenRef.current = isAudioModalOpen;

  const pendingAudioSyncAfterForegroundRef = useRef(false);

  const currentQueueEntry =
    currentIndex !== undefined && playlist && currentIndex >= 0 && currentIndex < playlist.length
      ? playlist[currentIndex]
      : undefined;
  const currentQueueEntryRef = useRef(currentQueueEntry);
  currentQueueEntryRef.current = currentQueueEntry;
  const mediaTypeRef = useRef(mediaType);
  mediaTypeRef.current = mediaType;
  const isLivePropRef = useRef(isLiveProp);
  isLivePropRef.current = isLiveProp;
  const onSelectQueueIndexRef = useRef(onSelectQueueIndex);
  onSelectQueueIndexRef.current = onSelectQueueIndex;

  const [itemDetailMeta, setItemDetailMeta] = useState<FetchedAudioDetailMeta | null>(null);
  const activeDetailMeta =
    itemDetailMeta && String(itemDetailMeta.itemId) === String(itemId) ? itemDetailMeta : null;
  const effectiveMediaType =
    activeDetailMeta?.mediaType ?? mediaType ?? currentQueueEntry?.mediaType;
  const isAudioMode = isAudioMediaType(effectiveMediaType);
  const isAudioModeRef = useRef(isAudioMode);
  isAudioModeRef.current = isAudioMode;
  const normalizedAudioMediaType: 'music' | 'audiobook' =
    effectiveMediaType?.trim().toLowerCase() === 'audiobook' ? 'audiobook' : 'music';

  const [audiobookSpeed, setAudiobookSpeed] = useState<number>(() => loadAudiobookSpeed());
  const audiobookSpeedRef = useRef(audiobookSpeed);
  audiobookSpeedRef.current = audiobookSpeed;
  const [repeatMode, setRepeatMode] = useState<AudioRepeatMode>('off');
  const effectivePlaybackRate =
    isAudioMode && normalizedAudioMediaType === 'audiobook' ? audiobookSpeed : 1;
  const effectivePlaybackRateRef = useRef(effectivePlaybackRate);
  effectivePlaybackRateRef.current = effectivePlaybackRate;
  const effectiveRepeatMode: AudioRepeatMode =
    isAudioMode && normalizedAudioMediaType === 'music' ? repeatMode : 'off';
  const effectiveRepeatModeRef = useRef(effectiveRepeatMode);
  effectiveRepeatModeRef.current = effectiveRepeatMode;

  const [isAmbientDimmed, setIsAmbientDimmed] = useState(false);
  const isAmbientDimmedRef = useRef(isAmbientDimmed);
  isAmbientDimmedRef.current = isAmbientDimmed;
  const ambientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioEndedHandledItemIdRef = useRef<string | null>(null);

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

  const initialCompat = computeInitialPlaybackMode(
    mediaType ?? currentQueueEntry?.mediaType,
    technical,
    forceHtml5 || isBrowserEnv
  );
  const [useHls, setUseHls] = useState<boolean>(() => initialCompat.useHls);
  const hlsAutoFallbackDoneRef = useRef<boolean>(initialCompat.autoFallbackDone);
  const hlsTranscodeFailedRef = useRef<boolean>(false);
  const hlsUnavailableForItemRef = useRef<boolean>(false);
  const directStreamTriedRef = useRef<boolean>(false);
  const [hlsSeekOffsetMs, setHlsSeekOffsetMs] = useState<number | null>(null);
  const hlsSeekOffsetMsRef = useRef<number | null>(hlsSeekOffsetMs);
  hlsSeekOffsetMsRef.current = hlsSeekOffsetMs;

  const isHlsRef = useRef(useHls);
  const sessionResumeMsRef = useRef<number>(0);
  const isDriverInitializedRef = useRef<boolean>(false);
  const isDriverReadyRef = useRef<boolean>(false);

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

  const triggerHlsAudioReload = useCallback((resumePosMs?: number) => {
    seamlessSwapRef.current = true;
    if (resumePosMs !== undefined) {
      hlsSeekOffsetMsRef.current = resumePosMs;
      setHlsSeekOffsetMs(resumePosMs);
    } else if (positionMsRef.current > 0) {
      hlsSeekOffsetMsRef.current = positionMsRef.current;
      setHlsSeekOffsetMs(positionMsRef.current);
    }
    if (!isHlsRef.current) {
      hlsAutoFallbackDoneRef.current = false;
      hlsTranscodeFailedRef.current = false;
      setUseHls(true);
    }
    setReloadKey((k) => k + 1);
  }, []);

  const resetToDefaultAudioTrack = useCallback(
    (activeTech: MediaItemDetail['technical'] | undefined) => {
      selectedAudioTrackIndexRef.current = 0;
      setSelectedAudioTrackIndex(0);
      driverRef.current?.setMediaHints?.(
        buildMediaHints(activeTech, 0, audioTracksRef.current)
      );
    },
    []
  );

  const isAudioTrackSupportedForDirectPlay = useCallback(
    (
      audioIndex: number,
      activeTech: MediaItemDetail['technical'] | undefined,
      useHtml5Override?: boolean
    ): boolean => {
      const chosen = audioTracksRef.current.find((t) => t.audio_index === audioIndex);
      if (isAudioModeRef.current) {
        return checkAudioCompatibility(
          chosen?.codec ?? activeTech?.audio_codec,
          activeTech?.container
        ).isSupported;
      }
      return isSupportedOnSamsungTv(
        activeTech?.video_codec,
        chosen?.codec,
        activeTech?.container,
        useHtml5Override ?? (forceHtml5Ref.current || isBrowserEnv)
      );
    },
    [isBrowserEnv]
  );

  const normalizeDirectPlayAudioIndex = useCallback(
    (
      isHlsStream: boolean,
      activeTech: MediaItemDetail['technical'] | undefined,
      useHtml5Override?: boolean
    ): number => {
      const currentIdx = selectedAudioTrackIndexRef.current;
      if (
        !isHlsStream &&
        (hlsUnavailableForItemRef.current || hlsTranscodeFailedRef.current) &&
        currentIdx > 0 &&
        !isAudioTrackSupportedForDirectPlay(currentIdx, activeTech, useHtml5Override)
      ) {
        resetToDefaultAudioTrack(activeTech);
        return 0;
      }
      return currentIdx;
    },
    [isAudioTrackSupportedForDirectPlay, resetToDefaultAudioTrack]
  );

  const syncDirectPlayAudioOrFallback = useCallback(
    (
      audioIndex: number,
      chosen: AudioStreamInfo | undefined,
      activeTech: MediaItemDetail['technical'] | undefined
    ) => {
      const trackSupported = isAudioTrackSupportedForDirectPlay(audioIndex, activeTech);
      if (!trackSupported) {
        if (hlsUnavailableForItemRef.current || hlsTranscodeFailedRef.current) {
          resetToDefaultAudioTrack(activeTech);
          return;
        }
        triggerHlsAudioReload(positionMsRef.current);
        return;
      }
      driverRef.current?.setMediaHints?.(
        buildMediaHints(activeTech, audioIndex, audioTracksRef.current)
      );
      if (isDriverReadyRef.current) {
        const switched =
          driverRef.current?.selectAudioTrack?.(audioIndex, chosen?.stream_index) ?? false;
        if (!switched) {
          if (hlsUnavailableForItemRef.current || hlsTranscodeFailedRef.current) {
            resetToDefaultAudioTrack(activeTech);
            return;
          }
          triggerHlsAudioReload(positionMsRef.current);
        }
      }
    },
    [isAudioTrackSupportedForDirectPlay, resetToDefaultAudioTrack, triggerHlsAudioReload]
  );
  const syncDirectPlayAudioOrFallbackRef = useRef(syncDirectPlayAudioOrFallback);
  syncDirectPlayAudioOrFallbackRef.current = syncDirectPlayAudioOrFallback;

  const applyDiscoveredAudioTracks = useCallback(
    (tracks: AudioStreamInfo[]) => {
      const prevAudioIndex = selectedAudioTrackIndexRef.current;
      const initialIdx = pickInitialAudioTrackIndex(tracks, loadAudioPreference());
      audioTracksRef.current = tracks;
      setAudioTracks(tracks);
      selectedAudioTrackIndexRef.current = initialIdx;
      setSelectedAudioTrackIndex(initialIdx);

      if (initialIdx <= 0) {
        return;
      }

      const chosen = tracks.find((t) => t.audio_index === initialIdx);
      const activeTech = technicalInfoRef.current ?? technicalPropRef.current;

      if (isDocumentHiddenRef.current) {
        driverRef.current?.setMediaHints?.(buildMediaHints(activeTech, initialIdx, tracks));
        if (initialIdx !== prevAudioIndex) {
          pendingAudioSyncAfterForegroundRef.current = true;
        }
        return;
      }

      if (isHlsRef.current) {
        if (hlsUnavailableForItemRef.current) {
          return;
        }
        driverRef.current?.setMediaHints?.(buildMediaHints(activeTech, initialIdx, tracks));
        if (initialIdx !== prevAudioIndex) {
          triggerHlsAudioReload();
        }
        return;
      }

      if (initialIdx !== prevAudioIndex) {
        syncDirectPlayAudioOrFallback(initialIdx, chosen, activeTech);
      }
    },
    [syncDirectPlayAudioOrFallback, triggerHlsAudioReload]
  );

  // Fetch media item details (technical codecs + accurate duration)
  useEffect(() => {
    let isMounted = true;
    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(String(itemId), 10);
    if (!isNaN(numericItemId)) {
      fetchMediaItem(apiClient, numericItemId)
        .then((detail) => {
          if (!isMounted) return;
          setItemDetailMeta({
            itemId,
            title: detail.title,
            mediaType: detail.media_type,
            posterUrl: detail.poster_url ?? detail.card?.poster_url,
            subtitle: resolveDetailSubtitle(detail),
            overview: detail.overview,
            releaseYear: detail.release_year ?? detail.card?.release_year,
          });
          const resolvedType =
            detail.media_type ?? mediaTypeRef.current ?? currentQueueEntryRef.current?.mediaType;
          const resolvedIsAudio = isAudioMediaType(resolvedType);

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
            if (
              Array.isArray(detail.technical?.audio_tracks) &&
              detail.technical.audio_tracks.length > 0 &&
              audioTracksRef.current.length === 0
            ) {
              applyDiscoveredAudioTracks(detail.technical.audio_tracks);
            } else {
              driverRef.current?.setMediaHints?.(
                buildMediaHints(
                  mergedTechnical,
                  selectedAudioTrackIndexRef.current,
                  audioTracksRef.current
                )
              );
            }
            const activeTrackCodec =
              audioTracksRef.current.find(
                (t) => t.audio_index === selectedAudioTrackIndexRef.current
              )?.codec ?? detail.technical?.audio_codec;
            if (resolvedIsAudio) {
              const audioCompat = checkAudioCompatibility(
                activeTrackCodec,
                detail.technical?.container
              ).isSupported;
              if (
                !audioCompat &&
                !hlsAutoFallbackDoneRef.current &&
                !hlsUnavailableForItemRef.current
              ) {
                setUseHls(true);
              } else if (
                audioCompat &&
                !hlsAutoFallbackDoneRef.current &&
                !directStreamTriedRef.current
              ) {
                setUseHls(false);
              }
            } else if (
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
              !hlsUnavailableForItemRef.current &&
              !isSupportedOnSamsungTv(
                detail.technical.video_codec,
                activeTrackCodec,
                detail.technical.container,
                forceHtml5 || isBrowserEnv
              )
            ) {
              setUseHls(true);
            }
          } else if (
            resolvedIsAudio &&
            !hlsAutoFallbackDoneRef.current &&
            !directStreamTriedRef.current
          ) {
            setUseHls(false);
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
  }, [itemId, apiClient, forceHtml5, applyDiscoveredAudioTracks]);

  const handleRetry = useCallback((retryWithHls?: boolean) => {
    pauseAfterRestoreRef.current = false;
    restoreResumeMsRef.current = null;
    if (retryWithHls !== undefined) {
      hlsAutoFallbackDoneRef.current = !retryWithHls || directStreamTriedRef.current;
      if (retryWithHls) {
        hlsTranscodeFailedRef.current = false;
        hlsUnavailableForItemRef.current = false;
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
    pauseAfterRestoreRef.current = false;
    restoreResumeMsRef.current = null;
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

  // Pure render-phase state adjustment on itemId change so the first commit/useEffect never
  // sees stale playerState ('ended'), useHls, or technicalInfo from the prior queue track.
  const [prevStreamItemId, setPrevStreamItemId] = useState(itemId);
  if (prevStreamItemId !== itemId) {
    setPrevStreamItemId(itemId);
    const nextCompat = computeInitialPlaybackMode(
      mediaType ?? currentQueueEntry?.mediaType,
      technical,
      forceHtml5 || isBrowserEnv
    );
    setPlayerState('buffering');
    setTechnicalInfo(technical);
    setUseHls(nextCompat.useHls);
    setHlsSeekOffsetMs(null);
    setPlaybackError(null);
    setShowDetailsModal(false);
    setAutoAdvanceCountdown(null);
    setOsdFocusedItem('progress');

    const nextTracks = Array.isArray(technical?.audio_tracks) ? technical.audio_tracks : [];
    const nextAudioIndex = pickInitialAudioTrackIndex(nextTracks, loadAudioPreference());
    setAudioTracks(nextTracks);
    setSelectedAudioTrackIndex(nextAudioIndex);
    setIsAudioModalOpen(false);

    const nextKnownDurMs =
      technical?.duration_seconds !== undefined && technical.duration_seconds > 0
        ? technical.duration_seconds * 1000
        : 0;
    setKnownDurationMs(nextKnownDurMs);
    const nextIsLive = Boolean(
      isLiveProp ||
        mediaType === 'live_channel' ||
        (technical?.duration_seconds !== undefined && technical.duration_seconds <= 0)
    );
    setIsLiveStream(nextIsLive);
  }

  // Reset per-item stream/playback refs synchronously on commit before passive useEffects run
  useLayoutEffect(() => {
    const nextCompat = computeInitialPlaybackMode(
      mediaTypeRef.current ?? currentQueueEntryRef.current?.mediaType,
      technicalPropRef.current,
      forceHtml5Ref.current || isBrowserEnv
    );
    technicalInfoRef.current = technicalPropRef.current;
    isHlsRef.current = nextCompat.useHls;
    hlsAutoFallbackDoneRef.current = nextCompat.autoFallbackDone;
    hlsTranscodeFailedRef.current = false;
    hlsUnavailableForItemRef.current = false;
    directStreamTriedRef.current = false;
    audioEndedHandledItemIdRef.current = null;
    hlsSeekOffsetMsRef.current = null;
    sessionResumeMsRef.current = 0;
    restoreResumeMsRef.current = null;
    pauseAfterRestoreRef.current = false;
    autoAdvanceDismissedRef.current = false;
    osdFocusedItemRef.current = 'progress';

    const nextTracks = Array.isArray(technicalPropRef.current?.audio_tracks)
      ? technicalPropRef.current.audio_tracks
      : [];
    audioTracksRef.current = nextTracks;
    selectedAudioTrackIndexRef.current = pickInitialAudioTrackIndex(
      nextTracks,
      loadAudioPreference()
    );
    isAudioModalOpenRef.current = false;
    pendingAudioSyncAfterForegroundRef.current = false;

    const nextKnownDurMs =
      technicalPropRef.current?.duration_seconds !== undefined &&
      technicalPropRef.current.duration_seconds > 0
        ? technicalPropRef.current.duration_seconds * 1000
        : 0;
    knownDurationMsRef.current = nextKnownDurMs;
    isLiveStreamRef.current = Boolean(
      isLivePropRef.current ||
        mediaTypeRef.current === 'live_channel' ||
        (technicalPropRef.current?.duration_seconds !== undefined &&
          technicalPropRef.current.duration_seconds <= 0)
    );
  }, [itemId, isBrowserEnv]);

  useEffect(() => {
    const activeTech = technicalInfo ?? technical;
    driverRef.current?.setMediaHints?.(
      buildMediaHints(activeTech, selectedAudioTrackIndexRef.current, audioTracksRef.current)
    );
  }, [technicalInfo, technical]);

  useEffect(() => {
    autoAdvanceDismissedRef.current = false;
    setAutoAdvanceCountdown(null);
    setShowDetailsModal(false);
    setTechnicalInfo(technical);
    technicalInfoRef.current = technical;
    targetSeekMsRef.current = null;
    seekDirectionRef.current = null;
    seekLockUntilMsRef.current = 0;
    setSeekHud(null);
    setOsdFocusedItem('progress');
    osdFocusedItemRef.current = 'progress';
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

  const handleSelectQueueIndex = useCallback(
    (index: number) => {
      if (!onSelectQueueIndexRef.current) return;
      buildAndFlushSnapshot(undefined, false);
      onSelectQueueIndexRef.current(index);
    },
    [buildAndFlushSnapshot]
  );

  const handleTogglePlayPause = useCallback(() => {
    if (playerStateRef.current === 'playing') {
      driverRef.current?.pause();
    } else {
      driverRef.current?.play();
    }
  }, []);

  const handleRestartTrack = useCallback(() => {
    setPositionMs(0);
    positionMsRef.current = 0;
    driverRef.current?.seekTo(0);
  }, []);

  const handleCycleSpeed = useCallback(() => {
    const next = cycleAudiobookSpeed(audiobookSpeedRef.current);
    audiobookSpeedRef.current = next;
    setAudiobookSpeed(next);
    saveAudiobookSpeed(next);
    driverRef.current?.setPlaybackRate?.(next);
  }, []);

  const handleCycleRepeat = useCallback(() => {
    setRepeatMode((prev) => cycleAudioRepeatMode(prev));
  }, []);

  const handleExit = useCallback(() => {
    const snap = buildAndFlushSnapshot(undefined, true);
    onExit(snap);
  }, [buildAndFlushSnapshot, onExit]);

  useEffect(() => {
    driverRef.current?.setPlaybackRate?.(effectivePlaybackRate);
  }, [effectivePlaybackRate]);

  // Handle auto-advance trigger near media end (video 5s countdown vs audio 0s immediate transition)
  useEffect(() => {
    const itemKey = String(itemId);
    if (playerState !== 'ended' && audioEndedHandledItemIdRef.current === itemKey) {
      audioEndedHandledItemIdRef.current = null;
    }

    if (isAudioMode) {
      if (autoAdvanceCountdown !== null) {
        setAutoAdvanceCountdown(null);
      }
      if (playerState !== 'ended' || audioEndedHandledItemIdRef.current === itemKey) {
        return;
      }
      audioEndedHandledItemIdRef.current = itemKey;

      const restartFromBeginning = () => {
        setPositionMs(0);
        positionMsRef.current = 0;
        driverRef.current?.seekTo(0);
        driverRef.current?.play();
      };
      const flushCompletedTrack = () => {
        const overridePosMs =
          durationMsRef.current > 0
            ? Math.max(positionMsRef.current, durationMsRef.current)
            : positionMsRef.current;
        buildAndFlushSnapshot(overridePosMs, false);
      };

      if (effectiveRepeatMode === 'one') {
        restartFromBeginning();
        return;
      }

      if (hasNext && onNext) {
        flushCompletedTrack();
        onNext();
        return;
      }

      if (effectiveRepeatMode === 'all') {
        if ((playlist?.length ?? 0) > 1 && onSelectQueueIndexRef.current) {
          flushCompletedTrack();
          onSelectQueueIndexRef.current(0);
        } else {
          restartFromBeginning();
        }
      }
      return;
    }

    if (autoAdvanceDismissedRef.current) return;
    if (!hasNext || !onNext) return;
    if (autoAdvanceCountdown !== null) return;

    const isPaused = playerState === 'paused' || playerState === 'error';
    const isNearEnd = !isPaused && durationMs > 0 && positionMs >= durationMs - 1500;
    const isEnded = playerState === 'ended';

    if (isEnded || isNearEnd) {
      setAutoAdvanceCountdown(5);
    }
  }, [
    itemId,
    isAudioMode,
    effectiveRepeatMode,
    playlist?.length,
    playerState,
    positionMs,
    durationMs,
    hasNext,
    onNext,
    autoAdvanceCountdown,
    buildAndFlushSnapshot,
  ]);

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

  // Fetch embedded audio tracks on mount / item change
  useEffect(() => {
    let isMounted = true;
    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(String(itemId), 10);
    if (!isNaN(numericItemId)) {
      Promise.resolve(fetchItemAudioTracks(apiClient, numericItemId))
        .then((tracks) => {
          if (!isMounted || !Array.isArray(tracks) || tracks.length === 0) return;
          applyDiscoveredAudioTracks(tracks);
        })
        .catch(() => {
          // Audio track discovery optional/fallback
        });
    }
    return () => {
      isMounted = false;
    };
  }, [itemId, apiClient, applyDiscoveredAudioTracks]);

  const handleSelectAudioTrack = useCallback(
    (audioIndex: number) => {
      setIsAudioModalOpen(false);
      const chosen = audioTracksRef.current.find((t) => t.audio_index === audioIndex);
      const lang = chosen?.language?.trim();
      if (lang && lang.toLowerCase() !== 'und') {
        saveAudioPreference({
          mode: 'language',
          language: lang,
          preferCommentary: Boolean(chosen?.is_commentary),
        });
      }
      if (audioIndex === selectedAudioTrackIndexRef.current) {
        return;
      }
      selectedAudioTrackIndexRef.current = audioIndex;
      setSelectedAudioTrackIndex(audioIndex);

      if (!isHlsRef.current) {
        const activeTech = technicalInfoRef.current ?? technicalPropRef.current;
        const supported = isAudioModeRef.current
          ? checkAudioCompatibility(
              chosen?.codec ?? activeTech?.audio_codec,
              activeTech?.container
            ).isSupported
          : isSupportedOnSamsungTv(
              activeTech?.video_codec,
              chosen?.codec,
              activeTech?.container,
              forceHtml5Ref.current || isBrowserEnv
            );
        if (
          supported &&
          (driverRef.current?.selectAudioTrack?.(audioIndex, chosen?.stream_index) ?? false)
        ) {
          return;
        }
      }

      triggerHlsAudioReload(positionMsRef.current);
    },
    [isBrowserEnv, triggerHlsAudioReload]
  );

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
    if (
      playerStateRef.current === 'playing' &&
      !isSubtitlePopupOpenRef.current &&
      !isSubtitleModalOpenRef.current &&
      !isAudioModalOpenRef.current
    ) {
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

  const handleAudioSeekRelative = useCallback(
    (deltaMs: number) => {
      const secs = Math.round(Math.abs(deltaMs) / 1000);
      const direction = deltaMs >= 0 ? 'forward' : 'backward';
      const label = `${deltaMs >= 0 ? '+' : '-'}${secs}s`;
      applySeek(deltaMs, direction, label);
    },
    [applySeek]
  );

  const isAudioModalTrapOpen =
    isSubtitlePopupOpen || isSubtitleModalOpen || isAudioModalOpen || showDetailsModal;
  const canAmbientDim =
    isAudioMode &&
    playerState === 'playing' &&
    !playbackError &&
    !isAudioModalTrapOpen &&
    !isDocumentHidden;
  const canAmbientDimRef = useRef(canAmbientDim);
  canAmbientDimRef.current = canAmbientDim;

  const clearAmbientTimer = useCallback(() => {
    if (ambientTimerRef.current) {
      clearTimeout(ambientTimerRef.current);
      ambientTimerRef.current = null;
    }
  }, []);

  const scheduleAmbientTimer = useCallback(() => {
    clearAmbientTimer();
    if (!canAmbientDimRef.current) return;
    ambientTimerRef.current = setTimeout(() => {
      ambientTimerRef.current = null;
      if (canAmbientDimRef.current) {
        isAmbientDimmedRef.current = true;
        setIsAmbientDimmed(true);
      }
    }, AMBIENT_DIM_DELAY_MS);
  }, [clearAmbientTimer]);

  const wakeAndResetAmbient = useCallback(() => {
    if (isAmbientDimmedRef.current) {
      isAmbientDimmedRef.current = false;
      setIsAmbientDimmed(false);
    }
    scheduleAmbientTimer();
  }, [scheduleAmbientTimer]);

  useEffect(() => {
    if (!canAmbientDim) {
      clearAmbientTimer();
      if (isAmbientDimmedRef.current) {
        isAmbientDimmedRef.current = false;
        setIsAmbientDimmed(false);
      }
      return;
    }
    scheduleAmbientTimer();
    return () => clearAmbientTimer();
  }, [canAmbientDim, clearAmbientTimer, scheduleAmbientTimer]);

  // Register ambient wake/reset listener in layout capture phase so it runs before AudioPlayerOverlay's D-pad listener
  useLayoutEffect(() => {
    const handleAmbientKeyDown = (e: KeyboardEvent) => {
      if (!isAudioModeRef.current) return;
      if (isAmbientDimmedRef.current) {
        wakeAndResetAmbient();
        if (isHardwareMediaTransportKey(e)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }
      scheduleAmbientTimer();
    };

    const handlePointerActivity = () => {
      if (!isAudioModeRef.current) return;
      wakeAndResetAmbient();
    };

    window.addEventListener('keydown', handleAmbientKeyDown, true);
    window.addEventListener('mousemove', handlePointerActivity);
    window.addEventListener('mousedown', handlePointerActivity);
    window.addEventListener('touchstart', handlePointerActivity);

    return () => {
      window.removeEventListener('keydown', handleAmbientKeyDown, true);
      window.removeEventListener('mousemove', handlePointerActivity);
      window.removeEventListener('mousedown', handlePointerActivity);
      window.removeEventListener('touchstart', handlePointerActivity);
    };
  }, [scheduleAmbientTimer, wakeAndResetAmbient]);

  useEffect(() => {
    return () => {
      clearAmbientTimer();
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

    if (isSubtitlePopupOpen || isSubtitleModalOpen || isAudioModalOpen) {
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
  }, [playerState, isSubtitlePopupOpen, isSubtitleModalOpen, isAudioModalOpen]);

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
    const shouldPreventSleep =
      !isDocumentHidden &&
      !playbackError &&
      (playerState === 'playing' || playerState === 'buffering');
    setTvScreenSaver(shouldPreventSleep);
  }, [isDocumentHidden, playbackError, playerState]);

  useEffect(() => {
    return () => {
      setTvScreenSaver(false);
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
      hlsSeekOffsetMs ??
      restoreResumeMsRef.current ??
      (sessionResumeMsRef.current > 0 ? sessionResumeMsRef.current : initialResume);

    const playbackResult = getPlaybackUrl({
      serverUrl: cleanServerUrl,
      itemId,
      token,
      unlockTokens: apiClient.getUnlockTokens ? apiClient.getUnlockTokens() : [],
      forceHls: useHls,
      forceDirect: !useHls,
      forceHtml5: forceHtml5 || isBrowserEnv || isAudioMode,
      videoCodec: technicalInfoRef.current?.video_codec || technical?.video_codec,
      audioCodec: technicalInfoRef.current?.audio_codec || technical?.audio_codec,
      container: technicalInfoRef.current?.container || technical?.container,
      startSeconds: activeStartMs > 0 ? activeStartMs / 1000 : 0,
      maxHeight: isAudioMode ? undefined : SAMSUNG_TV_HLS_MAX_HEIGHT,
      audioTrackIndex: selectedAudioTrackIndexRef.current,
      isAudioOnly: isAudioMode,
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
      if (isAudioModeRef.current) {
        return checkAudioCompatibility(fallbackTech.audio_codec, fallbackTech.container).isSupported;
      }
      const useHtml5Mode = forceHtml5 || isBrowserEnv;
      return isSupportedOnSamsungTv(
        fallbackTech.video_codec,
        fallbackTech.audio_codec,
        useHtml5Mode ? fallbackTech.container : undefined,
        useHtml5Mode
      );
    };

    const driver = createPlayerDriver(forceHtml5 || isAudioMode);
    driverRef.current = driver;
    if (isAudioMode) {
      driver.setPlaybackRate?.(effectivePlaybackRateRef.current);
    }
    isDriverInitializedRef.current = false;
    isDriverReadyRef.current = false;

    const markDriverReady = () => {
      if (isDriverReadyRef.current) return;
      isDriverReadyRef.current = true;
      if (isAudioModeRef.current) {
        driver.setPlaybackRate?.(effectivePlaybackRateRef.current);
      }
      if (!isHls && selectedAudioTrackIndexRef.current > 0) {
        if (isDocumentHiddenRef.current) {
          pendingAudioSyncAfterForegroundRef.current = true;
          return;
        }
        const activeIdx = selectedAudioTrackIndexRef.current;
        const chosen = audioTracksRef.current.find((t) => t.audio_index === activeIdx);
        syncDirectPlayAudioOrFallbackRef.current(
          activeIdx,
          chosen,
          technicalInfoRef.current ?? technicalPropRef.current
        );
      }
    };

    const activeTech = technicalInfoRef.current ?? technical;
    const initialMediaHintsAudioIdx = normalizeDirectPlayAudioIndex(
      isHls,
      activeTech,
      forceHtml5 || isBrowserEnv
    );
    driver.setMediaHints?.(
      buildMediaHints(activeTech, initialMediaHintsAudioIdx, audioTracksRef.current)
    );

    const bufferWatchdog = setTimeout(() => {
      if (
        playerStateRef.current !== 'playing' &&
        !isDocumentHiddenRef.current &&
        !(playerStateRef.current === 'paused' && !pauseAfterRestoreRef.current)
      ) {
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
      if (state === 'playing' && pauseAfterRestoreRef.current) {
        pauseAfterRestoreRef.current = false;
        restoreResumeMsRef.current = null;
        hasStartedPlaybackRef.current = true;
        hasPlayedCurrentStream = true;
        clearTimeout(bufferWatchdog);
        driver.pause();
        playerStateRef.current = 'paused';
        setPlayerState('paused');
        osdDismissedByUserRef.current = false;
        setShowOSD(true);
        markDriverReady();
        return;
      }
      setPlayerState(state);
      playerStateRef.current = state;
      if (state === 'playing' || state === 'paused' || state === 'ended') {
        hasStartedPlaybackRef.current = true;
      }
      if (state === 'playing') {
        restoreResumeMsRef.current = null;
        hasPlayedCurrentStream = true;
        clearTimeout(bufferWatchdog);
      }
      if (state === 'playing' || state === 'paused') {
        markDriverReady();
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
      pauseAfterRestoreRef.current = false;
      restoreResumeMsRef.current = null;
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
      if (!isMounted || !containerRef.current || isDocumentHiddenRef.current) return;
      driverInitialized = true;
      const currentStartMs =
        hlsSeekOffsetMsRef.current ??
        restoreResumeMsRef.current ??
        (sessionResumeMsRef.current > 0 ? sessionResumeMsRef.current : initialResume);
      const initialDriverTime = isHls && streamStartOffsetMs > 0 ? 0 : currentStartMs;
      isDriverInitializedRef.current = true;
      const activeTechForInit = technicalInfoRef.current ?? technical;
      const activeAudioIndex = normalizeDirectPlayAudioIndex(
        isHls,
        activeTechForInit,
        forceHtml5 || isBrowserEnv
      );
      const initHints = buildMediaHints(
        activeTechForInit,
        activeAudioIndex,
        audioTracksRef.current
      );
      const initPromise =
        initHints && activeAudioIndex > 0
          ? driver.init(containerRef.current, streamUrl, initialDriverTime, initHints)
          : driver.init(containerRef.current, streamUrl, initialDriverTime);
      const handleInitError = (err: any) => {
        clearTimeout(bufferWatchdog);
        console.error('[PlayerScreen] Driver init failed:', err);
        setPlayerState('error');
        playerStateRef.current = 'error';
        setPlaybackError({
          message: err?.message || String(err),
          streamUrl,
          driverName: driver.name || (forceHtml5 ? 'HTML5 Video' : 'Tizen AVPlay'),
        });
      };
      if (driver.name === 'HTML5 Video') {
        initPromise
          .then(() => {
            if (!isMounted || driverRef.current !== driver) return;
            markDriverReady();
          })
          .catch(handleInitError);
      } else {
        initPromise.catch(handleInitError);
      }
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
            (isAudioModeRef.current
              ? checkAudioCompatibility(fallbackTech.audio_codec, fallbackTech.container).isSupported
              : isSupportedOnSamsungTv(
                  fallbackTech.video_codec,
                  fallbackTech.audio_codec,
                  fallbackTech.container,
                  forceHtml5 || isBrowserEnv
                ));
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
            if (
              probeRes.status === 409 ||
              probeRes.status === 503 ||
              isTranscoderCrashStatus
            ) {
              hlsUnavailableForItemRef.current = true;
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
      isDriverReadyRef.current = false;
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
    isAudioMode,
    useHls,
    hlsSeekOffsetMs,
    technical,
    normalizeDirectPlayAudioIndex,
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
            restoreResumeMsRef.current === null &&
            targetSeekMsRef.current === null &&
            seekDebounceTimerRef.current === null
          ) {
            const resumeMs = session.resume_position_seconds * 1000;
            sessionResumeMsRef.current = resumeMs;
            setPositionMs(resumeMs);
            positionMsRef.current = resumeMs;
            if (!isDocumentHiddenRef.current) {
              if (isHlsRef.current) {
                hlsSeekOffsetMsRef.current = resumeMs;
                setHlsSeekOffsetMs(resumeMs);
                setReloadKey((k) => k + 1);
              } else if (isDriverInitializedRef.current) {
                driverRef.current?.seekTo(resumeMs);
              }
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
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsDocumentHidden(true);
        isDocumentHiddenRef.current = true;
        seamlessSwapRef.current = false;
        if (retiringDriverRef.current) {
          retiringDriverRef.current.release();
          retiringDriverRef.current = null;
        }
        if (playbackErrorRef.current) {
          return;
        }
        wasHiddenRef.current = true;

        if (seekDebounceTimerRef.current) {
          clearTimeout(seekDebounceTimerRef.current);
          seekDebounceTimerRef.current = null;
          commitPendingSeekRef.current = null;
        }
        targetSeekMsRef.current = null;
        seekDirectionRef.current = null;

        if ((hasStartedPlaybackRef.current || positionMsRef.current > 0) && !isLiveStreamRef.current) {
          if (hasActiveSessionRef.current) {
            sessionManager
              .updateProgress(Math.floor(positionMsRef.current / 1000))
              .catch(() => {});
          } else {
            Promise.resolve(
              reportPlaybackProgress(serverUrl, token, itemId, positionMsRef.current, true)
            ).catch(() => {});
          }
        }

        driverRef.current?.suspend?.();
        playerStateRef.current = 'paused';
        setPlayerState('paused');
        osdDismissedByUserRef.current = false;
        setShowOSD(true);
      } else {
        setIsDocumentHidden(false);
        isDocumentHiddenRef.current = false;
        if (playbackErrorRef.current || !wasHiddenRef.current) {
          wasHiddenRef.current = false;
          return;
        }
        wasHiddenRef.current = false;

        const autoPlay = isLiveStreamRef.current;
        const targetPos = positionMsRef.current;
        const pendingAudioSync = pendingAudioSyncAfterForegroundRef.current;
        pendingAudioSyncAfterForegroundRef.current = false;

        const switchToHlsOnForeground = () => {
          pauseAfterRestoreRef.current = !autoPlay;
          if (autoPlay) {
            playerStateRef.current = 'buffering';
            setPlayerState('buffering');
          } else if (hasStartedPlaybackRef.current || targetPos > 0) {
            hlsSeekOffsetMsRef.current = targetPos;
            setHlsSeekOffsetMs(targetPos);
          }
          hlsAutoFallbackDoneRef.current = false;
          hlsTranscodeFailedRef.current = false;
          setUseHls(true);
          setReloadKey((k) => k + 1);
        };

        const activeAudioIdx = selectedAudioTrackIndexRef.current;
        const activeAudioTrack = audioTracksRef.current.find(
          (t) => t.audio_index === activeAudioIdx
        );
        const activeTech = technicalInfoRef.current ?? technicalPropRef.current;
        const isHlsUnavailable = hlsUnavailableForItemRef.current || hlsTranscodeFailedRef.current;
        const activeAudioSupported = isAudioTrackSupportedForDirectPlay(
          activeAudioIdx,
          activeTech
        );
        const needsHlsForAudio =
          !isHlsRef.current &&
          activeAudioIdx > 0 &&
          !activeAudioSupported &&
          !isHlsUnavailable;
        const needsHlsAudioReload =
          needsHlsForAudio ||
          (pendingAudioSync && isHlsRef.current && activeAudioIdx > 0 && !isHlsUnavailable);

        if (needsHlsAudioReload) {
          switchToHlsOnForeground();
        } else {
          if (!isHlsRef.current && activeAudioIdx > 0 && !activeAudioSupported && isHlsUnavailable) {
            resetToDefaultAudioTrack(activeTech);
          }

          const handled = driverRef.current?.restore?.(targetPos, autoPlay) ?? false;

          if (
            handled &&
            pendingAudioSync &&
            !isHlsRef.current &&
            selectedAudioTrackIndexRef.current > 0
          ) {
            const switched =
              driverRef.current?.selectAudioTrack?.(
                selectedAudioTrackIndexRef.current,
                activeAudioTrack?.stream_index
              ) ?? false;
            if (!switched) {
              if (isHlsUnavailable) {
                resetToDefaultAudioTrack(activeTech);
              } else {
                switchToHlsOnForeground();
              }
            }
          } else if (!handled) {
            pauseAfterRestoreRef.current = !autoPlay;
            if (autoPlay) {
              playerStateRef.current = 'buffering';
              setPlayerState('buffering');
            } else if (hasStartedPlaybackRef.current || targetPos > 0) {
              if (isHlsRef.current) {
                hlsSeekOffsetMsRef.current = targetPos;
                setHlsSeekOffsetMs(targetPos);
              } else {
                hlsSeekOffsetMsRef.current = null;
                setHlsSeekOffsetMs(null);
                restoreResumeMsRef.current = targetPos;
              }
            }
            setReloadKey((k) => k + 1);
          }
        }

        osdDismissedByUserRef.current = false;
        setShowOSD(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    itemId,
    serverUrl,
    token,
    sessionManager,
    isBrowserEnv,
    isAudioTrackSupportedForDirectPlay,
    resetToDefaultAudioTrack,
  ]);

  useEffect(() => {
    const getOsdControls = (): PlayerOsdFocusItem[] => {
      const controls: PlayerOsdFocusItem[] = [];
      if (onPreviousRef.current && hasPreviousRef.current) controls.push('prev');
      if (onNextRef.current && hasNextRef.current) controls.push('next');
      if (audioTracksRef.current.length >= 2) controls.push('audio');
      controls.push('subtitles');
      return controls;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      const isBackKey =
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace';

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

      const isModalOpen =
        isSubtitlePopupOpenRef.current ||
        isSubtitleModalOpenRef.current ||
        isAudioModalOpenRef.current;

      if (isBackKey) {
        if (isModalOpen) {
          return;
        }

        if (isAudioModeRef.current) {
          e.preventDefault();
          const snap = buildAndFlushSnapshot(undefined, true);
          onExit(snap);
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

      if (!isModalOpen && !e.defaultPrevented && autoAdvanceCountdownRef.current !== null) {
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
          if (
            isAudioModeRef.current &&
            effectiveRepeatModeRef.current === 'all' &&
            onSelectQueueIndexRef.current
          ) {
            e.preventDefault();
            buildAndFlushSnapshot(undefined, false);
            onSelectQueueIndexRef.current(0);
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

      if (code === TVKeys.PLAY || e.key === 'MediaPlay') {
        if (isAudioModeRef.current) {
          driverRef.current?.play();
        } else {
          handleTogglePlayPause();
        }
      } else if (code === TVKeys.PAUSE || e.key === 'MediaPause') {
        if (isAudioModeRef.current) {
          driverRef.current?.pause();
        } else {
          handleTogglePlayPause();
        }
      } else if (code === TVKeys.STOP || e.key === 'MediaStop') {
        if (isAudioModeRef.current) {
          driverRef.current?.pause();
        }
      } else if (
        code === TVKeys.PLAY_PAUSE ||
        e.key === 'MediaPlayPause' ||
        e.key === ' ' ||
        e.key === 'k'
      ) {
        handleTogglePlayPause();
      } else if (!isModalOpen && (code === TVKeys.DOWN || e.key === 'ArrowDown')) {
        if (isAudioModeRef.current) return;
        e.preventDefault();
        if (osdFocusedItemRef.current === 'progress') {
          const controls = getOsdControls();
          if (controls.length > 0) {
            const first = controls[0];
            osdFocusedItemRef.current = first;
            setOsdFocusedItem(first);
          }
        }
      } else if (!isModalOpen && (code === TVKeys.UP || e.key === 'ArrowUp')) {
        if (isAudioModeRef.current) return;
        e.preventDefault();
        if (osdFocusedItemRef.current !== 'progress') {
          osdFocusedItemRef.current = 'progress';
          setOsdFocusedItem('progress');
        }
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        if (isAudioModeRef.current || e.defaultPrevented || isModalOpen) {
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
          } else if (osdFocusedItemRef.current === 'audio') {
            setIsAudioModalOpen(true);
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
        if (isAudioModeRef.current || isModalOpen) {
          return;
        }
        if (osdFocusedItemRef.current !== 'progress') {
          e.preventDefault();
          const controls = getOsdControls();
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
        if (isAudioModeRef.current || isModalOpen) {
          return;
        }
        if (osdFocusedItemRef.current !== 'progress') {
          e.preventDefault();
          const controls = getOsdControls();
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
        if (isModalOpen) {
          return;
        }
        const count = consecutiveFfCountRef.current;
        const stepSecs = count === 0 ? 30 : count === 1 ? 60 : 120;
        const stepMs = stepSecs * 1000;
        consecutiveFfCountRef.current += 1;
        consecutiveRewCountRef.current = 0;
        applySeek(stepMs, 'forward', `+${stepSecs}s`);
      } else if (code === TVKeys.REWIND) {
        if (isModalOpen) {
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
  }, [onExit, resetOsdTimer, sessionManager, applySeek, buildAndFlushSnapshot, handleTogglePlayPause]);

  const isSeekingActive = Boolean(seekHud) && !isLiveStream;
  const seekPreviewTimeMs = seekHud ? seekHud.targetMs : positionMs;

  const storyboard = useStoryboard({
    client: apiClient,
    itemId,
    serverUrl: cleanServerUrl,
    token,
    durationMs,
    mediaType: effectiveMediaType,
    isLive: isLiveStream,
    isSeeking: isSeekingActive,
    previewTimeMs: seekPreviewTimeMs,
  });

  const unlockTokens = apiClient.getUnlockTokens ? apiClient.getUnlockTokens() : [];
  const unlockTokensKey = unlockTokens.join(',');
  const rawPosterUrl = activeDetailMeta?.posterUrl ?? posterUrlProp ?? currentQueueEntry?.posterUrl;
  const authenticatedPosterUrl = getAuthenticatedImageUrl(
    cleanServerUrl,
    rawPosterUrl,
    token,
    unlockTokens
  );
  const resolvedAudioTitle = title || activeDetailMeta?.title || currentQueueEntry?.title || '';
  const resolvedAudioSubtitle =
    activeDetailMeta?.subtitle ?? subtitleProp ?? currentQueueEntry?.subtitle;
  const resolvedAudioOverview = activeDetailMeta?.overview;
  const resolvedAudioReleaseYear = activeDetailMeta?.releaseYear;
  const activeAudioCodecLabel = (
    audioTracks.find((t) => t.audio_index === selectedAudioTrackIndex)?.codec ||
    technicalInfo?.audio_codec ||
    technical?.audio_codec ||
    technicalInfo?.container ||
    technical?.container ||
    ''
  )
    .trim()
    .toUpperCase();
  const streamModeLabel = useHls
    ? 'HLS • AAC'
    : activeAudioCodecLabel
    ? `DIRECT • ${activeAudioCodecLabel}`
    : 'DIRECT';

  const audioQueueEntries: AudioQueueEntry[] | undefined = useMemo(() => {
    if (!playlist || playlist.length === 0) return undefined;
    const tokens = unlockTokensKey ? unlockTokensKey.split(',') : [];
    return playlist.map((entry) => ({
      id: entry.id,
      title: entry.title,
      subtitle: entry.subtitle,
      posterUrl: entry.posterUrl
        ? getAuthenticatedImageUrl(cleanServerUrl, entry.posterUrl, token, tokens)
        : undefined,
      durationSeconds: entry.durationSeconds,
    }));
  }, [playlist, cleanServerUrl, token, unlockTokensKey]);

  return (
    <div className="relative w-full h-full bg-transparent overflow-hidden select-none">
      <div ref={containerRef} className="relative w-full h-full bg-transparent" />
      {!isAudioMode && (
        <SubtitleOverlay
          text={activeSubtitleText}
          settings={subtitleSettings}
          osdVisible={showOSD && !playbackError}
        />
      )}
      {!isAudioMode && playerState === 'buffering' && !playbackError && (
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
      {!isAudioMode && (
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
            audioTracks={audioTracks}
            selectedAudioTrackIndex={selectedAudioTrackIndex}
            onOpenAudioModal={() => setIsAudioModalOpen(true)}
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
      )}
      {isAudioMode && !playbackError && (
        <AudioPlayerOverlay
          mediaType={normalizedAudioMediaType}
          title={resolvedAudioTitle}
          subtitle={resolvedAudioSubtitle}
          overview={resolvedAudioOverview}
          releaseYear={resolvedAudioReleaseYear}
          posterUrl={authenticatedPosterUrl}
          streamModeLabel={streamModeLabel}
          playerState={playerState}
          positionMs={positionMs}
          durationMs={durationMs}
          playbackRate={effectivePlaybackRate}
          repeatMode={effectiveRepeatMode}
          isAmbientDimmed={isAmbientDimmed}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          queue={audioQueueEntries}
          currentIndex={currentIndex}
          audioTracks={audioTracks}
          onOpenAudioModal={() => setIsAudioModalOpen(true)}
          onTogglePlayPause={handleTogglePlayPause}
          onSeekRelative={handleAudioSeekRelative}
          onRestartTrack={handleRestartTrack}
          onPrevious={hasPrevious && onPrevious ? handleManualPrevious : undefined}
          onNext={hasNext && onNext ? handleManualNext : undefined}
          onSelectQueueIndex={onSelectQueueIndex ? handleSelectQueueIndex : undefined}
          onCycleSpeed={normalizedAudioMediaType === 'audiobook' ? handleCycleSpeed : undefined}
          onCycleRepeat={normalizedAudioMediaType === 'music' ? handleCycleRepeat : undefined}
          onExit={handleExit}
        />
      )}

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

      {isAudioModalOpen && (
        <AudioTrackModal
          isOpen={isAudioModalOpen}
          audioTracks={audioTracks}
          selectedAudioTrackIndex={selectedAudioTrackIndex}
          onSelectAudioTrack={handleSelectAudioTrack}
          onClose={() => setIsAudioModalOpen(false)}
        />
      )}

      {!isAudioMode && seekHud && (
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

      {!isAudioMode && autoAdvanceCountdown !== null && (
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
