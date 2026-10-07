import { useEffect, useState, useRef, useCallback } from 'react';
import { FolderImage } from '../types/kadr';
import { useFocusContext } from '../navigation/FocusContext';
import { TVKeys } from '../navigation/keys';
import { Play, Pause, X } from 'lucide-react';

export interface ImageViewerModalProps {
  images: FolderImage[];
  initialIndex?: number;
  autoPlay?: boolean;
  serverUrl: string;
  onClose: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  if (i === 0) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatImageUrl(serverUrl: string, path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanServer = serverUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanServer}${cleanPath}`;
}

export function ImageViewerModal({
  images,
  initialIndex = 0,
  autoPlay = false,
  serverUrl,
  onClose,
}: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (!images || images.length === 0) return 0;
    return Math.max(0, Math.min(initialIndex, images.length - 1));
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [showControls, setShowControls] = useState<boolean>(true);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pushTrap, popTrap } = useFocusContext();

  // Focus trap lifecycle
  useEffect(() => {
    pushTrap('image-viewer-modal');
    return () => {
      popTrap();
    };
  }, [pushTrap, popTrap]);

  // Controls auto-hide timer (3 seconds)
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimer]);

  // Slideshow auto-advance timer (4 seconds)
  useEffect(() => {
    if (!isPlaying || !images || images.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 4000);

    return () => {
      clearInterval(timer);
    };
  }, [isPlaying, currentIndex, images]);

  // Remote keydown capture listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      // Any key activity resets auto-hide timer and displays controls
      resetControlsTimer();

      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (images && images.length > 0) {
          setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
        }
      } else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (images && images.length > 0) {
          setCurrentIndex((prev) => (prev + 1) % images.length);
        }
      } else if (
        code === TVKeys.ENTER ||
        e.key === 'Enter' ||
        code === TVKeys.PLAY_PAUSE ||
        code === TVKeys.PLAY ||
        code === TVKeys.PAUSE ||
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaPause'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIsPlaying((prev) => !prev);
      } else if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [images, onClose, resetControlsTimer]);

  if (!images || images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex];
  const imageUrl = formatImageUrl(serverUrl, currentImage?.url || currentImage?.path);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden">
      {/* Centered Image */}
      {imageUrl && (
        <img
          key={currentImage?.path || currentIndex}
          src={imageUrl}
          alt={currentImage?.name || `Image ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain transition-opacity duration-300"
        />
      )}

      {/* Top HUD Bar */}
      <div
        data-testid="hud-header"
        className={`absolute top-0 left-0 right-0 p-8 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between z-10 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col gap-1 max-w-2xl">
          <h2 className="text-2xl font-bold text-white tracking-tight truncate">
            {currentImage?.name}
          </h2>
          <div className="text-sm font-medium text-zinc-300 flex items-center gap-3">
            <span>
              {currentIndex + 1} / {images.length}
            </span>
            {currentImage?.size_bytes ? (
              <>
                <span className="text-zinc-500">•</span>
                <span>{formatBytes(currentImage.size_bytes)}</span>
              </>
            ) : null}
          </div>
        </div>

        <button
          onClick={onClose}
          tabIndex={-1}
          aria-label="Close"
          className="p-3 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom HUD Bar */}
      <div
        data-testid="hud-footer"
        className={`absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between z-10 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Status Indicator */}
        <div className="flex items-center gap-3 bg-zinc-900/80 backdrop-blur px-4 py-2 rounded-full border border-zinc-700/50">
          {isPlaying ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <Play className="w-4 h-4 fill-emerald-400 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">Playing Slideshow (4s)</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
              <Pause className="w-4 h-4 fill-zinc-400 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-300">Paused</span>
            </>
          )}
        </div>

        {/* Remote Control Hints */}
        <div className="text-sm font-medium text-zinc-400 bg-zinc-900/80 backdrop-blur px-5 py-2 rounded-full border border-zinc-700/50">
          ◄ / ► Navigate • Enter / ⏯ Play/Pause • Back Exit
        </div>
      </div>
    </div>
  );
}
