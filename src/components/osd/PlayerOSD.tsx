import { useState, useEffect, useMemo } from 'react';
import { SkipBack, SkipForward } from 'lucide-react';
import { PlayerState } from '../../player/driver';
import { StoryboardTileCrop } from '../../player/storyboard';
import { AudioStreamInfo, SubtitleTrack } from '../../types/kadr';
import { formatAudioTrackLabel } from '../../player/audioPreferences';
import { formatSubtitleTrackLabel } from '../../player/subtitles';
import { TVKeys } from '../../navigation/keys';
import { SeekThumbnailPreview } from './SeekThumbnailPreview';

export type PlayerOsdFocusItem = 'progress' | 'prev' | 'next' | 'audio' | 'subtitles';

export interface PlayerOSDProps {
  title: string;
  playerState: PlayerState;
  positionMs: number;
  durationMs: number;
  visible: boolean;
  isLive?: boolean;
  isSeeking?: boolean;
  seekPreviewMs?: number;
  spriteCrop?: StoryboardTileCrop | null;
  frameUrl?: string | null;
  audioTracks?: AudioStreamInfo[];
  selectedAudioTrackIndex?: number;
  onOpenAudioModal?: () => void;
  subtitles?: SubtitleTrack[];
  selectedSubtitleId?: number | null;
  onSelectSubtitle?: (id: number | null) => void;
  onPopupOpenChange?: (isOpen: boolean) => void;
  onOpenSubtitleModal?: () => void;
  onOpenSubtitles?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  focusedItem?: PlayerOsdFocusItem;
}

export function formatTime(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function PlayerOSD({
  title,
  playerState,
  positionMs,
  durationMs,
  visible,
  isLive = false,
  isSeeking = false,
  seekPreviewMs,
  spriteCrop = null,
  frameUrl = null,
  audioTracks,
  selectedAudioTrackIndex,
  onOpenAudioModal,
  subtitles,
  selectedSubtitleId,
  onSelectSubtitle,
  onPopupOpenChange,
  onOpenSubtitleModal,
  onOpenSubtitles,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  focusedItem = 'progress',
}: PlayerOSDProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const handleOpenSubtitles = () => {
    if (onOpenSubtitleModal) {
      onOpenSubtitleModal();
    } else if (onOpenSubtitles) {
      onOpenSubtitles();
    } else {
      setIsPopupOpen(true);
    }
  };

  useEffect(() => {
    onPopupOpenChange?.(isPopupOpen);
  }, [isPopupOpen, onPopupOpenChange]);

  const hasAudio = Boolean(audioTracks && audioTracks.length >= 2 && onOpenAudioModal);
  const activeAudioLanguageTag = useMemo(() => {
    if (!audioTracks || audioTracks.length === 0) return '';
    const activeTrack =
      (selectedAudioTrackIndex !== undefined
        ? audioTracks.find((t) => t.audio_index === selectedAudioTrackIndex)
        : undefined) ??
      audioTracks.find((t) => t.is_default) ??
      audioTracks[0];
    if (!activeTrack) return '';
    const { languageBadge } = formatAudioTrackLabel(activeTrack);
    return languageBadge && languageBadge !== 'UND' ? languageBadge : '';
  }, [audioTracks, selectedAudioTrackIndex]);

  const hasSubtitles = Boolean(
    (subtitles && subtitles.length > 0) || onOpenSubtitleModal || onOpenSubtitles
  );

  const options = useMemo(() => {
    if (!subtitles || subtitles.length === 0) return [];
    return [
      { id: null as number | null, label: 'Off', isEmbedded: false, isForced: false },
      ...subtitles.map((track) => ({
        id: track.id as number | null,
        label: formatSubtitleTrackLabel(track, false),
        isEmbedded: track.source === 'embedded',
        isForced: Boolean(track.is_forced),
      })),
    ];
  }, [subtitles]);

  const [focusedIndex, setFocusedIndex] = useState(0);

  // Sync focused index when opening popup or selection changes
  useEffect(() => {
    if (isPopupOpen) {
      const idx = options.findIndex((opt) => opt.id === (selectedSubtitleId ?? null));
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
  }, [isPopupOpen, selectedSubtitleId, options]);

  // Spatial / keyboard navigation within subtitle popup
  useEffect(() => {
    if (!isPopupOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsPopupOpen(false);
        return;
      }

      if (code === TVKeys.UP || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        return;
      }

      if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        return;
      }

      if (code === TVKeys.ENTER || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const selected = options[focusedIndex];
        if (selected) {
          onSelectSubtitle?.(selected.id);
        }
        setIsPopupOpen(false);
        return;
      }

      if (
        code === TVKeys.LEFT ||
        code === TVKeys.RIGHT ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isPopupOpen, focusedIndex, options, onSelectSubtitle]);

  if (!visible && !isPopupOpen) return null;

  const isPrevDisabled = hasPrevious === false;
  const isNextDisabled = hasNext === false;
  const hasControlsRow = Boolean(onPrevious || onNext || hasAudio || hasSubtitles);
  const showLiveMode = Boolean(isLive || durationMs < 0);

  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const safePositionMs = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  const previewMs =
    seekPreviewMs !== undefined && Number.isFinite(seekPreviewMs)
      ? Math.max(0, seekPreviewMs)
      : safePositionMs;

  const progressPercent =
    safeDurationMs > 0 ? Math.min(100, Math.max(0, (safePositionMs / safeDurationMs) * 100)) : 0;
  const seekPercent =
    safeDurationMs > 0 ? Math.min(100, Math.max(0, (previewMs / safeDurationMs) * 100)) : 0;

  return (
    <div
      data-testid="player-osd"
      className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/60 p-12 flex flex-col justify-between pointer-events-none"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white drop-shadow-md">{title}</h2>
        {playerState !== 'buffering' && (
          <div className="text-[#5C3C3C] text-lg uppercase tracking-widest">{playerState}</div>
        )}
      </div>

      <div data-testid="player-osd-bottom" className="flex flex-col">
        <div
          id="player-progress-bar"
          data-testid="player-progress-bar"
          data-focused={focusedItem === 'progress' ? 'true' : 'false'}
          className={`relative w-full flex flex-col rounded-2xl p-3 -mx-3 transition-all duration-150 ${
            hasControlsRow ? 'mb-5' : ''
          } ${
            focusedItem === 'progress'
              ? 'bg-[#3B1111]/40 ring-2 ring-[#FFB800]/60'
              : ''
          }`}
        >
          {isSeeking && !showLiveMode && (
            <SeekThumbnailPreview
              positionMs={previewMs}
              durationMs={safeDurationMs}
              progressPercent={seekPercent}
              spriteCrop={spriteCrop}
              frameUrl={frameUrl}
            />
          )}

          {showLiveMode ? (
            <>
              <div className="relative w-full h-3 bg-[#3B1111]/80 rounded-full mb-2">
                <div
                  className="h-full bg-[#FF6B00] rounded-full"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="flex justify-between items-center text-[#F5E5E5]/80 font-mono text-lg">
                <span
                  data-testid="player-live-badge"
                  className="inline-flex items-center px-3 py-0.5 rounded-full bg-[#D43F15]/90 text-white text-sm font-bold uppercase tracking-widest"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white mr-2 inline-block" />
                  LIVE
                </span>
                {safePositionMs > 0 && <span>{formatTime(safePositionMs)}</span>}
              </div>
            </>
          ) : (
            <>
              <div className="relative w-full h-3 bg-[#3B1111]/80 rounded-full mb-2">
                <div
                  className="h-full bg-[#FF6B00] rounded-full transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className={`absolute top-1/2 -translate-y-1/2 bg-[#FFB800] rounded-full shadow-md transition-all duration-200 ${
                    focusedItem === 'progress'
                      ? 'w-6 h-6 -ml-3 ring-4 ring-[#FFB800]/40 scale-110'
                      : 'w-5 h-5 -ml-2.5'
                  }`}
                  style={{ left: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[#F5E5E5]/80 font-mono text-lg">
                <span>{formatTime(safePositionMs)}</span>
                <span>{formatTime(safeDurationMs)}</span>
              </div>
            </>
          )}
        </div>

        {hasControlsRow && (
          <div
            data-testid="player-osd-controls"
            className="flex items-center"
          >
            {onPrevious && (
              <button
                id="btn-previous-episode"
                type="button"
                data-testid="player-osd-previous-btn"
                aria-label="Previous"
                disabled={isPrevDisabled}
                onClick={!isPrevDisabled ? onPrevious : undefined}
                onKeyDown={(e) => {
                  if (!isPrevDisabled && (e.key === 'Enter' || e.keyCode === TVKeys.ENTER)) {
                    e.preventDefault();
                    onPrevious?.();
                  }
                }}
                className={`pointer-events-auto px-6 py-3 rounded-2xl font-bold text-xl flex items-center transition-all duration-150 outline-none select-none ${
                  onNext || hasAudio || hasSubtitles ? 'mr-4' : ''
                } ${
                  focusedItem === 'prev' && !isPrevDisabled
                    ? 'bg-[#4A1616] text-white tv-focus-ring'
                    : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]'
                } ${
                  isPrevDisabled
                    ? 'opacity-40 pointer-events-none cursor-not-allowed'
                    : 'cursor-pointer hover:bg-[#4A1616]'
                }`}
              >
                <SkipBack className="w-5 h-5 mr-3" />
                <span>Prev</span>
              </button>
            )}

            {onNext && (
              <button
                id="btn-next-episode"
                type="button"
                data-testid="player-osd-next-btn"
                aria-label="Next"
                disabled={isNextDisabled}
                onClick={!isNextDisabled ? onNext : undefined}
                onKeyDown={(e) => {
                  if (!isNextDisabled && (e.key === 'Enter' || e.keyCode === TVKeys.ENTER)) {
                    e.preventDefault();
                    onNext?.();
                  }
                }}
                className={`pointer-events-auto px-6 py-3 rounded-2xl font-bold text-xl flex items-center transition-all duration-150 outline-none select-none ${
                  hasAudio || hasSubtitles ? 'mr-4' : ''
                } ${
                  focusedItem === 'next' && !isNextDisabled
                    ? 'bg-[#4A1616] text-white tv-focus-ring'
                    : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]'
                } ${
                  isNextDisabled
                    ? 'opacity-40 pointer-events-none cursor-not-allowed'
                    : 'cursor-pointer hover:bg-[#4A1616]'
                }`}
              >
                <SkipForward className="w-5 h-5 mr-3" />
                <span>Next</span>
              </button>
            )}

            {hasAudio && (
              <button
                id="btn-audio"
                type="button"
                data-testid="audio-button"
                aria-label="Audio"
                onClick={() => onOpenAudioModal?.()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.keyCode === TVKeys.ENTER) {
                    e.preventDefault();
                    onOpenAudioModal?.();
                  }
                }}
                className={`pointer-events-auto px-6 py-3 rounded-2xl font-bold text-xl flex items-center cursor-pointer transition-all duration-150 outline-none select-none ${
                  hasSubtitles ? 'mr-4' : ''
                } ${
                  focusedItem === 'audio'
                    ? 'bg-[#4A1616] text-white tv-focus-ring'
                    : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] hover:bg-[#4A1616]'
                }`}
              >
                <span className="font-bold border border-current px-2 py-0.5 rounded text-sm mr-3">
                  AUDIO
                </span>
                <span>Audio</span>
                {activeAudioLanguageTag && (
                  <span className="ml-2 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-[#FFB800]">
                    {activeAudioLanguageTag}
                  </span>
                )}
              </button>
            )}

            {hasSubtitles && (
              <button
                id="btn-subtitles"
                type="button"
                data-testid="subtitles-button"
                aria-label="Subtitles"
                onClick={handleOpenSubtitles}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.keyCode === TVKeys.ENTER) {
                    e.preventDefault();
                    handleOpenSubtitles();
                  }
                }}
                className={`pointer-events-auto px-6 py-3 rounded-2xl font-bold text-xl flex items-center cursor-pointer transition-all duration-150 outline-none select-none ${
                  focusedItem === 'subtitles'
                    ? selectedSubtitleId
                      ? 'bg-[#FF6B00] text-white tv-focus-ring'
                      : 'bg-[#4A1616] text-white tv-focus-ring'
                    : selectedSubtitleId
                    ? 'bg-[#D43F15] text-[#F5E5E5]'
                    : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] hover:bg-[#4A1616]'
                }`}
              >
                <span className="font-bold border border-current px-2 py-0.5 rounded text-sm mr-3">CC</span>
                <span>Subtitles</span>
              </button>
            )}
          </div>
        )}
      </div>

      {isPopupOpen && (
        <div
          data-testid="subtitles-popup"
          role="dialog"
          aria-label="Subtitles Menu"
          className="fixed inset-0 z-50 bg-[#2A0A0A]/85 backdrop-blur-sm flex items-center justify-center pointer-events-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPopupOpen(false);
          }}
        >
          <div className="bg-[#3B1111] border border-[rgba(245,229,229,0.08)] rounded-3xl p-8 w-96 max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-[#F5E5E5] tracking-wide">Subtitles</h3>
              <button
                type="button"
                data-testid="close-subtitles-popup"
                onClick={() => setIsPopupOpen(false)}
                className="text-[#5C3C3C] hover:text-[#F5E5E5] text-xl p-2 rounded-lg cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col overflow-y-auto max-h-[60vh] py-1">
              {options.map((option, index) => {
                const isSelected = option.id === (selectedSubtitleId ?? null);
                const isFocused = focusedIndex === index;
                return (
                  <button
                    key={option.id ?? 'off'}
                    type="button"
                    data-testid={`subtitle-option-${option.id ?? 'off'}`}
                    onClick={() => {
                      onSelectSubtitle?.(option.id);
                      setIsPopupOpen(false);
                    }}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={`w-full px-5 py-3 rounded-xl font-semibold text-lg flex items-center justify-between text-left transition-all duration-150 cursor-pointer select-none outline-none ${
                      index < options.length - 1 ? 'mb-2' : ''
                    } ${
                      isFocused
                        ? 'bg-[#FF6B00] text-white tv-focus-ring ring-4 ring-[#FFB800]/50'
                        : isSelected
                        ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40'
                        : 'bg-[#2A0A0A] text-[#F5E5E5]/80 hover:bg-[#4A1616] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center">
                      <span>{option.label}</span>
                      {option.isEmbedded && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-white/10 text-[#F5E5E5]/80">
                          Embedded
                        </span>
                      )}
                      {option.isForced && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-[#D43F15]/25 text-[#FF6B00]">
                          Forced
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="ml-2 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF6B00]/30 text-[#FFB800] border border-[#FF6B00]/40">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
