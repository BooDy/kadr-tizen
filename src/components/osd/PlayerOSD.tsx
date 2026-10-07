import { useState, useEffect, useMemo, useContext } from 'react';
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
}: PlayerOSDProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const focusCtx = useContext(FocusContext);

  const hasSubtitles = Boolean(subtitles && subtitles.length > 0);

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

  if (!visible) return null;

  const progressPercent =
    durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;

  return (
    <div
      data-testid="player-osd"
      className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/60 p-12 flex flex-col justify-between pointer-events-none transition-opacity duration-300"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white drop-shadow-md">{title}</h2>
        <div className="flex items-center gap-6">
          {hasSubtitles && (
            focusCtx ? (
              <TVButton
                id="btn-subtitles"
                groupId="player-osd"
                variant={selectedSubtitleId ? 'primary' : 'secondary'}
                onClick={() => setIsPopupOpen(true)}
                onEnter={() => setIsPopupOpen(true)}
                data-testid="subtitles-button"
                aria-label="Subtitles"
                className="pointer-events-auto px-5 py-2.5 text-lg"
              >
                <span className="font-bold border border-current px-1.5 py-0.5 rounded text-xs">CC</span>
                <span>Subtitles</span>
              </TVButton>
            ) : (
              <button
                id="btn-subtitles"
                type="button"
                data-testid="subtitles-button"
                aria-label="Subtitles"
                onClick={() => setIsPopupOpen(true)}
                className={`pointer-events-auto px-5 py-2.5 rounded-xl font-semibold text-lg flex items-center gap-2 cursor-pointer transition-all duration-150 outline-none ${
                  selectedSubtitleId
                    ? 'bg-sky-500 text-white'
                    : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 focus:ring-4 focus:ring-sky-400/50'
                }`}
              >
                <span className="font-bold border border-current px-1.5 py-0.5 rounded text-xs">CC</span>
                <span>Subtitles</span>
              </button>
            )
          )}
          <div className="text-zinc-400 text-lg uppercase tracking-widest">{playerState}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="w-full h-3 bg-zinc-700/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-400 transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-zinc-300 font-mono text-lg">
          <span>{formatTime(positionMs)}</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>

      {isPopupOpen && (
        <div
          data-testid="subtitles-popup"
          role="dialog"
          aria-label="Subtitles Menu"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center pointer-events-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPopupOpen(false);
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-96 max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white tracking-wide">Subtitles</h3>
              <button
                type="button"
                data-testid="close-subtitles-popup"
                onClick={() => setIsPopupOpen(false)}
                className="text-zinc-400 hover:text-white text-xl p-2 rounded-lg cursor-pointer"
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
                        ? 'bg-sky-500 text-white tv-focus-ring ring-4 ring-sky-300'
                        : isSelected
                        ? 'bg-zinc-800 text-sky-400 border border-sky-500/40'
                        : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-600/30">
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
