import { useState, useEffect, useRef, type MutableRefObject } from 'react';
import { Globe, Lock, Check, X } from 'lucide-react';
import { ApiClient } from '../../api/client';
import {
  createPlaylist,
  updatePlaylist,
  PlaylistDetail,
  PlaylistSummary,
} from '../../api/playlists';
import { useFocusContext } from '../../navigation/FocusContext';
import { useFocusable, isTextInputElement } from '../../navigation/useFocusable';
import { TVKeys } from '../../navigation/keys';
import { PillButton } from '../tv/PillButton';

export interface CreateEditPlaylistModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  client: ApiClient;
  playlistId?: string;
  initialName?: string;
  initialDescription?: string;
  initialIsPublic?: boolean;
  onClose: () => void;
  onCreated?: (detail: PlaylistDetail) => void;
  onUpdated?: (summary: PlaylistSummary) => void;
}

const TRAP_ID = 'create-edit-playlist-modal';

interface CreateEditFocusBridgeProps {
  isOpen: boolean;
  onClose: () => void;
  setFocusedIdRef: MutableRefObject<((id: string | null) => void) | null>;
}

function CreateEditFocusBridge({
  isOpen,
  onClose,
  setFocusedIdRef,
}: CreateEditFocusBridgeProps) {
  const { pushTrap, popTrap, activeTrap, setFocusedId } = useFocusContext();
  setFocusedIdRef.current = setFocusedId;

  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    pushTrap(TRAP_ID);
    setFocusedId('playlist-form-name-input');
    return () => {
      popTrap(TRAP_ID);
    };
  }, [isOpen, pushTrap, popTrap, setFocusedId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTrapRef.current && activeTrapRef.current !== TRAP_ID) return;
      const target = e.target as HTMLElement | null;
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const isEditingInput = isTextInputElement(activeEl);
      const code = e.keyCode || e.which;

      if (
        (code === TVKeys.BACKSPACE || e.key === 'Backspace') &&
        (isEditingInput || isTextInputElement(target))
      ) {
        return;
      }

      if (isEditingInput && (code === TVKeys.IME_DONE || code === TVKeys.IME_CANCEL)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        activeEl.blur();
        return;
      }

      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isEditingInput) {
          activeEl.blur();
          return;
        }
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  return null;
}

export function CreateEditPlaylistModal({
  isOpen,
  mode,
  client,
  playlistId,
  initialName = '',
  initialDescription = '',
  initialIsPublic = false,
  onClose,
  onCreated,
  onUpdated,
}: CreateEditPlaylistModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFocusedIdRef = useRef<((id: string | null) => void) | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setIsPublic(initialIsPublic);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen, initialName, initialDescription, initialIsPublic]);

  const handleSubmit = async () => {
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();

    if (trimmedName.length < 1 || trimmedName.length > 120) {
      setError('Playlist name must be between 1 and 120 characters.');
      return;
    }
    if (trimmedDesc.length > 500) {
      setError('Description must be 500 characters or fewer.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        const detail = await createPlaylist(client, {
          name: trimmedName,
          description: trimmedDesc || undefined,
          is_public: isPublic,
        });
        onCreated?.(detail);
        onClose();
      } else if (playlistId) {
        const summary = await updatePlaylist(client, playlistId, {
          name: trimmedName,
          description: trimmedDesc,
          is_public: isPublic,
        });
        onUpdated?.(summary);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save playlist';
      setError(msg);
      setSubmitting(false);
    }
  };

  const nameFocus = useFocusable<HTMLInputElement>({
    id: 'playlist-form-name-input',
    groupId: TRAP_ID,
    order: 1,
    autoFocus: isOpen,
  });

  const descFocus = useFocusable<HTMLTextAreaElement>({
    id: 'playlist-form-desc-input',
    groupId: TRAP_ID,
    order: 2,
  });

  const publicFocus = useFocusable<HTMLButtonElement>({
    id: 'playlist-form-public-toggle',
    groupId: TRAP_ID,
    order: 3,
    onEnter: () => setIsPublic((prev) => !prev),
  });

  if (!isOpen) return null;

  const dialogTitle = mode === 'create' ? 'Create Playlist' : 'Edit Playlist';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dialogTitle}
      className="fixed inset-0 z-[75] bg-[#090a0f]/95 flex items-center justify-center p-12 select-none"
    >
      <CreateEditFocusBridge
        isOpen={isOpen}
        onClose={onClose}
        setFocusedIdRef={setFocusedIdRef}
      />
      <div className="w-full max-w-2xl bg-[#121318] border border-[rgba(255,122,24,0.25)] rounded-3xl p-10 shadow-2xl text-[#e3e1e9]">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{dialogTitle}</h2>
          <span className="font-mono text-xs uppercase text-[#ffb871] bg-[#281216] px-3 py-1 rounded border border-[#ff7a18]/30">
            {mode === 'create' ? 'New Queue' : 'Metadata'}
          </span>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor="playlist-form-name-input"
            className="block text-sm font-mono uppercase tracking-wider text-[#a8a29e]"
            style={{ marginBottom: '8px' }}
          >
            Playlist Name
          </label>
          <input
            ref={nameFocus.ref}
            id="playlist-form-name-input"
            type="text"
            maxLength={120}
            value={name}
            onFocus={() => setFocusedIdRef.current?.('playlist-form-name-input')}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sci-Fi Marathon"
            className={`w-full bg-[#1a1b21] px-5 py-4 rounded-xl text-xl text-white outline-none ${
              nameFocus.isFocused
                ? 'border-2 border-[#ff7a18] tv-focus-ring'
                : 'border border-[rgba(255,255,255,0.12)]'
            }`}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor="playlist-form-desc-input"
            className="block text-sm font-mono uppercase tracking-wider text-[#a8a29e]"
            style={{ marginBottom: '8px' }}
          >
            Description (Optional)
          </label>
          <textarea
            ref={descFocus.ref}
            id="playlist-form-desc-input"
            maxLength={500}
            rows={3}
            value={description}
            onFocus={() => setFocusedIdRef.current?.('playlist-form-desc-input')}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes about this playlist..."
            className={`w-full bg-[#1a1b21] px-5 py-3.5 rounded-xl text-lg text-white outline-none resize-none ${
              descFocus.isFocused
                ? 'border-2 border-[#ff7a18] tv-focus-ring'
                : 'border border-[rgba(255,255,255,0.12)]'
            }`}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <button
            ref={publicFocus.ref}
            id="playlist-form-public-toggle"
            type="button"
            tabIndex={-1}
            aria-pressed={isPublic}
            onClick={() => setIsPublic((prev) => !prev)}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-xl text-left cursor-pointer outline-none ${
              publicFocus.isFocused
                ? 'bg-[#292a2f] border-2 border-[#ff7a18] tv-focus-ring'
                : 'bg-[#1a1b21] border border-[rgba(255,255,255,0.12)]'
            }`}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {isPublic ? (
                <Globe
                  className="w-6 h-6 text-[#10b981] shrink-0"
                  style={{ marginRight: '14px' }}
                />
              ) : (
                <Lock
                  className="w-6 h-6 text-[#ffb871] shrink-0"
                  style={{ marginRight: '14px' }}
                />
              )}
              <div>
                <div className="text-lg font-bold text-white">
                  {isPublic ? 'Shared on Server (Public)' : 'Private Playlist'}
                </div>
                <div className="text-sm text-[#a8a29e]">
                  {isPublic
                    ? 'Visible to all profiles on this Kadr server'
                    : 'Only visible to your profile'}
                </div>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded font-mono text-xs font-bold uppercase ${
                isPublic
                  ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                  : 'bg-[#292a2f] text-[#a8a29e] border border-[rgba(255,255,255,0.1)]'
              }`}
            >
              {isPublic ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="px-4 py-3 rounded-xl bg-[#D43F15]/15 border border-[#D43F15]/40 text-[#ffb871] text-base"
            style={{ marginBottom: '20px' }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <PillButton
            id="playlist-form-submit-btn"
            groupId={TRAP_ID}
            order={4}
            variant="primary"
            icon={<Check className="w-5 h-5" />}
            marginRight="16px"
            onSelect={handleSubmit}
          >
            {submitting
              ? 'Saving...'
              : mode === 'create'
              ? 'Create Playlist'
              : 'Save Changes'}
          </PillButton>
          <PillButton
            id="playlist-form-cancel-btn"
            groupId={TRAP_ID}
            order={5}
            variant="secondary"
            icon={<X className="w-5 h-5" />}
            marginRight="0px"
            onSelect={onClose}
          >
            Cancel
          </PillButton>
        </div>
      </div>
    </div>
  );
}
