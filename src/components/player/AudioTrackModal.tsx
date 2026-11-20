import { useContext, useEffect, useMemo, useRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { Check, Volume2, X } from 'lucide-react';
import type { AudioStreamInfo } from '../../types/kadr';
import { formatAudioTrackLabel } from '../../player/audioPreferences';
import { FocusContext } from '../../navigation/FocusContext';
import { TVKeys } from '../../navigation/keys';
import { TVButton } from '../tv/TVButton';

export interface AudioTrackModalProps {
  isOpen: boolean;
  audioTracks: AudioStreamInfo[];
  selectedAudioTrackIndex: number;
  onSelectAudioTrack: (audioIndex: number) => void;
  onClose: () => void;
}

const TRAP_ID = 'audio-modal';

interface AudioModalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  order?: number;
  variant?: 'primary' | 'secondary' | 'danger' | 'nav-active' | 'nav-inactive';
  onEnter?: () => void;
  'data-testid'?: string;
}

function AudioModalButton({
  id,
  order,
  variant = 'secondary',
  onClick,
  onEnter,
  className = '',
  children,
  ...rest
}: AudioModalButtonProps) {
  const focusCtx = useContext(FocusContext);
  if (focusCtx) {
    return (
      <TVButton
        id={id}
        groupId={TRAP_ID}
        order={order}
        variant={variant}
        onClick={onClick}
        onEnter={onEnter || (() => onClick?.({} as MouseEvent<HTMLButtonElement>))}
        className={className}
        {...rest}
      >
        {children}
      </TVButton>
    );
  }

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Full-screen TV-accessible modal for selecting among embedded audio tracks.
 * Uses physical margins (no flex `gap-*`) and avoids `backdrop-blur-*` for Tizen AVPlay performance.
 */
export function AudioTrackModal({
  isOpen,
  audioTracks,
  selectedAudioTrackIndex,
  onSelectAudioTrack,
  onClose,
}: AudioTrackModalProps) {
  const focusCtx = useContext(FocusContext);
  const pushTrap = focusCtx?.pushTrap;
  const popTrap = focusCtx?.popTrap;
  const setFocusedId = focusCtx?.setFocusedId;
  const getFocusedId = focusCtx?.getFocusedId;
  const getActiveTrap = focusCtx?.getActiveTrap;
  const activeTrap = focusCtx?.activeTrap ?? null;
  const focusedId = focusCtx?.focusedId ?? null;

  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const audioTracksRef = useRef(audioTracks);
  audioTracksRef.current = audioTracks;
  const selectedIndexRef = useRef(selectedAudioTrackIndex);
  selectedIndexRef.current = selectedAudioTrackIndex;

  const focusOrderIds = useMemo(
    () => [
      ...audioTracks.map((t) => `audio-track-btn-${t.audio_index}`),
      'audio-modal-close-btn',
    ],
    [audioTracks]
  );

  // Manage FocusContext trap and initial focus on modal open
  useEffect(() => {
    if (!isOpen) return;
    pushTrap?.(TRAP_ID);

    const tracks = audioTracksRef.current;
    const activeTrack = tracks.find((t) => t.audio_index === selectedIndexRef.current);
    const initialId = activeTrack
      ? `audio-track-btn-${activeTrack.audio_index}`
      : tracks.length > 0
      ? `audio-track-btn-${tracks[0].audio_index}`
      : 'audio-modal-close-btn';

    setFocusedId?.(initialId);
    if (typeof document !== 'undefined') {
      document.getElementById(initialId)?.focus();
    }

    return () => {
      popTrap?.(TRAP_ID);
    };
  }, [isOpen, pushTrap, popTrap, setFocusedId]);

  // Capture-phase key handler for Back dismissal and Up/Down wrap-around navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (focusCtx) {
        const currentTrap = getActiveTrap?.() ?? activeTrapRef.current;
        if (currentTrap !== TRAP_ID) return;
      }

      const code = e.keyCode || e.which;

      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }

      if (
        code === TVKeys.UP ||
        code === TVKeys.DOWN ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (focusOrderIds.length === 0) return;

        const currentId =
          getFocusedId?.() ??
          focusedIdRef.current ??
          (typeof document !== 'undefined' ? document.activeElement?.id ?? null : null);
        const currentIdx = currentId ? focusOrderIds.indexOf(currentId) : -1;
        const isDown = code === TVKeys.DOWN || e.key === 'ArrowDown';
        const nextIdx =
          currentIdx === -1
            ? 0
            : isDown
            ? (currentIdx + 1) % focusOrderIds.length
            : (currentIdx - 1 + focusOrderIds.length) % focusOrderIds.length;
        const nextId = focusOrderIds[nextIdx];

        setFocusedId?.(nextId);
        if (typeof document !== 'undefined') {
          document.getElementById(nextId)?.focus();
        }
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
  }, [isOpen, focusCtx, focusOrderIds, getActiveTrap, getFocusedId, setFocusedId]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Audio Tracks"
      data-testid="audio-track-modal"
      data-modal-overlay="true"
      className="fixed inset-0 bg-[#0e0f14]/90 z-[70] flex items-center justify-center p-8 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[760px] max-w-[90vw] max-h-[82vh] bg-[#121318] border border-[rgba(245,229,229,0.12)] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[rgba(245,229,229,0.08)] bg-[#1a1b22]">
          <h2 className="text-2xl font-black text-[#F5E5E5] flex items-center">
            <Volume2 className="w-7 h-7 text-[#FF6B00] mr-3" />
            <span>Audio Track</span>
          </h2>
          <span className="text-sm font-semibold text-[#F5E5E5]/60">
            {audioTracks.length} {audioTracks.length === 1 ? 'track' : 'tracks'}
          </span>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-none">
          {audioTracks.map((track, idx) => {
            const isSelected = track.audio_index === selectedAudioTrackIndex;
            const { primaryLabel, codecBadge, isDefault, isCommentary } =
              formatAudioTrackLabel(track);
            const btnId = `audio-track-btn-${track.audio_index}`;

            return (
              <AudioModalButton
                key={track.audio_index}
                id={btnId}
                data-testid={btnId}
                order={idx + 1}
                variant={isSelected ? 'primary' : 'secondary'}
                onClick={() => {
                  onSelectAudioTrack(track.audio_index);
                  onClose();
                }}
                className={`w-full !flex !items-center !justify-between !px-6 !py-4 !rounded-2xl font-bold !text-lg border transition cursor-pointer text-left ${
                  idx < audioTracks.length - 1 ? 'mb-2.5' : ''
                } ${
                  isSelected
                    ? '!bg-[#FF6B00]/20 !border-[#FF6B00] !text-[#FF6B00]'
                    : '!bg-[#1c1d26] !border-[rgba(245,229,229,0.08)] !text-[#F5E5E5] hover:!bg-[#262733]'
                }`}
              >
                <div className="flex items-center min-w-0 mr-3">
                  <span className="truncate">{primaryLabel}</span>
                  {codecBadge && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-white/10 text-[#F5E5E5]/85 font-semibold shrink-0">
                      {codecBadge}
                    </span>
                  )}
                  {isDefault && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-[#FFB800]/20 text-[#FFB800] font-semibold shrink-0">
                      Default
                    </span>
                  )}
                  {isCommentary && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-[#D43F15]/25 text-[#FF8533] font-semibold shrink-0">
                      Commentary
                    </span>
                  )}
                </div>
                {isSelected && (
                  <div className="flex items-center shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF6B00]/25 text-[#FFB800] border border-[#FF6B00]/40 mr-2">
                      Active
                    </span>
                    <Check className="w-5 h-5" />
                  </div>
                )}
              </AudioModalButton>
            );
          })}
        </div>

        {/* Footer Close */}
        <div className="px-8 py-4 border-t border-[rgba(245,229,229,0.08)] bg-[#1a1b22] flex justify-end">
          <AudioModalButton
            id="audio-modal-close-btn"
            data-testid="audio-modal-close-btn"
            order={audioTracks.length + 1}
            variant="secondary"
            aria-label="Close"
            onClick={onClose}
            className="!px-5 !py-2.5 !rounded-xl !text-base font-bold !bg-[#262733] !border !border-[rgba(245,229,229,0.1)] !text-[#F5E5E5]/85 hover:!text-white !flex !items-center"
          >
            <X className="w-4 h-4 mr-2" />
            <span>Close</span>
          </AudioModalButton>
        </div>
      </div>
    </div>
  );
}
