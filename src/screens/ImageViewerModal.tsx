import { useEffect, useState, useRef, useCallback } from 'react';
import { FolderImage } from '../types/kadr';
import { useFocusContext } from '../navigation/FocusContext';
import { TVKeys } from '../navigation/keys';
import { Play, Pause, X } from 'lucide-react';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';
import { ApiClient } from '../api/client';

export interface ImageViewerModalProps {
  images: FolderImage[];
  initialIndex?: number;
  autoPlay?: boolean;
  serverUrl: string;
  onClose: () => void;
  token?: string;
  client?: ApiClient;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  if (i === 0) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function ImageViewerModal({
  images,
  initialIndex = 0,
  autoPlay = false,
  serverUrl,
  onClose,
  token,
  client,
}: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (!images || images.length === 0) return 0;
    return Math.max(0, Math.min(initialIndex, images.length - 1));
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isFilmstripFocused, setIsFilmstripFocused] = useState<boolean>(false);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isFilmstripFocusedRef = useRef(isFilmstripFocused);
  isFilmstripFocusedRef.current = isFilmstripFocused;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const imagesRef = useRef(images);
  imagesRef.current = images;

  const { pushTrap, popTrap } = useFocusContext();

  const unlockTokens = client?.getUnlockTokens ? client.getUnlockTokens() : [];

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
    if (!isPlaying || isFilmstripFocused || !images || images.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % images.length;
        currentIndexRef.current = next;
        return next;
      });
    }, 4000);

    return () => {
      clearInterval(timer);
    };
  }, [isPlaying, isFilmstripFocused, currentIndex, images]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    const activeThumb = thumbnailRefs.current[currentIndex];
    if (activeThumb && typeof activeThumb.scrollIntoView === 'function') {
      activeThumb.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [currentIndex]);

  // Remote keydown capture listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      const curImages = imagesRef.current;
      const count = curImages ? curImages.length : 0;

      // Any key activity resets auto-hide timer and displays controls
      resetControlsTimer();

      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (count > 0) {
          const nextIndex = (currentIndexRef.current - 1 + count) % count;
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
          if (isFilmstripFocusedRef.current) {
            thumbnailRefs.current[nextIndex]?.focus();
          }
        }
      } else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (count > 0) {
          const nextIndex = (currentIndexRef.current + 1) % count;
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
          if (isFilmstripFocusedRef.current) {
            thumbnailRefs.current[nextIndex]?.focus();
          }
        }
      } else if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!isFilmstripFocusedRef.current && count > 1) {
          isFilmstripFocusedRef.current = true;
          setIsFilmstripFocused(true);
          thumbnailRefs.current[currentIndexRef.current]?.focus();
        }
      } else if (code === TVKeys.UP || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isFilmstripFocusedRef.current) {
          isFilmstripFocusedRef.current = false;
          setIsFilmstripFocused(false);
          (document.activeElement as HTMLElement)?.blur();
        }
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isFilmstripFocusedRef.current) {
          isFilmstripFocusedRef.current = false;
          setIsFilmstripFocused(false);
          (document.activeElement as HTMLElement)?.blur();
        } else {
          setIsPlaying((prev) => !prev);
        }
      } else if (
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
        if (isFilmstripFocusedRef.current) {
          isFilmstripFocusedRef.current = false;
          setIsFilmstripFocused(false);
          (document.activeElement as HTMLElement)?.blur();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose, resetControlsTimer]);

  if (!images || images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex];
  const imageUrl = getAuthenticatedImageUrl(
    serverUrl,
    currentImage?.url || currentImage?.path,
    token,
    unlockTokens
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black flex items-center justify-center select-none overflow-hidden">
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
        className={`absolute top-0 left-0 right-0 p-8 bg-gradient-to-b from-[#2A0A0A]/90 via-[#2A0A0A]/40 to-transparent flex items-center justify-between z-10 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col gap-1 max-w-2xl">
          <h2 className="text-2xl font-bold text-[#F5E5E5] tracking-tight truncate">
            {currentImage?.name}
          </h2>
          <div className="text-sm font-medium text-[#F5E5E5]/80 flex items-center gap-3">
            <span>
              {currentIndex + 1} / {images.length}
            </span>
            {currentImage?.size_bytes ? (
              <>
                <span className="text-[#5C3C3C]">•</span>
                <span>{formatBytes(currentImage.size_bytes)}</span>
              </>
            ) : null}
          </div>
        </div>

        <button
          onClick={onClose}
          tabIndex={-1}
          aria-label="Close"
          className="p-3 rounded-full bg-[#3B1111] hover:bg-[#4A1616] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] transition-colors cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Filmstrip Carousel */}
      <div
        ref={filmstripRef}
        data-testid="filmstrip-carousel"
        className={`absolute bottom-24 left-0 right-0 px-8 flex items-center gap-3 overflow-x-auto scrollbar-none z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {images.map((img, idx) => {
          const thumbUrl = getAuthenticatedImageUrl(
            serverUrl,
            img.url || img.path,
            token,
            unlockTokens
          );
          const isActive = idx === currentIndex;
          return (
            <button
              key={img.path || idx}
              ref={(el) => {
                thumbnailRefs.current[idx] = el;
              }}
              data-testid={`filmstrip-thumb-${idx}`}
              tabIndex={isFilmstripFocused && isActive ? 0 : -1}
              onClick={() => {
                setCurrentIndex(idx);
                currentIndexRef.current = idx;
                setIsPlaying(false);
              }}
              className={`w-24 h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all duration-200 cursor-pointer ${
                isActive ? 'border-[#FF6B00]' : 'border-transparent opacity-60'
              }`}
            >
              {thumbUrl && (
                <img
                  src={thumbUrl}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-full object-cover"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom HUD Bar */}
      <div
        data-testid="hud-footer"
        className={`absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-[#2A0A0A]/90 via-[#2A0A0A]/40 to-transparent flex items-center justify-between z-10 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Status Indicator */}
        <div className="flex items-center gap-3 bg-[#3B1111]/90 backdrop-blur px-4 py-2 rounded-full border border-[rgba(245,229,229,0.08)]">
          {isPlaying ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B00] animate-pulse" />
              <Play className="w-4 h-4 fill-[#FF6B00] text-[#FF6B00]" />
              <span className="text-sm font-semibold text-[#FFB800]">Playing Slideshow (4s)</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-[#5C3C3C]" />
              <Pause className="w-4 h-4 fill-[#5C3C3C] text-[#5C3C3C]" />
              <span className="text-sm font-medium text-[#F5E5E5]/70">Paused</span>
            </>
          )}
        </div>

        {/* Remote Control Hints */}
        <div className="text-sm font-medium text-[#F5E5E5]/70 bg-[#3B1111]/90 backdrop-blur px-5 py-2 rounded-full border border-[rgba(245,229,229,0.08)]">
          {isFilmstripFocused
            ? '◄ / ► Scrub • ▲ / Enter Select • Back Exit Filmstrip'
            : '◄ / ► Navigate • ▼ Filmstrip • Enter / ⏯ Play/Pause • Back Exit'}
        </div>
      </div>
    </div>
  );
}
