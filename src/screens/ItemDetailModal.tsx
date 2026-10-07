import { useEffect } from 'react';
import { MediaItemDetail } from '../api/items';
import { useFocusContext } from '../navigation/FocusContext';
import { TVButton } from '../components/tv/TVButton';
import { TVKeys } from '../navigation/keys';
import { Play, RotateCcw, X } from 'lucide-react';

export interface ItemDetailModalProps {
  isOpen: boolean;
  item: MediaItemDetail | null;
  serverUrl: string;
  onPlay: (itemId: string, startMs?: number) => void;
  onClose: () => void;
}

export function ItemDetailModal({
  isOpen,
  item,
  serverUrl,
  onPlay,
  onClose,
}: ItemDetailModalProps) {
  const { pushTrap, popTrap } = useFocusContext();

  useEffect(() => {
    if (isOpen) {
      pushTrap('item-detail-modal');
      return () => {
        popTrap();
      };
    }
  }, [isOpen, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const formatImageUrl = (path?: string) => {
    if (!path) return undefined;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanServer = serverUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanServer}${cleanPath}`;
  };

  const backdrop = formatImageUrl(item.backdrop_url);
  const poster = formatImageUrl(item.poster_url);

  const durationMins = item.duration_ms ? Math.round(item.duration_ms / 60000) : null;
  const resumeMins = item.resume_position_ms ? Math.round(item.resume_position_ms / 60000) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50 p-16"
    >
      {backdrop && (
        <img
          src={backdrop}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}
      <div className="relative w-full max-w-6xl flex gap-12 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-12 shadow-2xl">
        {poster && (
          <img
            src={poster}
            alt={item.title}
            className="w-80 h-[480px] object-cover rounded-2xl shadow-xl border border-zinc-700/50 shrink-0"
          />
        )}
        <div className="flex flex-col justify-between flex-1">
          <div>
            <div className="flex items-center gap-3 mb-2 text-zinc-400 font-semibold text-lg">
              {item.release_year && <span>{item.release_year}</span>}
              {durationMins && <span>• {durationMins}m</span>}
              {item.resolution && (
                <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-sky-400">
                  {item.resolution}
                </span>
              )}
            </div>
            <h2 className="text-5xl font-black text-white mb-6 leading-tight">{item.title}</h2>
            {item.overview && (
              <p className="text-zinc-300 text-xl leading-relaxed max-w-2xl line-clamp-6">
                {item.overview}
              </p>
            )}
          </div>

          <div className="flex gap-4 mt-8">
            {item.resume_position_ms && item.resume_position_ms > 0 ? (
              <>
                <TVButton
                  id="detail-resume-btn"
                  groupId="item-detail-modal"
                  order={1}
                  variant="primary"
                  onEnter={() => onPlay(item.id, item.resume_position_ms)}
                  onClick={() => onPlay(item.id, item.resume_position_ms)}
                  autoFocus
                >
                  <Play className="w-6 h-6 fill-current" />
                  Resume ({resumeMins}m)
                </TVButton>
                <TVButton
                  id="detail-restart-btn"
                  groupId="item-detail-modal"
                  order={2}
                  variant="secondary"
                  onEnter={() => onPlay(item.id, 0)}
                  onClick={() => onPlay(item.id, 0)}
                >
                  <RotateCcw className="w-6 h-6" /> Play from Beginning
                </TVButton>
              </>
            ) : (
              <TVButton
                id="detail-play-btn"
                groupId="item-detail-modal"
                order={1}
                variant="primary"
                onEnter={() => onPlay(item.id, 0)}
                onClick={() => onPlay(item.id, 0)}
                autoFocus
              >
                <Play className="w-6 h-6 fill-current" /> Play
              </TVButton>
            )}

            <TVButton
              id="detail-close-btn"
              groupId="item-detail-modal"
              order={3}
              variant="secondary"
              onEnter={onClose}
              onClick={onClose}
            >
              <X className="w-6 h-6" /> Back
            </TVButton>
          </div>
        </div>
      </div>
    </div>
  );
}
