import { useState, useEffect, useMemo, useContext } from 'react';
import { SkipBack, SkipForward } from 'lucide-react';
import { PlayerState } from '../../player/driver';
import { SubtitleTrack } from '../../types/kadr';
import { TVKeys } from '../../navigation/keys';
import { TVButton } from '../tv/TVButton';
import { FocusContext } from '../../navigation/FocusContext';

export interface PlayerOSDProps {
  title: string;
  playerState: PlayerState;
  positionMs: number;
  durationMs: number;
  visible: boolean;
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
}: PlayerOSDProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const focusCtx = useContext(FocusContext);

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

  const hasSubtitles = Boolean(
    (subtitles && subtitles.length > 0) || onOpenSubtitleModal || onOpenSubtitles
  );

  const options = useMemo(() => {
    if (!subtitles || subtitles.length === 0) return [];
    return [
      { id: null as number | null, label: 'Off' },
      ...subtitles.map((track) => ({
        id: track.id as number | null,
        label: track.title || track.language || `Track ${track.id}`,
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

  const progressPercent =
    durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;

  return (
    <div
      data-testid="player-osd"
      className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/60 p-12 flex flex-col justify-between pointer-events-none transition-opacity duration-300"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white drop-shadow-md">{title}</h2>
        <div className="text-[#5C3C3C] text-lg uppercase tracking-widest">{playerState}</div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-6">
          <div className="flex-1 flex flex-col gap-2">
            <div className="relative w-full h-3 bg-[#3B1111]/80 rounded-full">
              <div
                className="h-full bg-[#FF6B00] rounded-full transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-[#FFB800] rounded-full shadow-md transition-all duration-200 -ml-2.5"
                style={{ left: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[#F5E5E5]/80 font-mono text-lg">
              <span>{formatTime(positionMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </div>

          {(onPrevious || onNext || (playerState === 'paused' && hasSubtitles)) && (
            <div className="flex items-center gap-4 shrink-0 pb-6">
              {onPrevious &&
                (focusCtx ? (
                  <TVButton
                    id="btn-previous-episode"
                    groupId="player-osd"
                    order={1}
                    variant="secondary"
                    disabled={isPrevDisabled}
                    onClick={onPrevious}
                    onEnter={onPrevious}
                    onKeyDown={(e) => {
                      if (!isPrevDisabled && (e.key === 'Enter' || e.keyCode === TVKeys.ENTER)) {
                        e.preventDefault();
                        onPrevious?.();
                      }
                    }}
                    data-testid="player-osd-previous-btn"
                    aria-label="Previous"
                    className={`pointer-events-auto !px-6 !py-3 !text-xl font-bold rounded-2xl gap-3 ${
                      isPrevDisabled ? 'opacity-40 pointer-events-none' : ''
                    }`}
                  >
                    <SkipBack className="w-5 h-5" />
                    <span>Prev</span>
                  </TVButton>
                ) : (
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
                    className={`pointer-events-auto px-6 py-3 rounded-2xl font-bold text-xl flex items-center gap-3 transition-all duration-150 outline-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] ${
                      isPrevDisabled
                        ? 'opacity-40 pointer-events-none cursor-not-allowed'
                        : 'cursor-pointer hover:bg-[#4A1616] focus:ring-4 focus:ring-[#FFB800]/50'
                    }`}
                  >
                    <SkipBack className="w-5 h-5" />
                    <span>Prev</span>
                  </button>
                ))}

              {onNext &&
                (focusCtx ? (
                  <TVButton
                    id="btn-next-episode"
                    groupId="player-osd"
                    order={2}
                    variant="secondary"
                    disabled={isNextDisabled}
                    onClick={onNext}
                    onEnter={onNext}
                    onKeyDown={(e) => {
                      if (!isNextDisabled && (e.key === 'Enter' || e.keyCode === TVKeys.ENTER)) {
                        e.preventDefault();
                        onNext?.();
                      }
                    }}
                    data-testid="player-osd-next-btn"
                    aria-label="Next"
                    className={`pointer-events-auto !px-6 !py-3 !text-xl font-bold rounded-2xl gap-3 ${
                      isNextDisabled ? 'opacity-40 pointer-events-none' : ''
                    }`}
                  >
                    <SkipForward className="w-5 h-5" />
                    <span>Next</span>
                  </TVButton>
                ) : (
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
                    className={`pointer-events-auto px-6 py-3 rounded-2xl font-bold text-xl flex items-center gap-3 transition-all duration-150 outline-none bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] ${
                      isNextDisabled
                        ? 'opacity-40 pointer-events-none cursor-not-allowed'
                        : 'cursor-pointer hover:bg-[#4A1616] focus:ring-4 focus:ring-[#FFB800]/50'
                    }`}
                  >
                    <SkipForward className="w-5 h-5" />
                    <span>Next</span>
                  </button>
                ))}

              {playerState === 'paused' && hasSubtitles && (
                focusCtx ? (
                  <TVButton
                    id="btn-subtitles"
                    groupId="player-osd"
                    order={3}
                    variant={selectedSubtitleId ? 'primary' : 'secondary'}
                    onClick={handleOpenSubtitles}
                    onEnter={handleOpenSubtitles}
                    data-testid="subtitles-button"
                    aria-label="Subtitles"
                    className="pointer-events-auto !px-6 !py-3 !text-xl font-bold rounded-2xl gap-3"
                  >
                    <span className="font-bold border border-current px-2 py-0.5 rounded text-sm">CC</span>
                    <span>Subtitles</span>
                  </TVButton>
                ) : (
                  <button
                    id="btn-subtitles"
                    type="button"
                    data-testid="subtitles-button"
                    aria-label="Subtitles"
                    onClick={handleOpenSubtitles}
                    className={`pointer-events-auto px-6 py-3 rounded-2xl font-bold text-xl flex items-center gap-3 cursor-pointer transition-all duration-150 outline-none ${
                      selectedSubtitleId
                        ? 'bg-[#D43F15] text-[#F5E5E5]'
                        : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] hover:bg-[#4A1616] focus:ring-4 focus:ring-[#FFB800]/50'
                    }`}
                  >
                    <span className="font-bold border border-current px-2 py-0.5 rounded text-sm">CC</span>
                    <span>Subtitles</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
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
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] py-1">
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
                      isFocused
                        ? 'bg-[#FF6B00] text-white tv-focus-ring ring-4 ring-[#FFB800]/50'
                        : isSelected
                        ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40'
                        : 'bg-[#2A0A0A] text-[#F5E5E5]/80 hover:bg-[#4A1616] hover:text-white'
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF6B00]/30 text-[#FFB800] border border-[#FF6B00]/40">
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
