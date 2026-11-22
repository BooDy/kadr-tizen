import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  BookOpen,
  Gauge,
  ListMusic,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import type { AudioRepeatMode } from '../../player/audioPreferences';
import type { PlayerState } from '../../player/driver';
import type { AudioStreamInfo } from '../../types/kadr';
import { FocusContext, scrollElementIntoViewIfNeeded } from '../../navigation/FocusContext';
import { isTextInputElement } from '../../navigation/useFocusable';
import { TVKeys } from '../../navigation/keys';

export interface AudioQueueEntry {
  id: number | string;
  title: string;
  subtitle?: string;
  posterUrl?: string;
  durationSeconds?: number;
}

export interface AudioPlayerOverlayProps {
  mediaType: 'music' | 'audiobook';
  title: string;
  subtitle?: string;
  overview?: string;
  releaseYear?: number;
  posterUrl?: string;
  streamModeLabel: string;
  playerState: PlayerState;
  positionMs: number;
  durationMs: number;
  playbackRate: number;
  repeatMode: AudioRepeatMode;
  isAmbientDimmed: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  queue?: AudioQueueEntry[];
  currentIndex?: number;
  audioTracks?: AudioStreamInfo[];
  onOpenAudioModal?: () => void;
  onTogglePlayPause: () => void;
  onSeekRelative: (deltaMs: number) => void;
  onRestartTrack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSelectQueueIndex?: (index: number) => void;
  onCycleSpeed?: () => void;
  onCycleRepeat?: () => void;
  onExit: () => void;
}

const DEFAULT_FOCUS_ID = 'audio-btn-play-pause';
const SCRUBBER_ID = 'audio-progress-bar';

type DpadDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Formats seconds as `H:MM:SS` when >= 3600 seconds or `M:SS` when < 3600 seconds.
 */
export function formatAudioDuration(seconds: number): string {
  const safeSeconds =
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? Math.floor(seconds)
      : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatPlaybackRate(rate: number): string {
  const safeRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1;
  return `${Number(safeRate.toFixed(2))}x`;
}

function formatRepeatLabel(repeatMode: AudioRepeatMode): string {
  switch (repeatMode) {
    case 'all':
      return 'Repeat: All';
    case 'one':
      return 'Repeat: One';
    case 'off':
    default:
      return 'Repeat: Off';
  }
}

function formatPlayerStateLabel(state: PlayerState): string {
  switch (state) {
    case 'playing':
      return 'Playing';
    case 'paused':
      return 'Paused';
    case 'buffering':
      return 'Buffering...';
    case 'ended':
      return 'Ended';
    case 'error':
      return 'Error';
    case 'idle':
    default:
      return 'Ready';
  }
}

function isAnyModalOpen(activeTrap?: string | null): boolean {
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

function focusElementById(targetId: string, scrollQueueRow: boolean): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(targetId);
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  if (scrollQueueRow) {
    scrollElementIntoViewIfNeeded(el);
  }
}

function resolveDpadDirection(e: KeyboardEvent): DpadDirection | null {
  const code = e.keyCode || e.which;
  if (code === TVKeys.LEFT || e.key === 'ArrowLeft') return 'left';
  if (code === TVKeys.RIGHT || e.key === 'ArrowRight') return 'right';
  if (code === TVKeys.UP || e.key === 'ArrowUp') return 'up';
  if (code === TVKeys.DOWN || e.key === 'ArrowDown') return 'down';
  return null;
}

function resolveDpadOutcome(params: {
  currentId: string;
  direction: DpadDirection;
  mediaType: 'music' | 'audiobook';
  enabledTransportIds: string[];
  hasQueue: boolean;
  queueLength: number;
  currentIndex?: number;
}): { type: 'focus'; targetId: string } | { type: 'seek'; deltaMs: number } | null {
  const {
    currentId,
    direction,
    mediaType,
    enabledTransportIds,
    hasQueue,
    queueLength,
    currentIndex,
  } = params;

  if (currentId === SCRUBBER_ID) {
    if (direction === 'left') {
      return { type: 'seek', deltaMs: mediaType === 'audiobook' ? -15000 : -10000 };
    }
    if (direction === 'right') {
      return { type: 'seek', deltaMs: mediaType === 'audiobook' ? 30000 : 10000 };
    }
    if (direction === 'down') {
      return { type: 'focus', targetId: DEFAULT_FOCUS_ID };
    }
    return null;
  }

  if (currentId.startsWith('audio-queue-item-')) {
    const idx = Number(currentId.slice('audio-queue-item-'.length));
    if (direction === 'up' && idx > 0) {
      return { type: 'focus', targetId: `audio-queue-item-${idx - 1}` };
    }
    if (direction === 'down' && idx < queueLength - 1) {
      return { type: 'focus', targetId: `audio-queue-item-${idx + 1}` };
    }
    if (direction === 'left') {
      const rightmostId = enabledTransportIds[enabledTransportIds.length - 1];
      if (rightmostId) {
        return { type: 'focus', targetId: rightmostId };
      }
    }
    return null;
  }

  const transportIdx = enabledTransportIds.indexOf(currentId);
  if (transportIdx === -1) {
    return { type: 'focus', targetId: DEFAULT_FOCUS_ID };
  }

  if (direction === 'up') {
    return { type: 'focus', targetId: SCRUBBER_ID };
  }
  if (direction === 'left' && transportIdx > 0) {
    return { type: 'focus', targetId: enabledTransportIds[transportIdx - 1] };
  }
  if (direction === 'right') {
    if (transportIdx < enabledTransportIds.length - 1) {
      return { type: 'focus', targetId: enabledTransportIds[transportIdx + 1] };
    }
    if (hasQueue) {
      const targetIdx =
        currentIndex !== undefined && currentIndex >= 0 && currentIndex < queueLength
          ? currentIndex
          : 0;
      return { type: 'focus', targetId: `audio-queue-item-${targetIdx}` };
    }
  }
  return null;
}

interface TransportButtonConfig {
  id: string;
  label: string;
  icon: ReactNode;
  isPrimary?: boolean;
  isActiveTint?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface TransportButtonProps {
  config: TransportButtonConfig;
  isFocused: boolean;
  hasTrailingMargin: boolean;
}

function TransportButton({
  config,
  isFocused,
  hasTrailingMargin,
}: TransportButtonProps): ReactElement {
  const { id, label, icon, isPrimary = false, isActiveTint = false, disabled = false, onClick } =
    config;

  const stateClasses = disabled
    ? 'bg-[#260B0B]/60 text-[#F5E5E5]/35 border border-[rgba(245,229,229,0.05)] opacity-40 cursor-not-allowed'
    : isFocused
    ? isPrimary
      ? 'bg-[#FF6B00] text-white border border-[#FFB800] tv-focus-ring cursor-pointer'
      : 'bg-[#4A1616] text-white border border-[#FFB800] tv-focus-ring cursor-pointer'
    : isPrimary
    ? 'bg-[#D43F15] text-white border border-[#FF6B00]/50 hover:bg-[#FF6B00] cursor-pointer'
    : isActiveTint
    ? 'bg-[#FF6B00]/20 text-[#FFB800] border border-[#FF6B00]/45 hover:bg-[#4A1616] cursor-pointer'
    : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.1)] hover:bg-[#4A1616] cursor-pointer';

  return (
    <button
      id={id}
      data-testid={id}
      data-focused={isFocused ? 'true' : 'false'}
      type="button"
      tabIndex={-1}
      disabled={disabled}
      aria-label={label}
      onClick={!disabled ? onClick : undefined}
      className={`px-4 py-3 rounded-2xl font-bold text-base flex items-center justify-center shrink-0 transition-transform duration-75 outline-none select-none ${
        hasTrailingMargin ? 'mr-2.5' : ''
      } ${stateClasses}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

interface AudioHeroSectionProps {
  mediaType: 'music' | 'audiobook';
  title: string;
  subtitle?: string;
  overview?: string;
  releaseYear?: number;
  posterUrl?: string;
  streamModeLabel: string;
  playerState: PlayerState;
}

function AudioHeroSection({
  mediaType,
  title,
  subtitle,
  overview,
  releaseYear,
  posterUrl,
  streamModeLabel,
  playerState,
}: AudioHeroSectionProps): ReactElement {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [posterUrl]);

  const showCoverImage = Boolean(posterUrl && !imgError);

  return (
    <div className="flex items-start min-h-0">
      <div className="w-80 h-80 shrink-0 rounded-3xl overflow-hidden bg-[#1D0808] border border-[rgba(245,229,229,0.12)] shadow-2xl flex items-center justify-center mr-10">
        {showCoverImage ? (
          <img
            data-testid="audio-cover-image"
            src={posterUrl}
            alt={title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            data-testid="audio-cover-fallback"
            className="w-full h-full flex items-center justify-center bg-[#180707]"
          >
            {mediaType === 'audiobook' ? (
              <BookOpen
                data-testid="audio-cover-icon-audiobook"
                className="w-24 h-24 text-[#FF6B00]/80"
              />
            ) : (
              <Music
                data-testid="audio-cover-icon-music"
                className="w-24 h-24 text-[#FF6B00]/80"
              />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 pt-2">
        <div className="flex flex-wrap items-center mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-widest bg-[#FF6B00]/20 text-[#FFB800] border border-[#FF6B00]/40 mr-3 mb-2">
            {mediaType === 'audiobook' ? 'AUDIOBOOK' : 'MUSIC'}
          </span>
          {streamModeLabel && (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 text-[#F5E5E5]/85 border border-white/10 mr-3 mb-2">
              {streamModeLabel}
            </span>
          )}
          {releaseYear !== undefined && releaseYear > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#3B1111] text-[#F5E5E5]/80 border border-[rgba(245,229,229,0.1)] mr-3 mb-2">
              {releaseYear}
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#220A0A] text-[#F5E5E5]/70 border border-[rgba(245,229,229,0.08)] mb-2">
            {formatPlayerStateLabel(playerState)}
          </span>
        </div>

        <h1
          dir="auto"
          data-testid="audio-title"
          className="text-4xl font-black text-white leading-tight line-clamp-2 mb-3"
        >
          {title}
        </h1>

        {subtitle && (
          <p
            dir="auto"
            data-testid="audio-subtitle"
            className="text-2xl font-semibold text-[#F5E5E5]/80 truncate mb-4"
          >
            {subtitle}
          </p>
        )}

        {overview && (
          <p
            dir="auto"
            data-testid="audio-overview"
            className="text-base text-[#F5E5E5]/65 leading-relaxed line-clamp-4"
          >
            {overview}
          </p>
        )}
      </div>
    </div>
  );
}

interface AudioScrubberProps {
  elapsedSeconds: number;
  remainingSeconds: number;
  totalSeconds: number;
  progressPercent: number;
  isFocused: boolean;
  onFocusScrubber: () => void;
}

function AudioScrubber({
  elapsedSeconds,
  remainingSeconds,
  totalSeconds,
  progressPercent,
  isFocused,
  onFocusScrubber,
}: AudioScrubberProps): ReactElement {
  return (
    <div
      id={SCRUBBER_ID}
      data-testid={SCRUBBER_ID}
      data-focused={isFocused ? 'true' : 'false'}
      tabIndex={-1}
      role="slider"
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={totalSeconds}
      aria-valuenow={elapsedSeconds}
      onClick={onFocusScrubber}
      className={`w-full rounded-2xl p-4 transition-all duration-150 outline-none ${
        isFocused
          ? 'bg-[#3B1111]/70 ring-2 ring-[#FFB800] tv-focus-ring'
          : 'bg-[#1B0707]/60 border border-[rgba(245,229,229,0.08)]'
      }`}
    >
      <div className="relative w-full h-3.5 bg-[#3B1111]/85 rounded-full mb-3">
        <div
          className="h-full bg-[#FF6B00] rounded-full transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className={`absolute top-1/2 bg-[#FFB800] rounded-full shadow-md transition-all duration-150 ${
            isFocused
              ? 'w-6 h-6 -ml-3 ring-4 ring-[#FFB800]/40'
              : 'w-5 h-5 -ml-2.5'
          }`}
          style={{
            left: `${progressPercent}%`,
            transform: isFocused ? 'translateY(-50%) scale(1.1)' : 'translateY(-50%)',
          }}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-lg text-[#F5E5E5]/85">
        <span data-testid="audio-time-elapsed">{formatAudioDuration(elapsedSeconds)}</span>
        <div className="flex items-center">
          <span data-testid="audio-time-remaining" className="text-[#F5E5E5]/60 mr-4">
            -{formatAudioDuration(remainingSeconds)}
          </span>
          <span data-testid="audio-time-total">{formatAudioDuration(totalSeconds)}</span>
        </div>
      </div>
    </div>
  );
}

interface AudioQueueColumnProps {
  queue: AudioQueueEntry[];
  currentIndex?: number;
  isPlaying: boolean;
  focusedControlId: string;
  onSelectEntry: (index: number) => void;
}

function AudioQueueColumn({
  queue,
  currentIndex,
  isPlaying,
  focusedControlId,
  onSelectEntry,
}: AudioQueueColumnProps): ReactElement {
  const safeCurrentIdx =
    currentIndex !== undefined && currentIndex >= 0 && currentIndex < queue.length
      ? currentIndex
      : 0;

  return (
    <div
      data-testid="audio-queue-column"
      className="flex-1 min-h-0 bg-[#140505]/95 border border-[rgba(245,229,229,0.1)] rounded-3xl p-6 flex flex-col"
    >
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-[rgba(245,229,229,0.08)]">
        <div className="flex items-center">
          <ListMusic className="w-6 h-6 text-[#FF6B00] mr-3" />
          <h2 className="text-xl font-extrabold text-white tracking-wide">Up Next</h2>
        </div>
        <span className="text-sm font-bold text-[#FFB800]">
          Track {safeCurrentIdx + 1} of {queue.length}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {queue.map((entry, idx) => {
          const rowId = `audio-queue-item-${idx}`;
          const isCurrent = currentIndex !== undefined && idx === currentIndex;
          const isFocused = focusedControlId === rowId;

          return (
            <button
              key={`${entry.id}-${idx}`}
              id={rowId}
              data-testid={rowId}
              data-active={isCurrent ? 'true' : 'false'}
              data-focused={isFocused ? 'true' : 'false'}
              type="button"
              tabIndex={-1}
              onClick={() => onSelectEntry(idx)}
              className={`w-full px-4 py-3.5 rounded-2xl border flex items-center justify-between text-left transition-all duration-100 outline-none select-none cursor-pointer ${
                idx < queue.length - 1 ? 'mb-2.5' : ''
              } ${
                isFocused
                  ? 'bg-[#4A1616] border-[#FFB800] text-white tv-focus-ring'
                  : isCurrent
                  ? 'bg-[#FF6B00]/15 border-[#FF6B00]/55 text-white'
                  : 'bg-[#1D0808]/90 border-[rgba(245,229,229,0.08)] text-[#F5E5E5]/85 hover:bg-[#2E0E0E]'
              }`}
            >
              <div className="flex items-center min-w-0 flex-1 mr-3">
                <span
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 mr-3 ${
                    isCurrent ? 'bg-[#FF6B00] text-white' : 'bg-white/10 text-[#F5E5E5]/70'
                  }`}
                >
                  {isCurrent ? <Volume2 className="w-4 h-4" /> : idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div dir="auto" className="font-bold text-base truncate">
                    {entry.title}
                  </div>
                  {entry.subtitle && (
                    <div dir="auto" className="text-xs text-[#F5E5E5]/60 truncate mt-0.5">
                      {entry.subtitle}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center shrink-0">
                {isCurrent && (
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF6B00]/25 text-[#FFB800] border border-[#FF6B00]/40 mr-2">
                    {isPlaying ? 'Playing' : 'Current'}
                  </span>
                )}
                {typeof entry.durationSeconds === 'number' &&
                  Number.isFinite(entry.durationSeconds) &&
                  entry.durationSeconds > 0 && (
                    <span className="font-mono text-sm text-[#F5E5E5]/65">
                      {formatAudioDuration(entry.durationSeconds)}
                    </span>
                  )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AudioDetailsCardProps {
  mediaType: 'music' | 'audiobook';
  subtitle?: string;
  streamModeLabel: string;
  playbackRate: number;
  repeatMode: AudioRepeatMode;
  totalSeconds: number;
}

function AudioDetailsCard({
  mediaType,
  subtitle,
  streamModeLabel,
  playbackRate,
  repeatMode,
  totalSeconds,
}: AudioDetailsCardProps): ReactElement {
  return (
    <div
      data-testid="audio-details-card"
      className="flex-1 bg-[#140505]/95 border border-[rgba(245,229,229,0.1)] rounded-3xl p-7 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center pb-4 mb-5 border-b border-[rgba(245,229,229,0.08)]">
          {mediaType === 'audiobook' ? (
            <BookOpen className="w-6 h-6 text-[#FF6B00] mr-3" />
          ) : (
            <Music className="w-6 h-6 text-[#FF6B00] mr-3" />
          )}
          <h2 className="text-xl font-extrabold text-white tracking-wide">
            {mediaType === 'audiobook' ? 'Audiobook Details' : 'Track Details'}
          </h2>
        </div>

        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-[#F5E5E5]/50 font-bold mb-1">
            {mediaType === 'audiobook' ? 'Author / Series' : 'Artist / Album'}
          </div>
          <div dir="auto" className="text-lg font-semibold text-[#F5E5E5]">
            {subtitle || 'Unknown'}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-[#F5E5E5]/50 font-bold mb-1">
            Stream Mode
          </div>
          <div className="text-base font-semibold text-[#FFB800]">
            {streamModeLabel || 'AUDIO'}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-[#F5E5E5]/50 font-bold mb-1">
            {mediaType === 'audiobook' ? 'Playback Speed' : 'Repeat Mode'}
          </div>
          <div className="text-base font-semibold text-[#F5E5E5]">
            {mediaType === 'audiobook'
              ? formatPlaybackRate(playbackRate)
              : formatRepeatLabel(repeatMode)}
          </div>
        </div>

        {totalSeconds > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-widest text-[#F5E5E5]/50 font-bold mb-1">
              Total Duration
            </div>
            <div className="font-mono text-base font-semibold text-[#F5E5E5]">
              {formatAudioDuration(totalSeconds)}
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-[rgba(245,229,229,0.08)] text-sm text-[#F5E5E5]/55">
        Press <strong className="text-[#F5E5E5]/85">Up</strong> to scrub timeline •{' '}
        <strong className="text-[#F5E5E5]/85">OK</strong> to toggle playback
      </div>
    </div>
  );
}

/**
 * Full-screen split-stage overlay for dedicated music and audiobook playback.
 * Uses physical margins (mr-*, ml-*, mb-*, mt-*) instead of CSS flex spacing utilities for Tizen 5.5 / Chromium 69 compatibility.
 */
export function AudioPlayerOverlay({
  mediaType,
  title,
  subtitle,
  overview,
  releaseYear,
  posterUrl,
  streamModeLabel,
  playerState,
  positionMs,
  durationMs,
  playbackRate,
  repeatMode,
  isAmbientDimmed,
  hasPrevious,
  hasNext,
  queue,
  currentIndex,
  audioTracks,
  onOpenAudioModal,
  onTogglePlayPause,
  onSeekRelative,
  onRestartTrack,
  onPrevious,
  onNext,
  onSelectQueueIndex,
  onCycleSpeed,
  onCycleRepeat,
  onExit,
}: AudioPlayerOverlayProps): ReactElement {
  const focusCtx = useContext(FocusContext);
  const focusCtxRef = useRef(focusCtx);
  focusCtxRef.current = focusCtx;

  const [focusedControlId, setFocusedControlId] = useState<string>(DEFAULT_FOCUS_ID);
  const focusedControlIdRef = useRef<string>(DEFAULT_FOCUS_ID);

  const queueList = useMemo(() => queue ?? [], [queue]);
  const hasQueue = queueList.length > 1;
  const hasMultipleAudioTracks = Boolean(audioTracks && audioTracks.length >= 2 && onOpenAudioModal);
  const isNextEnabled = hasNext || repeatMode === 'all';

  const enabledTransportIds = useMemo(() => {
    const ids: string[] = [
      'audio-btn-exit',
      'audio-btn-prev',
      'audio-btn-rewind',
      DEFAULT_FOCUS_ID,
      'audio-btn-forward',
    ];
    if (isNextEnabled) {
      ids.push('audio-btn-next');
    }
    ids.push(mediaType === 'audiobook' ? 'audio-btn-speed' : 'audio-btn-repeat');
    if (hasMultipleAudioTracks) {
      ids.push('audio-btn-tracks');
    }
    return ids;
  }, [isNextEnabled, mediaType, hasMultipleAudioTracks]);

  const setOverlayFocus = useCallback((nextId: string) => {
    focusedControlIdRef.current = nextId;
    setFocusedControlId(nextId);
    focusCtxRef.current?.setFocusedId(nextId);
    focusElementById(nextId, nextId.startsWith('audio-queue-item-'));
  }, []);

  const handlePrevAction = useCallback(() => {
    if (positionMs > 5000 || !hasPrevious || !onPrevious) {
      onRestartTrack();
    } else {
      onPrevious();
    }
  }, [positionMs, hasPrevious, onPrevious, onRestartTrack]);

  const handleNextAction = useCallback(() => {
    if (hasNext && onNext) {
      onNext();
      return;
    }
    if (repeatMode === 'all') {
      if (hasQueue && onSelectQueueIndex) {
        onSelectQueueIndex(0);
      } else if (onNext) {
        onNext();
      } else {
        onRestartTrack();
      }
    }
  }, [hasNext, onNext, repeatMode, hasQueue, onSelectQueueIndex, onRestartTrack]);

  const latestRef = useRef({
    mediaType,
    isAmbientDimmed,
    hasQueue,
    queueLength: queueList.length,
    currentIndex,
    enabledTransportIds,
    onTogglePlayPause,
    onSeekRelative,
    onExit,
    onOpenAudioModal,
    onCycleSpeed,
    onCycleRepeat,
    onSelectQueueIndex,
    handlePrevAction,
    handleNextAction,
  });
  latestRef.current = {
    mediaType,
    isAmbientDimmed,
    hasQueue,
    queueLength: queueList.length,
    currentIndex,
    enabledTransportIds,
    onTogglePlayPause,
    onSeekRelative,
    onExit,
    onOpenAudioModal,
    onCycleSpeed,
    onCycleRepeat,
    onSelectQueueIndex,
    handlePrevAction,
    handleNextAction,
  };

  // Focus Play/Pause on initial mount unless a modal trap is currently active
  useEffect(() => {
    const currentTrap =
      focusCtxRef.current?.getActiveTrap?.() ?? focusCtxRef.current?.activeTrap ?? null;
    if (!isAnyModalOpen(currentTrap)) {
      setOverlayFocus(DEFAULT_FOCUS_ID);
    }
  }, [setOverlayFocus]);

  // Restore overlay focus when a FocusContext modal trap (e.g. AudioTrackModal) closes
  const activeTrap = focusCtx?.activeTrap ?? null;
  const prevActiveTrapRef = useRef<string | null>(activeTrap);
  useEffect(() => {
    const prevTrap = prevActiveTrapRef.current;
    prevActiveTrapRef.current = activeTrap;
    if (prevTrap !== null && activeTrap === null) {
      setOverlayFocus(focusedControlIdRef.current);
    }
  }, [activeTrap, setOverlayFocus]);

  // Keep focusedControlId valid if queue shrinks or a focused button becomes unavailable
  useEffect(() => {
    const cur = focusedControlIdRef.current;
    if (cur === SCRUBBER_ID) return;
    if (cur.startsWith('audio-queue-item-')) {
      if (!hasQueue) {
        setOverlayFocus(DEFAULT_FOCUS_ID);
        return;
      }
      const idx = Number(cur.slice('audio-queue-item-'.length));
      if (!Number.isInteger(idx) || idx < 0 || idx >= queueList.length) {
        setOverlayFocus(`audio-queue-item-${Math.max(0, queueList.length - 1)}`);
      }
      return;
    }
    if (!enabledTransportIds.includes(cur)) {
      setOverlayFocus(DEFAULT_FOCUS_ID);
    }
  }, [hasQueue, queueList.length, enabledTransportIds, setOverlayFocus]);

  const activateControl = useCallback((controlId: string) => {
    const state = latestRef.current;
    const actions: Record<string, (() => void) | undefined> = {
      [SCRUBBER_ID]: state.onTogglePlayPause,
      [DEFAULT_FOCUS_ID]: state.onTogglePlayPause,
      'audio-btn-exit': state.onExit,
      'audio-btn-prev': state.handlePrevAction,
      'audio-btn-rewind': () => state.onSeekRelative(-15000),
      'audio-btn-forward': () =>
        state.onSeekRelative(state.mediaType === 'audiobook' ? 30000 : 15000),
      'audio-btn-next': state.handleNextAction,
      'audio-btn-speed': state.onCycleSpeed,
      'audio-btn-repeat': state.onCycleRepeat,
      'audio-btn-tracks': state.onOpenAudioModal,
    };

    if (actions[controlId]) {
      actions[controlId]?.();
      return;
    }

    if (controlId.startsWith('audio-queue-item-')) {
      const idx = Number(controlId.slice('audio-queue-item-'.length));
      if (Number.isInteger(idx) && idx >= 0 && idx < state.queueLength) {
        state.onSelectQueueIndex?.(idx);
      }
    }
  }, []);

  // Capture-phase deterministic D-pad routing so behavior is identical with and without FocusProvider
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = latestRef.current;
      if (state.isAmbientDimmed || e.defaultPrevented) return;

      const currentTrap =
        focusCtxRef.current?.getActiveTrap?.() ?? focusCtxRef.current?.activeTrap ?? null;
      if (isAnyModalOpen(currentTrap)) return;
      if (typeof document !== 'undefined' && isTextInputElement(document.activeElement)) return;

      const code = e.keyCode || e.which;
      const isBackKey =
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace';

      if (isBackKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        state.onExit();
        return;
      }

      if (code === TVKeys.ENTER || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        activateControl(focusedControlIdRef.current);
        return;
      }

      const direction = resolveDpadDirection(e);
      if (!direction) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const outcome = resolveDpadOutcome({
        currentId: focusedControlIdRef.current,
        direction,
        mediaType: state.mediaType,
        enabledTransportIds: state.enabledTransportIds,
        hasQueue: state.hasQueue,
        queueLength: state.queueLength,
        currentIndex: state.currentIndex,
      });

      if (!outcome) return;
      if (outcome.type === 'seek') {
        state.onSeekRelative(outcome.deltaMs);
      } else {
        setOverlayFocus(outcome.targetId);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [setOverlayFocus, activateControl]);

  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const safePositionMs = Number.isFinite(positionMs) && positionMs > 0 ? positionMs : 0;
  const totalSeconds = Math.floor(safeDurationMs / 1000);
  const elapsedSeconds = Math.floor(safePositionMs / 1000);
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const progressPercent =
    safeDurationMs > 0 ? Math.min(100, Math.max(0, (safePositionMs / safeDurationMs) * 100)) : 0;
  const isPlaying = playerState === 'playing';

  const transportButtons: TransportButtonConfig[] = [
    {
      id: 'audio-btn-exit',
      label: 'Back',
      icon: <ArrowLeft className="w-5 h-5" />,
      onClick: () => {
        setOverlayFocus('audio-btn-exit');
        onExit();
      },
    },
    {
      id: 'audio-btn-prev',
      label: 'Prev',
      icon: <SkipBack className="w-5 h-5" />,
      onClick: () => {
        setOverlayFocus('audio-btn-prev');
        handlePrevAction();
      },
    },
    {
      id: 'audio-btn-rewind',
      label: '-15s',
      icon: <RotateCcw className="w-5 h-5" />,
      onClick: () => {
        setOverlayFocus('audio-btn-rewind');
        onSeekRelative(-15000);
      },
    },
    {
      id: DEFAULT_FOCUS_ID,
      label: isPlaying ? 'Pause' : 'Play',
      icon: isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />,
      isPrimary: true,
      onClick: () => {
        setOverlayFocus(DEFAULT_FOCUS_ID);
        onTogglePlayPause();
      },
    },
    {
      id: 'audio-btn-forward',
      label: mediaType === 'audiobook' ? '+30s' : '+15s',
      icon: <RotateCw className="w-5 h-5" />,
      onClick: () => {
        setOverlayFocus('audio-btn-forward');
        onSeekRelative(mediaType === 'audiobook' ? 30000 : 15000);
      },
    },
    {
      id: 'audio-btn-next',
      label: 'Next',
      icon: <SkipForward className="w-5 h-5" />,
      disabled: !isNextEnabled,
      onClick: () => {
        setOverlayFocus('audio-btn-next');
        handleNextAction();
      },
    },
    mediaType === 'audiobook'
      ? {
          id: 'audio-btn-speed',
          label: formatPlaybackRate(playbackRate),
          icon: <Gauge className="w-5 h-5" />,
          isActiveTint: Math.abs(playbackRate - 1) > 0.001,
          onClick: () => {
            setOverlayFocus('audio-btn-speed');
            onCycleSpeed?.();
          },
        }
      : {
          id: 'audio-btn-repeat',
          label: formatRepeatLabel(repeatMode),
          icon:
            repeatMode === 'one' ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            ),
          isActiveTint: repeatMode !== 'off',
          onClick: () => {
            setOverlayFocus('audio-btn-repeat');
            onCycleRepeat?.();
          },
        },
  ];

  if (hasMultipleAudioTracks) {
    transportButtons.push({
      id: 'audio-btn-tracks',
      label: 'Tracks',
      icon: <Volume2 className="w-5 h-5" />,
      onClick: () => {
        setOverlayFocus('audio-btn-tracks');
        onOpenAudioModal?.();
      },
    });
  }

  return (
    <div
      data-testid="audio-player-overlay"
      className="fixed inset-0 z-20 bg-[#080202] text-[#F5E5E5] flex flex-col justify-center p-14 select-none overflow-hidden"
    >
      <div
        data-testid="audio-player-stage"
        data-ambient-dimmed={isAmbientDimmed ? 'true' : 'false'}
        style={{ opacity: isAmbientDimmed ? 0.25 : 1, transition: 'opacity 400ms ease' }}
        className="w-full flex-1 min-h-0 max-h-[880px] flex items-stretch"
      >
        {/* Left Column: Cover Art, Metadata, Scrubber & Transport */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <AudioHeroSection
            mediaType={mediaType}
            title={title}
            subtitle={subtitle}
            overview={overview}
            releaseYear={releaseYear}
            posterUrl={posterUrl}
            streamModeLabel={streamModeLabel}
            playerState={playerState}
          />

          <div className="mt-8">
            <AudioScrubber
              elapsedSeconds={elapsedSeconds}
              remainingSeconds={remainingSeconds}
              totalSeconds={totalSeconds}
              progressPercent={progressPercent}
              isFocused={focusedControlId === SCRUBBER_ID}
              onFocusScrubber={() => setOverlayFocus(SCRUBBER_ID)}
            />

            <div data-testid="audio-transport-controls" className="flex items-center mt-6">
              {transportButtons.map((btn, idx) => (
                <TransportButton
                  key={btn.id}
                  config={btn}
                  isFocused={focusedControlId === btn.id}
                  hasTrailingMargin={idx < transportButtons.length - 1}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Up-Next Queue OR Single-Item Details Card */}
        <div className="w-[520px] shrink-0 ml-12 flex flex-col min-h-0">
          {hasQueue ? (
            <AudioQueueColumn
              queue={queueList}
              currentIndex={currentIndex}
              isPlaying={isPlaying}
              focusedControlId={focusedControlId}
              onSelectEntry={(idx) => {
                setOverlayFocus(`audio-queue-item-${idx}`);
                onSelectQueueIndex?.(idx);
              }}
            />
          ) : (
            <AudioDetailsCard
              mediaType={mediaType}
              subtitle={subtitle}
              streamModeLabel={streamModeLabel}
              playbackRate={playbackRate}
              repeatMode={repeatMode}
              totalSeconds={totalSeconds}
            />
          )}
        </div>
      </div>

      {isAmbientDimmed && (
        <div
          data-testid="audio-ambient-badge"
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 px-5 py-2.5 rounded-full bg-[#180707]/95 border border-[rgba(245,229,229,0.16)] text-sm font-semibold text-[#F5E5E5]/80 tracking-wide pointer-events-none shadow-xl"
        >
          Ambient Mode • Press any key to wake
        </div>
      )}
    </div>
  );
}
